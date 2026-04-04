-- ============================================================
-- Beatriz Lopes Privacy — Schema v3 (produção)
-- Execute no Supabase SQL Editor
-- Idempotente: pode rodar mais de uma vez com segurança
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- TABELAS
-- ============================================================

create table if not exists public.perfis (
  id                uuid        primary key references auth.users(id) on delete cascade,
  email             text,
  nome              text,
  usuario           text,
  telegram          text,
  bio               text,
  assinante         boolean     not null default false,
  plano             text,
  assinatura_inicio timestamptz,
  assinatura_fim    timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create table if not exists public.pedidos_acesso (
  id            uuid          primary key default uuid_generate_v4(),
  user_id       uuid          not null references auth.users(id) on delete cascade,
  plano         text          not null default 'Vitalício',
  valor         numeric(10,2) not null default 5.90,
  status        text          not null default 'pendente'
                              check (status in ('pendente', 'aprovado', 'cancelado')),
  criado_em     timestamptz   not null default now(),
  atualizado_em timestamptz   not null default now()
);

-- ============================================================
-- FUNÇÃO: cria perfil ao registrar novo usuário
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (
    id, email, nome, usuario, telegram, criado_em, atualizado_em
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1)),
    nullif(trim(coalesce(new.raw_user_meta_data->>'telegram', '')), ''),
    now(),
    now()
  )
  on conflict (id) do update
  set email         = excluded.email,
      nome          = coalesce(excluded.nome, public.perfis.nome),
      usuario       = coalesce(excluded.usuario, public.perfis.usuario),
      telegram      = coalesce(excluded.telegram, public.perfis.telegram),
      atualizado_em = now();
  return new;
exception
  when others then
    -- Nunca deixa o registro de auth falhar por causa do perfil
    raise warning 'handle_new_user falhou para %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- FUNÇÃO: atualiza atualizado_em automaticamente
-- ============================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists perfis_touch_updated_at on public.perfis;
create trigger perfis_touch_updated_at
  before update on public.perfis
  for each row execute procedure public.touch_updated_at();

drop trigger if exists pedidos_touch_updated_at on public.pedidos_acesso;
create trigger pedidos_touch_updated_at
  before update on public.pedidos_acesso
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- FUNÇÃO: bloqueia atualização de campos sensíveis por usuário
-- comum via client anon/authenticated.
-- Service role (backend Cloudflare) passa livre.
--
-- NOTA: current_user retorna o papel do executor da função.
-- Para chamadas REST Supabase com anon/authenticated key,
-- o current_user é 'anon' ou 'authenticated'.
-- Para service_role key é 'service_role'.
-- Usamos current_user (não current_setting) para ser preciso.
-- ============================================================

create or replace function public.block_sensitive_profile_updates()
returns trigger
language plpgsql
security invoker
as $$
begin
  -- Permite service_role, postgres e supabase_admin sem restrição
  if current_user in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  -- Bloqueia tentativa de alterar campos de assinatura via usuário comum
  if (new.assinante         is distinct from old.assinante)
  or (new.plano             is distinct from old.plano)
  or (new.assinatura_inicio is distinct from old.assinatura_inicio)
  or (new.assinatura_fim    is distinct from old.assinatura_fim) then
    raise exception 'Operação não permitida.'
      using hint = 'Campos de assinatura só podem ser alterados pelo sistema.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_sensitive_profile_updates on public.perfis;
create trigger prevent_sensitive_profile_updates
  before update on public.perfis
  for each row execute procedure public.block_sensitive_profile_updates();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.perfis         enable row level security;
alter table public.pedidos_acesso enable row level security;

-- Perfis: usuário lê apenas o próprio perfil
drop policy if exists "perfis_select_own" on public.perfis;
create policy "perfis_select_own"
  on public.perfis for select
  using (auth.uid() = id);

-- Perfis: usuário atualiza apenas o próprio (campos não-sensíveis;
-- o trigger acima garante que campos sensíveis não mudem)
drop policy if exists "perfis_update_own_safe" on public.perfis;
create policy "perfis_update_own_safe"
  on public.perfis for update
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- Pedidos: usuário lê apenas os próprios pedidos
drop policy if exists "pedidos_select_own" on public.pedidos_acesso;
create policy "pedidos_select_own"
  on public.pedidos_acesso for select
  using (auth.uid() = user_id);

-- Pedidos: usuário só insere pedido para si mesmo
drop policy if exists "pedidos_insert_own" on public.pedidos_acesso;
create policy "pedidos_insert_own"
  on public.pedidos_acesso for insert
  with check (auth.uid() = user_id);

-- Pedidos: usuário comum NÃO pode atualizar pedidos
-- (só o backend via service_role pode)
drop policy if exists "pedidos_update_blocked" on public.pedidos_acesso;
-- Intencionalmente sem policy de update para usuários comuns

-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_perfis_email   on public.perfis(email);
create index if not exists idx_pedidos_user   on public.pedidos_acesso(user_id);
create index if not exists idx_pedidos_status on public.pedidos_acesso(status);
