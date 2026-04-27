-- Helper: extract tenant_id from JWT claims
create or replace function public.auth_tenant_id()
returns uuid language sql stable as $$
  select (auth.jwt() ->> 'tenant_id')::uuid;
$$;

-- Enable RLS on all tables
alter table public.tenants          enable row level security;
alter table public.users            enable row level security;
alter table public.tenant_channels  enable row level security;
alter table public.customers        enable row level security;
alter table public.customer_channels enable row level security;
alter table public.customer_tags    enable row level security;
alter table public.conversations    enable row level security;
alter table public.messages         enable row level security;
alter table public.notes            enable row level security;
alter table public.quick_replies    enable row level security;

-- Users: each user sees only their own row
create policy "users_own_row" on public.users
  for all using (id = auth.uid());

-- Tenants: user sees only their own tenant
create policy "tenants_own" on public.tenants
  for all using (id = public.auth_tenant_id());

-- All tenant-scoped tables: isolate by tenant_id
create policy "tenant_isolation" on public.tenant_channels
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.customers
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.customer_channels
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.customer_tags
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.conversations
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.messages
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.notes
  for all using (tenant_id = public.auth_tenant_id());

create policy "tenant_isolation" on public.quick_replies
  for all using (tenant_id = public.auth_tenant_id());
