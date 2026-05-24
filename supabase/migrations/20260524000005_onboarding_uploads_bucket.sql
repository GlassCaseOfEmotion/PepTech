INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-uploads',
  'onboarding-uploads',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tenant_onboarding_uploads_access" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'onboarding-uploads'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  )
  WITH CHECK (
    bucket_id = 'onboarding-uploads'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );
