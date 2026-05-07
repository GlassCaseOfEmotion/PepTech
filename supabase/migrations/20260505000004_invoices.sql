-- Add logo_path to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_path text;

-- Invoices table
CREATE TABLE invoices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id    uuid NOT NULL REFERENCES orders(id)  ON DELETE CASCADE,
  invoice_number text NOT NULL,
  pdf_path    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_invoices" ON invoices
  FOR ALL USING (tenant_id = auth_tenant_id());

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('invoices', 'invoices', false, 5242880, ARRAY['application/pdf']),
  ('logos',    'logos',    true,  2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- invoices bucket: tenant-scoped RLS
CREATE POLICY "tenant_invoices_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'invoices' AND (storage.foldername(name))[1] = (auth_tenant_id())::text);

CREATE POLICY "tenant_invoices_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoices' AND (storage.foldername(name))[1] = (auth_tenant_id())::text);

-- logos bucket: tenant-scoped write, public read
CREATE POLICY "tenant_logos_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = (auth_tenant_id())::text);

CREATE POLICY "tenant_logos_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = (auth_tenant_id())::text);
