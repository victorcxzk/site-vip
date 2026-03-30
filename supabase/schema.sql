create extension if not exists "uuid-ossp";

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text,
  usuario text unique,
  telegram text,
  bio text,
  avatar_url text,
  assinante boolean not null default false,
  plano text,
  assinatura_inicio timestamptz,
  assinatura_fim timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.solicitacoes_assinatura (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plano text,
  valor_sugerido numeric,
  status text not null default 'pendente',
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint solicitacoes_status_check check (status in ('pendente', 'aprovada', 'negada'))
);

create unique index if not exists solicitacoes_assinatura_user_unique on public.solicitacoes_assinatura(user_id);

create table if not exists public.pagamentos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  valor numeric,
  status text not null default 'aguardando_contato',
  plano text,
  referencia text,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, email, nome, usuario, telegram, bio, avatar_url, assinante)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    nullif(lower(regexp_replace(coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1)), '[^a-zA-Z0-9_]+', '', 'g')), ''),
    nullif(new.raw_user_meta_data->>'telegram', ''),
    null,
    null,
    false
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

create or replace function public.block_sensitive_profile_update()
returns trigger
language plpgsql
as $$
begin
  if new.assinante is distinct from old.assinante
     or new.plano is distinct from old.plano
     or new.assinatura_inicio is distinct from old.assinatura_inicio
     or new.assinatura_fim is distinct from old.assinatura_fim then
    raise exception 'Você não pode alterar a assinatura diretamente.';
  end if;
  return new;
end;
$$;

create or replace function public.subscription_is_active(p_profile public.perfis)
returns boolean
language plpgsql
stable
as $$
begin
  return coalesce(p_profile.assinante, false)
    and (
      p_profile.assinatura_fim is null
      or p_profile.assinatura_fim > now()
    );
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists perfis_set_updated_at on public.perfis;
create trigger perfis_set_updated_at
before update on public.perfis
for each row execute procedure public.set_updated_at();

drop trigger if exists solicitacoes_set_updated_at on public.solicitacoes_assinatura;
create trigger solicitacoes_set_updated_at
before update on public.solicitacoes_assinatura
for each row execute procedure public.set_updated_at();

drop trigger if exists pagamentos_set_updated_at on public.pagamentos;
create trigger pagamentos_set_updated_at
before update on public.pagamentos
for each row execute procedure public.set_updated_at();

drop trigger if exists perfis_block_sensitive_update on public.perfis;
create trigger perfis_block_sensitive_update
before update on public.perfis
for each row execute procedure public.block_sensitive_profile_update();

alter table public.perfis enable row level security;
alter table public.solicitacoes_assinatura enable row level security;
alter table public.pagamentos enable row level security;

revoke all on table public.perfis from anon, authenticated;
revoke all on table public.solicitacoes_assinatura from anon, authenticated;
revoke all on table public.pagamentos from anon, authenticated;

grant select, update on public.perfis to authenticated;
grant select, insert on public.solicitacoes_assinatura to authenticated;
grant select on public.pagamentos to authenticated;

drop policy if exists "perfil_select_own" on public.perfis;
create policy "perfil_select_own"
on public.perfis
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "perfil_update_own" on public.perfis;
create policy "perfil_update_own"
on public.perfis
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "request_select_own" on public.solicitacoes_assinatura;
create policy "request_select_own"
on public.solicitacoes_assinatura
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "request_insert_own" on public.solicitacoes_assinatura;
create policy "request_insert_own"
on public.solicitacoes_assinatura
for insert
to authenticated
with check (
  auth.uid() = user_id
  and status = 'pendente'
);

drop policy if exists "payment_select_own" on public.pagamentos;
create policy "payment_select_own"
on public.pagamentos
for select
to authenticated
using (auth.uid() = user_id);

create index if not exists perfis_email_idx on public.perfis(email);
create index if not exists perfis_usuario_idx on public.perfis(usuario);
create index if not exists pagamentos_user_idx on public.pagamentos(user_id);
create index if not exists solicitacoes_user_idx on public.solicitacoes_assinatura(user_id);
