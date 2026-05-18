import type { SupabaseClient } from '@supabase/supabase-js'

type ImageTransform = { width?: number; height?: number; quality?: number; resize?: 'cover' | 'contain' | 'fill' }

export async function uploadToStorage(
  supabase: SupabaseClient,
  buffer: Buffer,
  path: string,
  mimeType: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from('media')
    .upload(path, buffer, { contentType: mimeType, upsert: false })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  return path
}

export async function generateSignedUrl(
  supabase: SupabaseClient,
  path: string,
  expiresIn = 3600,
  transform?: ImageTransform,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('media')
    .createSignedUrl(path, expiresIn, transform ? { transform } : undefined)
  if (error || !data) throw new Error(`Failed to generate signed URL: ${error?.message}`)
  return data.signedUrl
}

export async function generateSignedUrlFromBucket(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn = 3600,
  transform?: ImageTransform,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, transform ? { transform } : undefined)
  if (error || !data) throw new Error(`Failed to generate signed URL: ${error?.message}`)
  return data.signedUrl
}
