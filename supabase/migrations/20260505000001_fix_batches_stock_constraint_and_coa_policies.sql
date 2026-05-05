ALTER TABLE batches ADD CONSTRAINT batches_stock_non_negative CHECK (stock >= 0);

CREATE POLICY "tenant_coa_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'coa'
    AND (storage.foldername(name))[1] = auth_tenant_id()::text
  );

CREATE POLICY "tenant_coa_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'coa'
    AND (storage.foldername(name))[1] = auth_tenant_id()::text
  );
