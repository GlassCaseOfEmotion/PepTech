import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

// Mock Supabase + processor before importing route
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}))
vi.mock('@/lib/webhooks/processor', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1' }),
}))

// Import after mocks are set up
const { GET, POST } = await import('../route')
const { createServiceClient } = await import('@/lib/supabase/server')
const { processInboundMessage } = await import('@/lib/webhooks/processor')

const TENANT_ID = 'test-tenant-123'
const WEBHOOK_SECRET = 'test-secret'

function makeSupabase(tenantChannel: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: tenantChannel, error: null }),
    }),
  }
}

function signBody(body: string, secret: string) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

describe('WhatsApp webhook', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('GET — hub verification', () => {
    it('returns hub.challenge when mode and token are valid', async () => {
      const url = `http://localhost/api/webhooks/whatsapp/${TENANT_ID}?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=${WEBHOOK_SECRET}`
      ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        makeSupabase({ webhook_secret: WEBHOOK_SECRET, is_active: true, credentials: { api_key: 'key' } })
      )
      const res = await GET(new Request(url), { params: Promise.resolve({ tenantId: TENANT_ID }) })
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text).toBe('abc123')
    })

    it('returns 403 when verify_token does not match', async () => {
      const url = `http://localhost/api/webhooks/whatsapp/${TENANT_ID}?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=wrong`
      ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        makeSupabase({ webhook_secret: WEBHOOK_SECRET })
      )
      const res = await GET(new Request(url), { params: Promise.resolve({ tenantId: TENANT_ID }) })
      expect(res.status).toBe(403)
    })
  })

  describe('POST — inbound message', () => {
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            messages: [{ id: 'wamid.001', from: '15005550001', timestamp: '1714204800', type: 'text', text: { body: 'Hello' } }],
            contacts: [{ profile: { name: 'John' }, wa_id: '15005550001' }],
          },
        }],
      }],
    })

    it('processes valid signed message and returns 200', async () => {
      ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        makeSupabase({ tenant_id: TENANT_ID, webhook_secret: WEBHOOK_SECRET, credentials: { api_key: 'key' } })
      )
      const req = new Request(`http://localhost/api/webhooks/whatsapp/${TENANT_ID}`, {
        method: 'POST',
        body: payload,
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signBody(payload, WEBHOOK_SECRET),
        },
      })
      const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
      expect(res.status).toBe(200)
      expect(processInboundMessage).toHaveBeenCalledOnce()
    })

    it('returns 401 when signature is invalid', async () => {
      ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        makeSupabase({ webhook_secret: WEBHOOK_SECRET, credentials: { api_key: 'key' } })
      )
      const req = new Request(`http://localhost/api/webhooks/whatsapp/${TENANT_ID}`, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=badsig' },
      })
      const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
      expect(res.status).toBe(401)
    })
  })
})
