import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/webhooks/processor', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1' }),
}))

const { POST } = await import('../route')
const { createServiceClient } = await import('@/lib/supabase/server')
const { processInboundMessage } = await import('@/lib/webhooks/processor')

const TENANT_ID = 'tg-tenant-456'
const BOT_TOKEN = '123456:ABC-DEF'

function makeSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN }, webhook_secret: 'secret' },
        error: null,
      }),
    }),
  }
}

describe('Telegram webhook POST', () => {
  beforeEach(() => vi.clearAllMocks())

  it('processes a text message update and returns 200', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabase())
    const update = {
      update_id: 1,
      message: {
        message_id: 42,
        chat: { id: 99887766, type: 'private' },
        from: { id: 99887766, username: 'gymrat_84', first_name: 'John' },
        text: 'need tirz',
        date: 1714204800,
      },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST',
      body: JSON.stringify(update),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        channelType: 'telegram',
        identifier: '99887766',
        displayHandle: '@gymrat_84',
        content: 'need tirz',
        externalId: 'tg-42',
      }),
    )
  })

  it('ignores non-text updates (e.g. photos) and returns 200', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabase())
    const update = {
      update_id: 2,
      message: { message_id: 43, chat: { id: 99887766, type: 'private' }, date: 1714204801, photo: [] },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST', body: JSON.stringify(update), headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })
})
