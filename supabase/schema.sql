begin;

-- =====================================================
-- 1) Remover triggers customizados antigos em auth.users
-- =====================================================
do $$
declare
  r record;
begin
  for r in
    select t.tgname
    from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and not t.tgisinternal
  loop
    execute format('drop trigger if exists %I on auth.users;', r.tgname);
  end loop;
end
$$;

-- =====================================================
-- 2) Remover funções antigas conhecidas
-- =====================================================
drop function if exists public.handle_new_user() cascade;
drop function if exists public.touch_updated_at() cascade;
drop function if exists public.block_sensitive_profile_updates() cascade;

-- =====================================================
-- 3) Garantir estrutura mínima da tabela perfis
-- =====================================================
create table if not exists public.perfis (
  id                uuid primary key references auth.users(id) on delete cascade,
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

alter table public.perfis add column if not exists email text;
alter table public.perfis add column if not exists nome text;
alter table public.perfis add column if not exists usuario text;
alter table public.perfis add column if not exists telegram text;
alter table public.perfis add column if not exists bio text;
alter table public.perfis add column if not exists assinante boolean not null default false;
alter table public.perfis add column if not exists plano text;
alter table public.perfis add column if not exists assinatura_inicio timestamptz;
alter table public.perfis add column if not exists assinatura_fim timestamptz;
alter table public.perfis add column if not exists criado_em timestamptz not null default now();
alter table public.perfis add column if not exists atualizado_em timestamptz not null default now();

-- =====================================================
-- 4) Garantir estrutura mínima da tabela pedidos_acesso
-- =====================================================
create extension if not exists "uuid-ossp";

create table if not exists public.pedidos_acesso (
  id            uuid          primary key default uuid_generate_v4(),
  user_id       uuid          not null references auth.users(id) on delete cascade,
  plano         text          not null default 'Vitalício',
  valor         numeric(10,2) not null default 5.90,
  status        text          not null default 'pendente',
  criado_em     timestamptz   not null default now(),
  atualizado_em timestamptz   not null default now()
);

alter table public.pedidos_acesso add column if not exists plano text not null default 'Vitalício';
alter table public.pedidos_acesso add column if not exists valor numeric(10,2) not null default 5.90;
alter table public.pedidos_acesso add column if not exists status text not null default 'pendente';
alter table public.pedidos_acesso add column if not exists criado_em timestamptz not null default now();
alter table public.pedidos_acesso add column if not exists atualizado_em timestamptz not null default now();

-- remove constraint de status antiga, se existir diferente
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'pedidos_acesso'
      and contype = 'c'
  loop
    execute format('alter table public.pedidos_acesso drop constraint if exists %I;', r.conname);
  end loop;
end
$$;

alter table public.pedidos_acesso
  add constraint pedidos_acesso_status_check
  check (status in ('pendente', 'aprovado', 'cancelado'));

-- =====================================================
-- 5) Recriar função de signup com proteção máxima
-- =====================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
  exception
    when others then
      raise warning 'handle_new_user falhou para id=% email=% erro=%', new.id, new.email, sqlerrm;
  end;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================
-- 6) Trigger de atualizado_em
-- =====================================================
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

-- =====================================================
-- 7) Trigger de proteção de campos sensíveis
-- =====================================================
create or replace function public.block_sensitive_profile_updates()
returns trigger
language plpgsql
security invoker
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

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

-- =====================================================
-- 8) RLS
-- =====================================================
alter table public.perfis enable row level security;
alter table public.pedidos_acesso enable row level security;

drop policy if exists "perfis_select_own" on public.perfis;
create policy "perfis_select_own"
  on public.perfis for select
  using (auth.uid() = id);

drop policy if exists "perfis_update_own_safe" on public.perfis;
create policy "perfis_update_own_safe"
  on public.perfis for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "pedidos_select_own" on public.pedidos_acesso;
create policy "pedidos_select_own"
  on public.pedidos_acesso for select
  using (auth.uid() = user_id);

drop policy if exists "pedidos_insert_own" on public.pedidos_acesso;
create policy "pedidos_insert_own"
  on public.pedidos_acesso for insert
  with check (auth.uid() = user_id);

-- =====================================================
-- 9) Índices
-- =====================================================
create index if not exists idx_perfis_email   on public.perfis(email);
create index if not exists idx_pedidos_user   on public.pedidos_acesso(user_id);
create index if not exists idx_pedidos_status on public.pedidos_acesso(status);

commit;