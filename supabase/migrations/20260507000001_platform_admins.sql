-- 1. Add is_active to tenants (default true, false = disabled)
alter table public.tenants
  add column if not exists is_active boolean not null default true;

-- 2. Platform admins table — not tenant-scoped
create table if not exists public.platform_admins (
  id           uuid        primary key references auth.users(id) on delete cascade,
  granted_by   uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

-- Users can see their own row; service role sees all
drop policy if exists "self_select" on public.platform_admins;
create policy "self_select" on public.platform_admins
  for select using (id = auth.uid());

-- 3. Update JWT hook to also inject is_platform_admin
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql volatile as $$
declare
  claims             jsonb;
  tenant_id          uuid;
  is_platform_admin  boolean;
begin
  select u.tenant_id into tenant_id
  from public.users u
  where u.id = (event ->> 'userId')::uuid;

  select exists(
    select 1 from public.platform_admins pa
    where pa.id = (event ->> 'userId')::uuid
  ) into is_platform_admin;

  claims := event -> 'claims';

  if tenant_id is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(tenant_id::text));
  end if;

  if is_platform_admin then
    claims := jsonb_set(claims, '{is_platform_admin}', 'true'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon;
