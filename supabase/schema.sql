-- ============================================================
-- Beatriz Lopes Privacy — Schema completo v2
-- Execute no Supabase SQL Editor (pode rodar mais de uma vez)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- TABELAS
-- ============================================================

create table if not exists public.perfis (
  id               uuid        primary key references auth.users(id) on delete cascade,
  email            text,
  nome             text,
  usuario          text,
  telegram         text,
  bio              text,
  assinante        boolean     not null default false,
  plano            text,
  assinatura_inicio timestamptz,
  assinatura_fim   timestamptz,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
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
-- FUNÇÕES E TRIGGERS
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
    nullif(new.raw_user_meta_data->>'telegram', ''),
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
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

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

-- Bloqueia mudança de campos de assinatura via usuário comum.
-- Service_role (backend admin) passa livre.
create or replace function public.block_sensitive_profile_updates()
returns trigger
language plpgsql
as $$
declare
  _role text;
begin
  _role := current_setting('role', true);
  if _role in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.assinante         is distinct from old.assinante
  or new.plano             is distinct from old.plano
  or new.assinatura_inicio is distinct from old.assinatura_inicio
  or new.assinatura_fim    is distinct from old.assinatura_fim then
    raise exception 'Você não pode alterar o acesso por conta própria.';
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

drop policy if exists "perfis_select_own"      on public.perfis;
create policy "perfis_select_own"
  on public.perfis for select
  using (auth.uid() = id);

drop policy if exists "perfis_update_own_safe" on public.perfis;
create policy "perfis_update_own_safe"
  on public.perfis for update
  using  (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "pedidos_select_own"     on public.pedidos_acesso;
create policy "pedidos_select_own"
  on public.pedidos_acesso for select
  using (auth.uid() = user_id);

drop policy if exists "pedidos_insert_own"     on public.pedidos_acesso;
create policy "pedidos_insert_own"
  on public.pedidos_acesso for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_perfis_email   on public.perfis(email);
create index if not exists idx_pedidos_user   on public.pedidos_acesso(user_id);
create index if not exists idx_pedidos_status on public.pedidos_acesso(status);
