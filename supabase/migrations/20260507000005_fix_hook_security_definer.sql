-- Fix: add SECURITY DEFINER so the hook runs as postgres (BYPASSRLS).
-- Without this, supabase_auth_admin is subject to RLS on public.users,
-- and since auth.uid() is null during token issuance, no rows are returned
-- and tenant_id is never injected into the JWT.
--
-- Also: use user_id (snake_case) — current Supabase Auth event field name.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql volatile security definer as $$
declare
  claims             jsonb;
  tenant_id          uuid;
  is_platform_admin  boolean;
begin
  select u.tenant_id into tenant_id
  from public.users u
  where u.id = (event ->> 'user_id')::uuid;

  select exists(
    select 1 from public.platform_admins pa
    where pa.id = (event ->> 'user_id')::uuid
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
$$ set search_path = public;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon;
