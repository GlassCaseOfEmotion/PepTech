import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/media/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/storage')>()),
  uploadToStorage: vi.fn().mockResolvedValue('tenant-1/uuid.jpg'),
}))

const { POST } = await import('../route')
const { createClient } = await import('@/lib/supabase/server')
const { uploadToStorage } = await import('@/lib/media/storage')

const TENANT_ID = 'tenant-uuid-1'
const USER_ID = 'user-uuid-1'

function makeSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { tenant_id: TENANT_ID }, error: null }),
    }),
  }
}

async function makeRequest(file: File | Blob | null, conversationId: string | null) {
  const form = new FormData()
  if (file) form.append('file', file, 'photo.jpg')
  if (conversationId) form.append('conversationId', conversationId)

  const req = new Request('http://localhost/api/upload', {
    method: 'POST',
  })

  // Mock formData() to return the form
  req.formData = vi.fn().mockResolvedValue(form)
  return req
}

describe('POST /api/upload', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uploads an image and returns storagePath', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const file = new Blob([new Uint8Array(100)], { type: 'image/jpeg' })
    const req = await makeRequest(file, 'conv-1')
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json() as { storagePath: string }
    expect(body.storagePath).toMatch(/^tenant-uuid-1\/.+\.(jpg|jpeg)$/)
    expect(uploadToStorage).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Buffer),
      expect.stringMatching(/^tenant-uuid-1\/.+\.(jpg|jpeg)$/),
      'image/jpeg',
    )
  }, 10000)

  it('returns 401 when not authenticated', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      from: vi.fn(),
    })
    const file = new Blob([new Uint8Array(10)], { type: 'image/jpeg' })
    const req = await makeRequest(file, 'conv-1')
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for an unsupported file type', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const file = new Blob([new Uint8Array(10)], { type: 'application/pdf' })
    const req = await makeRequest(file, 'conv-1')
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('file type')
  }, 10000)

  it('returns 400 when file exceeds 5MB', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const bigFile = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/jpeg' })
    const req = await makeRequest(bigFile, 'conv-1')
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('large')
  }, 10000)

  it('returns 400 when file or conversationId is missing', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const req = await makeRequest(null, 'conv-1')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
