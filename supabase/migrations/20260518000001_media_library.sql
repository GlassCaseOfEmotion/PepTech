-- supabase/migrations/20260518000001_media_library.sql

-- Allow PDFs in the existing product-media bucket
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp',
  'video/mp4','video/quicktime','video/webm',
  'application/pdf'
]
WHERE id = 'product-media';

-- Canonical library table
CREATE TABLE media_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label        text NOT NULL,
  type         text NOT NULL CHECK (type IN ('image', 'video', 'pdf')),
  storage_path text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_media_items_all" ON media_items
  FOR ALL
  USING  (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- Many-to-many product associations
CREATE TABLE media_product_tags (
  media_item_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id)    ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  PRIMARY KEY (media_item_id, product_id)
);

ALTER TABLE media_product_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_media_product_tags_all" ON media_product_tags
  FOR ALL
  USING  (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- Migrate existing product_media rows → media_items + media_product_tags
INSERT INTO media_items (id, tenant_id, label, type, storage_path, sort_order, created_at)
SELECT id, tenant_id, label, type, storage_path, sort_order, created_at
FROM product_media;

INSERT INTO media_product_tags (media_item_id, product_id, tenant_id)
SELECT id, product_id, tenant_id
FROM product_media;

-- Drop old table (storage objects and paths are unchanged)
DROP TABLE product_media;
