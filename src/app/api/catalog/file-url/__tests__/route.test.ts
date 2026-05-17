import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getServerUser: vi.fn(),
}))

const { GET } = await import('../route')
const { createClient, getServerUser } = await import('@/lib/supabase/server')

const TENANT_ID = 'tenant-abc'

function makeSupabase(signedUrl = 'https://sb.co/signed') {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { tenant_id: TENANT_ID }, error: null }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl }, error: null }),
      }),
    },
  }
}

describe('GET /api/catalog/file-url', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    ;(getServerUser as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const req = new Request('http://localhost/api/catalog/file-url?bucket=coa&path=abc/file.pdf')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid bucket', async () => {
    ;(getServerUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const req = new Request(`http://localhost/api/catalog/file-url?bucket=evil&path=${TENANT_ID}/f.pdf`)
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 403 for path not scoped to tenant', async () => {
    ;(getServerUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const req = new Request('http://localhost/api/catalog/file-url?bucket=coa&path=other-tenant/f.pdf')
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('returns signed URL for valid coa request', async () => {
    ;(getServerUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' })
    const sb = makeSupabase('https://sb.co/signed-coa')
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(sb)
    const req = new Request(`http://localhost/api/catalog/file-url?bucket=coa&path=${TENANT_ID}/batch.pdf`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json() as { url: string }
    expect(body.url).toBe('https://sb.co/signed-coa')
    expect(sb.storage.from).toHaveBeenCalledWith('coa')
  })

  it('returns signed URL for valid product-media request', async () => {
    ;(getServerUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' })
    const sb = makeSupabase('https://sb.co/signed-media')
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(sb)
    const req = new Request(`http://localhost/api/catalog/file-url?bucket=product-media&path=${TENANT_ID}/prod/img.jpg`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json() as { url: string }
    expect(body.url).toBe('https://sb.co/signed-media')
    expect(sb.storage.from).toHaveBeenCalledWith('product-media')
  })
})
