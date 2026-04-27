-- Auth hook: injects tenant_id into every JWT
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims    jsonb;
  tenant_id uuid;
begin
  select u.tenant_id into tenant_id
  from public.users u
  where u.id = (event ->> 'userId')::uuid;

  claims := event -> 'claims';

  if tenant_id is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(tenant_id::text));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon;
