INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tenant_media_access" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  )
  WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );
