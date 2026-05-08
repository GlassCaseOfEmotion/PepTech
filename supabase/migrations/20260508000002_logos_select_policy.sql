-- Add missing SELECT policy for logos storage bucket.
-- Required so that upsert (upload with upsert:true) can check for existing files.
CREATE POLICY "tenant_logos_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = (auth_tenant_id())::text
  );
