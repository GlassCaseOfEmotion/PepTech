import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/webhooks/processor', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1' }),
}))
vi.mock('@/lib/channels/email', () => ({
  fetchGmailMessage: vi.fn().mockResolvedValue([{
    externalId: 'gmail-msg-001',
    from: 'customer@example.com',
    displayHandle: 'customer@example.com',
    content: 'Hello from email',
    sentAt: '2026-04-27T10:00:00.000Z',
  }]),
  fetchMicrosoftMessage: vi.fn().mockResolvedValue(null),
}))

const { POST } = await import('../route')
const { createServiceClient } = await import('@/lib/supabase/server')
const { processInboundMessage } = await import('@/lib/webhooks/processor')

const TENANT_ID = 'em-tenant-789'

function makeGoogleSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          tenant_id: TENANT_ID,
          credentials: {
            provider: 'google',
            email_address: 'tenant@gmail.com',
            refresh_token: 'rtoken',
            access_token: 'atoken',
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          },
        },
        error: null,
      }),
    }),
  }
}

describe('Email webhook POST', () => {
  beforeEach(() => vi.clearAllMocks())

  it('processes a Google Pub/Sub notification and returns 200', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeGoogleSupabase())

    const pubsubBody = {
      message: {
        data: Buffer.from(JSON.stringify({ emailAddress: 'tenant@gmail.com', historyId: '12345' })).toString('base64'),
        messageId: 'pubsub-001',
        publishTime: '2026-04-27T10:00:00.000Z',
      },
      subscription: 'projects/peptech/subscriptions/gmail-push',
    }

    const req = new Request(`http://localhost/api/webhooks/email/${TENANT_ID}`, {
      method: 'POST',
      body: JSON.stringify(pubsubBody),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        channelType: 'email',
        content: 'Hello from email',
      }),
    )
  })
})
