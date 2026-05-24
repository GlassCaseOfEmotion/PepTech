-- Replace the inline JWT expression in customer_events RLS policy
-- with the project-standard public.auth_tenant_id() helper so it stays
-- consistent with every other tenant-isolation policy in this project.
DROP POLICY IF EXISTS customer_events_tenant_isolation ON public.customer_events;

CREATE POLICY customer_events_tenant_isolation
  ON public.customer_events
  FOR ALL
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());
