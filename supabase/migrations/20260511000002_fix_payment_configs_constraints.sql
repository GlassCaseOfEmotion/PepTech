-- Add ON DELETE CASCADE to tenant FK
ALTER TABLE tenant_payment_configs
  DROP CONSTRAINT tenant_payment_configs_tenant_id_fkey,
  ADD CONSTRAINT tenant_payment_configs_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Fix RLS policy to include WITH CHECK
DROP POLICY "tenant_isolation" ON tenant_payment_configs;
CREATE POLICY "tenant_isolation" ON tenant_payment_configs
  FOR ALL
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- Replace anonymous index with named index
-- Drop the target named index first if it already exists (idempotency)
DROP INDEX IF EXISTS tenant_payment_configs_tenant_id_idx;
DO $$
DECLARE idx_name text;
BEGIN
  -- Find the plain (non-unique, non-constraint) index on tenant_id only.
  -- Exclude: the FK pseudo-index, the UNIQUE constraint index, and our
  -- target name (already dropped above).
  SELECT i.indexname INTO idx_name
  FROM pg_indexes i
  JOIN pg_index pi ON pi.indexrelid = (
    SELECT oid FROM pg_class WHERE relname = i.indexname
  )
  WHERE i.tablename = 'tenant_payment_configs'
    AND i.indexdef LIKE '%tenant_id%'
    AND i.indexname != 'tenant_payment_configs_tenant_id_fkey'
    AND i.indexname != 'tenant_payment_configs_tenant_id_idx'
    AND pi.indisunique = false;
  IF idx_name IS NOT NULL THEN
    EXECUTE 'DROP INDEX ' || quote_ident(idx_name);
  END IF;
END $$;
CREATE INDEX tenant_payment_configs_tenant_id_idx ON public.tenant_payment_configs (tenant_id);
