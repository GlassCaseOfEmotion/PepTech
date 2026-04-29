import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}))
vi.mock('@/lib/webhooks/processor', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1' }),
}))
vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-auth-token')
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://peptech.app')

const { POST } = await import('../route')
const { createServiceClient } = await import('@/lib/supabase/server')
const { processInboundMessage } = await import('@/lib/webhooks/processor')

const TENANT_ID = 'tenant-123'
const AUTH_TOKEN = 'test-auth-token'
const WEBHOOK_URL = `https://peptech.app/api/webhooks/whatsapp/${TENANT_ID}`

function makeSupabase(channel: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: channel, error: null }),
    }),
  }
}

function twilioSign(url: string, params: Record<string, string>, token: string): string {
  const sortedKeys = Object.keys(params).sort()
  const str = url + sortedKeys.map(k => k + params[k]).join('')
  return createHmac('sha1', token).update(str).digest('base64')
}

function makeFormRequest(params: Record<string, string>, signature: string) {
  const body = new URLSearchParams(params).toString()
  return new Request(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': signature,
    },
    body,
  })
}

const VALID_PARAMS = {
  MessageSid: 'SM001',
  From: 'whatsapp:+15005550001',
  To: 'whatsapp:+14155551234',
  Body: 'Hello',
  ProfileName: 'Test User',
}

describe('WhatsApp webhook (Twilio)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 and calls processInboundMessage for a valid request', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabase({ tenant_id: TENANT_ID })
    )
    const sig = twilioSign(WEBHOOK_URL, VALID_PARAMS, AUTH_TOKEN)
    const res = await POST(makeFormRequest(VALID_PARAMS, sig), { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).toHaveBeenCalledOnce()
    expect(processInboundMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        channelType: 'whatsapp',
        identifier: '+15005550001',
        content: 'Hello',
        externalId: 'SM001',
      }),
    )
  })

  it('returns 401 for an invalid signature', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabase({ tenant_id: TENANT_ID })
    )
    const res = await POST(makeFormRequest(VALID_PARAMS, 'bad-signature'), { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(401)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })

  it('returns 200 without calling processInboundMessage for a status callback (no Body)', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabase({ tenant_id: TENANT_ID })
    )
    const params = { MessageSid: 'SM001', From: 'whatsapp:+15005550001', MessageStatus: 'delivered' }
    const sig = twilioSign(WEBHOOK_URL, params, AUTH_TOKEN)
    const res = await POST(makeFormRequest(params, sig), { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })

  it('returns 404 when tenant has no active whatsapp channel', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabase(null)
    )
    const sig = twilioSign(WEBHOOK_URL, VALID_PARAMS, AUTH_TOKEN)
    const res = await POST(makeFormRequest(VALID_PARAMS, sig), { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(404)
  })
})
