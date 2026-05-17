-- Fix product_media storage RLS policies:
-- 1. Replace left(name, 36) with (storage.foldername(name))[1] (project convention)
-- 2. Add TO authenticated to restrict policies to authenticated sessions only

DROP POLICY IF EXISTS "tenant_product_media_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "tenant_product_media_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "tenant_product_media_storage_delete" ON storage.objects;

CREATE POLICY "tenant_product_media_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-media' AND (storage.foldername(name))[1] = (auth_tenant_id())::text);

CREATE POLICY "tenant_product_media_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-media' AND (storage.foldername(name))[1] = (auth_tenant_id())::text);

CREATE POLICY "tenant_product_media_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-media' AND (storage.foldername(name))[1] = (auth_tenant_id())::text);
