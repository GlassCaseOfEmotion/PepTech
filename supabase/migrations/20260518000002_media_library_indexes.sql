-- supabase/migrations/20260518000002_media_library_indexes.sql

CREATE INDEX media_items_tenant_id_idx         ON media_items (tenant_id);
CREATE INDEX media_product_tags_tenant_id_idx  ON media_product_tags (tenant_id);
CREATE INDEX media_product_tags_product_id_idx ON media_product_tags (product_id);
