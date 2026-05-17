-- supabase/migrations/20260517000003_product_media.sql

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-media',
  'product-media',
  false,
  16777216,
  ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "tenant_product_media_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-media' AND left(name, 36) = auth_tenant_id()::text);

CREATE POLICY "tenant_product_media_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-media' AND left(name, 36) = auth_tenant_id()::text);

CREATE POLICY "tenant_product_media_storage_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-media' AND left(name, 36) = auth_tenant_id()::text);

-- Table
CREATE TABLE product_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label        text NOT NULL,
  type         text NOT NULL CHECK (type IN ('image', 'video')),
  storage_path text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_product_media_all" ON product_media
  FOR ALL
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
