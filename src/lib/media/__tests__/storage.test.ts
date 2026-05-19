import { describe, it, expect, vi } from 'vitest'
import { uploadToStorage, generateSignedUrl } from '../storage'

function makeSupabase(
  uploadResult: { error: { message: string } | null } = { error: null },
  signedUrlResult: { data: { signedUrl: string } | null; error: { message: string } | null } = { data: { signedUrl: 'https://sb.co/signed-url' }, error: null },
) {
  const bucket = {
    upload: vi.fn().mockResolvedValue(uploadResult),
    createSignedUrl: vi.fn().mockResolvedValue(signedUrlResult),
  }
  return { storage: { from: vi.fn().mockReturnValue(bucket) }, _bucket: bucket }
}

describe('uploadToStorage', () => {
  it('uploads buffer to the media bucket and returns the path', async () => {
    const { storage, _bucket } = makeSupabase()
    await uploadToStorage({ storage } as never, Buffer.from('imgdata'), 'tid/abc.jpg', 'image/jpeg')
    expect(storage.from).toHaveBeenCalledWith('media')
    expect(_bucket.upload).toHaveBeenCalledWith('tid/abc.jpg', expect.any(Buffer), {
      contentType: 'image/jpeg',
      upsert: false,
    })
  })

  it('returns the storage path', async () => {
    const { storage } = makeSupabase()
    const result = await uploadToStorage({ storage } as never, Buffer.from('x'), 'tid/abc.jpg', 'image/jpeg')
    expect(result).toBe('tid/abc.jpg')
  })

  it('throws when upload fails', async () => {
    const { storage } = makeSupabase({ error: { message: 'Quota exceeded' } })
    await expect(uploadToStorage({ storage } as never, Buffer.from('x'), 'p', 'image/jpeg'))
      .rejects.toThrow('Storage upload failed: Quota exceeded')
  })
})

describe('generateSignedUrl', () => {
  it('returns the signed URL for a storage path', async () => {
    const { storage } = makeSupabase()
    const url = await generateSignedUrl({ storage } as never, 'tid/abc.jpg')
    expect(url).toBe('https://sb.co/signed-url')
    expect(storage.from).toHaveBeenCalledWith('media')
  })

  it('uses the provided expiresIn value', async () => {
    const { storage, _bucket } = makeSupabase()
    await generateSignedUrl({ storage } as never, 'tid/abc.jpg', 7200)
    expect(_bucket.createSignedUrl).toHaveBeenCalledWith('tid/abc.jpg', 7200)
  })

  it('throws when signing fails', async () => {
    const { storage } = makeSupabase(
      { error: null },
      { data: null, error: { message: 'Object not found' } },
    )
    await expect(generateSignedUrl({ storage } as never, 'tid/abc.jpg'))
      .rejects.toThrow('Failed to generate signed URL: Object not found')
  })
})
