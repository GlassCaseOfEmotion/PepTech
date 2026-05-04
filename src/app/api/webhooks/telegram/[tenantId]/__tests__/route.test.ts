import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/webhooks/processor', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1' }),
}))
vi.mock('@/lib/media/storage', () => ({
  uploadToStorage: vi.fn().mockResolvedValue('tg-tenant-456/tg-50.jpg'),
}))
vi.mock('@/lib/channels/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/channels/telegram')>()
  return {
    ...actual,
    getTelegramFileBuffer: vi.fn().mockResolvedValue({
      buffer: Buffer.from('imgdata'),
      mimeType: 'image/jpeg',
    }),
  }
})

const { POST } = await import('../route')
const { createServiceClient } = await import('@/lib/supabase/server')
const { processInboundMessage } = await import('@/lib/webhooks/processor')
const { uploadToStorage } = await import('@/lib/media/storage')
const { getTelegramFileBuffer } = await import('@/lib/channels/telegram')

const TENANT_ID = 'tg-tenant-456'
const BOT_TOKEN = '123456:ABC-DEF'
const BIZ_CONN_ID = 'biz-conn-abc123'

function makeSupabase(channel: unknown) {
  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown, reject?: (v: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve, reject),
    catch: (fn: (v: unknown) => unknown) => Promise.resolve({ error: null }).catch(fn),
    finally: (fn: () => void) => Promise.resolve({ error: null }).finally(fn),
  })
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: channel, error: null }),
      }),
      update: updateFn,
    }),
    _update: updateFn,
  }
}

describe('Telegram webhook POST', () => {
  beforeEach(() => vi.clearAllMocks())

  it('processes a business message and returns 200', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN, business_connection_id: BIZ_CONN_ID } }
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabase(channel))
    const update = {
      update_id: 1,
      message: {
        message_id: 42,
        business_connection_id: BIZ_CONN_ID,
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

  it('stores business_connection_id from business_connection event and returns 200', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN } }
    const supabaseMock = makeSupabase(channel)
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(supabaseMock)
    const update = {
      update_id: 2,
      business_connection: {
        id: BIZ_CONN_ID,
        user: { id: 555, first_name: 'Dealer', username: 'dealer_99' },
        user_chat_id: 555,
        date: 1714204800,
        is_enabled: true,
      },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST',
      body: JSON.stringify(update),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).not.toHaveBeenCalled()
    expect(supabaseMock._update).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: expect.objectContaining({ business_connection_id: BIZ_CONN_ID }),
      }),
    )
  })

  it('removes business_connection_id when is_enabled is false (tenant unlinks bot)', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN, business_connection_id: BIZ_CONN_ID } }
    const supabaseMock = makeSupabase(channel)
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(supabaseMock)
    const update = {
      update_id: 7,
      business_connection: {
        id: BIZ_CONN_ID,
        user: { id: 555, first_name: 'Dealer', username: 'dealer_99' },
        user_chat_id: 555,
        date: 1714204900,
        is_enabled: false,
      },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST',
      body: JSON.stringify(update),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).not.toHaveBeenCalled()
    const updatedCreds = supabaseMock._update.mock.calls[0][0].credentials
    expect(updatedCreds.business_connection_id).toBeUndefined()
    expect(updatedCreds.bot_token).toBe(BOT_TOKEN)
  })

  it('auto-captures business_connection_id from first business message if not in credentials', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN } }
    const supabaseMock = makeSupabase(channel)
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(supabaseMock)
    const update = {
      update_id: 3,
      message: {
        message_id: 50,
        business_connection_id: BIZ_CONN_ID,
        chat: { id: 11223344, type: 'private' },
        from: { id: 11223344, username: 'new_customer' },
        text: 'hello',
        date: 1714205000,
      },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST', body: JSON.stringify(update), headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).toHaveBeenCalled()
    expect(supabaseMock._update).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: expect.objectContaining({ business_connection_id: BIZ_CONN_ID }),
      }),
    )
  })

  it('does not call update when business_connection_id is already stored', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN, business_connection_id: BIZ_CONN_ID } }
    const supabaseMock = makeSupabase(channel)
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(supabaseMock)
    const update = {
      update_id: 4,
      message: {
        message_id: 51,
        business_connection_id: BIZ_CONN_ID,
        chat: { id: 11223344, type: 'private' },
        from: { id: 11223344, username: 'returning_customer' },
        text: 'hi again',
        date: 1714205100,
      },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST', body: JSON.stringify(update), headers: { 'Content-Type': 'application/json' },
    })
    await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(supabaseMock._update).not.toHaveBeenCalled()
  })

  it('ignores non-text updates and returns 200', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN, business_connection_id: BIZ_CONN_ID } }
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabase(channel))
    const update = {
      update_id: 5,
      message: { message_id: 43, chat: { id: 99887766, type: 'private' }, date: 1714204801 },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST', body: JSON.stringify(update), headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })

  it('returns 404 when tenant has no telegram channel', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabase(null))
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST', body: JSON.stringify({ update_id: 6 }), headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(404)
  })

  it('downloads photo via getTelegramFileBuffer, uploads to storage, and passes photo metadata', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN, business_connection_id: BIZ_CONN_ID } }
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabase(channel))

    const update = {
      update_id: 10,
      message: {
        message_id: 50,
        business_connection_id: BIZ_CONN_ID,
        chat: { id: 11223344, type: 'private' },
        from: { id: 11223344, username: 'customer1' },
        date: 1714205000,
        photo: [
          { file_id: 'small_fid', file_unique_id: 'u1', width: 90, height: 90 },
          { file_id: 'large_fid', file_unique_id: 'u2', width: 800, height: 600 },
        ],
      },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST', body: JSON.stringify(update), headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(getTelegramFileBuffer).toHaveBeenCalledWith(BOT_TOKEN, 'large_fid')
    expect(uploadToStorage).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Buffer),
      expect.stringMatching(/^tg-tenant-456\/tg-50\.(jpg|jpeg)$/),
      'image/jpeg',
    )
    expect(processInboundMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: '[Photo]',
        metadata: expect.objectContaining({ kind: 'photo' }),
      }),
    )
  })
})
