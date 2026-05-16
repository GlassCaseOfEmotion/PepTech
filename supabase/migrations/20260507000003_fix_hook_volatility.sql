-- Restore VOLATILE on the custom access token hook.
-- The previous migration accidentally re-introduced STABLE (which was fixed in
-- 20260427000006_fix_jwt_hook_volatility.sql). VOLATILE ensures PostgreSQL never
-- caches the result between calls, which is required for an auth hook that reads
-- live tables on each token issuance.
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
