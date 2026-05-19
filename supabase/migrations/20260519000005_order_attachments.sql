CREATE TABLE order_attachments (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id     uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  file_size    int,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_order_attachments_select" ON order_attachments
  FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_order_attachments_insert" ON order_attachments
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_order_attachments_delete" ON order_attachments
  FOR DELETE USING (tenant_id = auth_tenant_id());

CREATE INDEX order_attachments_order_created_idx
  ON order_attachments(order_id, created_at DESC);
