-- Grant supabase_auth_admin permission to read users table (needed by JWT hook)
grant select on public.users to supabase_auth_admin;
