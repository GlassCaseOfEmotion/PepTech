-- Grant table-level privileges so the JWT hook and authenticated users can query platform_admins.
-- Without these, the custom_access_token_hook (run as supabase_auth_admin) cannot SELECT from
-- the table, causing the auth hook to fail and blocking all logins.
grant select on public.platform_admins to supabase_auth_admin;
grant select on public.platform_admins to authenticated;
