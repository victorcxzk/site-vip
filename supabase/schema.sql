-- ============================================================
-- Beatriz Lopes Privacy — Schema v4 (producao)
-- Execute no Supabase SQL Editor | Idempotente
-- ============================================================

create extension if not exists "uuid-ossp";

-- TABELAS LEGADAS (mantidas por compatibilidade)

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
  plano         text          not null default 'Vitalicio',
  valor         numeric(10,2) not null default 5.90,
  status        text          not null default 'pendente'
                              check (status in ('pendente', 'aprovado', 'cancelado')),
  criado_em     timestamptz   not null default now(),
  atualizado_em timestamptz   not null default now()
);

-- NOVAS TABELAS

create table if not exists public.plans (
  id            uuid          primary key default uuid_generate_v4(),
  name          text          not null,
  duration_days integer       not null default 36500,
  price         numeric(10,2) not null,
  is_active     boolean       not null default true,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

insert into public.plans (name, duration_days, price, is_active)
select 'Vitalicio', 36500, 5.90, true
where not exists (select 1 from public.plans where name = 'Vitalicio');

create table if not exists public.payments (
  id               uuid          primary key default uuid_generate_v4(),
  user_id          uuid          not null references auth.users(id) on delete cascade,
  plan_id          uuid          not null references public.plans(id),
  amount           numeric(10,2) not null,
  status           text          not null default 'pending'
                                 check (status in ('pending','approved','rejected','expired','canceled')),
  proof_url        text,
  proof_text       text,
  notes            text,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now(),
  approved_at      timestamptz,
  approved_by      uuid          references auth.users(id),
  rejected_at      timestamptz,
  rejected_by      uuid          references auth.users(id),
  rejection_reason text
);

create table if not exists public.subscriptions (
  id         uuid        primary key default uuid_generate_v4(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  plan_id    uuid        not null references public.plans(id),
  payment_id uuid        references public.payments(id),
  status     text        not null default 'active'
                         check (status in ('active','expired','canceled')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id            uuid        primary key default uuid_generate_v4(),
  actor_user_id uuid        references auth.users(id) on delete set null,
  action        text        not null,
  target_type   text,
  target_id     text,
  old_value     text,
  new_value     text,
  metadata      text,
  created_at    timestamptz not null default now()
);

-- TRIGGERS

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.perfis (id, email, nome, usuario, telegram, criado_em, atualizado_em)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1)),
    nullif(trim(coalesce(new.raw_user_meta_data->>'telegram', '')), ''),
    now(), now()
  )
  on conflict (id) do update
  set email = excluded.email,
      nome = coalesce(excluded.nome, public.perfis.nome),
      usuario = coalesce(excluded.usuario, public.perfis.usuario),
      telegram = coalesce(excluded.telegram, public.perfis.telegram),
      atualizado_em = now();
  return new;
exception when others then
  raise warning 'handle_new_user falhou para %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function public.touch_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end; $$;

drop trigger if exists perfis_touch_updated_at on public.perfis;
create trigger perfis_touch_updated_at before update on public.perfis
  for each row execute procedure public.touch_atualizado_em();

drop trigger if exists pedidos_touch_updated_at on public.pedidos_acesso;
create trigger pedidos_touch_updated_at before update on public.pedidos_acesso
  for each row execute procedure public.touch_atualizado_em();

drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at before update on public.payments
  for each row execute procedure public.touch_updated_at();

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at before update on public.subscriptions
  for each row execute procedure public.touch_updated_at();

drop trigger if exists plans_touch_updated_at on public.plans;
create trigger plans_touch_updated_at before update on public.plans
  for each row execute procedure public.touch_updated_at();

create or replace function public.block_sensitive_profile_updates()
returns trigger language plpgsql security invoker as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;
  if (new.assinante is distinct from old.assinante)
  or (new.plano is distinct from old.plano)
  or (new.assinatura_inicio is distinct from old.assinatura_inicio)
  or (new.assinatura_fim is distinct from old.assinatura_fim) then
    raise exception 'Operacao nao permitida.'
      using hint = 'Campos de assinatura so podem ser alterados pelo sistema.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_sensitive_profile_updates on public.perfis;
create trigger prevent_sensitive_profile_updates
  before update on public.perfis
  for each row execute procedure public.block_sensitive_profile_updates();

-- RLS

alter table public.perfis        enable row level security;
alter table public.pedidos_acesso enable row level security;
alter table public.plans          enable row level security;
alter table public.payments       enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.audit_logs     enable row level security;

drop policy if exists "perfis_select_own"      on public.perfis;
create policy "perfis_select_own" on public.perfis for select using (auth.uid() = id);

drop policy if exists "perfis_update_own_safe" on public.perfis;
create policy "perfis_update_own_safe" on public.perfis for update
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "pedidos_select_own" on public.pedidos_acesso;
create policy "pedidos_select_own" on public.pedidos_acesso for select using (auth.uid() = user_id);

drop policy if exists "pedidos_insert_own" on public.pedidos_acesso;
create policy "pedidos_insert_own" on public.pedidos_acesso for insert with check (auth.uid() = user_id);

drop policy if exists "plans_select_active" on public.plans;
create policy "plans_select_active" on public.plans for select using (is_active = true);

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments for select using (auth.uid() = user_id);

drop policy if exists "payments_insert_own" on public.payments;
create policy "payments_insert_own" on public.payments for insert with check (auth.uid() = user_id);

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);


-- ============================================================
-- FUNCAO ATOMICA: renew_or_create_subscription
-- Evita race condition TOCTOU na renovacao de assinatura.
-- Chamada pelo backend via service_role para operacao atomica.
-- ============================================================

create or replace function public.renew_or_create_subscription(
  p_user_id    uuid,
  p_plan_id    uuid,
  p_payment_id uuid,
  p_duration_days integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_id   uuid;
  v_now      timestamptz := now();
  v_expires  timestamptz;
begin
  -- Tenta atualizar assinatura ativa atomicamente (soma prazo ao existente)
  update subscriptions
  set
    expires_at = expires_at + (p_duration_days || ' days')::interval,
    plan_id    = p_plan_id,
    payment_id = p_payment_id,
    updated_at = v_now
  where user_id = p_user_id
    and status  = 'active'
    and expires_at > v_now
  returning id into v_sub_id;

  -- Se nao havia assinatura ativa, cria nova a partir de hoje
  if v_sub_id is null then
    v_expires := v_now + (p_duration_days || ' days')::interval;
    insert into subscriptions (user_id, plan_id, payment_id, status, started_at, expires_at)
    values (p_user_id, p_plan_id, p_payment_id, 'active', v_now, v_expires)
    returning id into v_sub_id;
  end if;

  return v_sub_id;
end;
$$;

-- Permissao: apenas service_role pode chamar esta funcao
revoke execute on function public.renew_or_create_subscription from public, anon, authenticated;
grant  execute on function public.renew_or_create_subscription to service_role;

-- INDICES

create index if not exists idx_perfis_email          on public.perfis(email);
create index if not exists idx_pedidos_user          on public.pedidos_acesso(user_id);
create index if not exists idx_pedidos_status        on public.pedidos_acesso(status);
create index if not exists idx_payments_user         on public.payments(user_id);
create index if not exists idx_payments_status       on public.payments(status);
create index if not exists idx_payments_created      on public.payments(created_at desc);
create index if not exists idx_subscriptions_user    on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status  on public.subscriptions(status);
create index if not exists idx_subscriptions_exp     on public.subscriptions(expires_at);
create index if not exists idx_audit_actor           on public.audit_logs(actor_user_id);
create index if not exists idx_audit_created         on public.audit_logs(created_at desc);
create index if not exists idx_audit_target          on public.audit_logs(target_type, target_id);
