create extension if not exists "pgcrypto";

-- shared updated_at trigger function (used by all tables)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.tenants (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  slug       text        not null unique,
  plan       text        not null default 'starter'
               check (plan in ('starter','pro','enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

create table public.users (
  id           uuid        primary key references auth.users(id) on delete cascade,
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  role         text        not null default 'member'
                 check (role in ('owner','admin','member')),
  display_name text,
  email        text        not null,
  created_at   timestamptz not null default now()
);
