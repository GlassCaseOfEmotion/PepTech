import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/media/storage', () => ({
  generateSignedUrl: vi.fn().mockResolvedValue('https://sb.co/signed-photo'),
}))
vi.mock('@/lib/channels/whatsapp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/channels/whatsapp')>()),
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  sendWhatsAppMedia: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/channels/telegram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/channels/telegram')>()),
  sendTelegramMessage: vi.fn().mockResolvedValue(undefined),
  sendTelegramPhoto: vi.fn().mockResolvedValue(undefined),
}))

const { POST } = await import('../route')
const { createClient } = await import('@/lib/supabase/server')
const { sendTelegramMessage } = await import('@/lib/channels/telegram')
const { generateSignedUrl } = await import('@/lib/media/storage')
const { sendWhatsAppMedia } = await import('@/lib/channels/whatsapp')
const { sendTelegramPhoto } = await import('@/lib/channels/telegram')

const TENANT_ID = 'send-tenant-001'
const CONV_ID = 'conv-001'

function makeSupabase() {
  const convData = { id: CONV_ID, tenant_id: TENANT_ID, channel_type: 'telegram', channel_identifier: '99887766', customer_id: 'cust-1' }
  const channelData = { credentials: { bot_token: 'bot:TOKEN' }, is_active: true }
  let callCount = 0
  return {
    from: vi.fn().mockImplementation(() => {
      callCount++
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(
          callCount === 1 ? { data: convData, error: null }
          : callCount === 2 ? { data: channelData, error: null }
          : { data: { id: 'msg-new' }, error: null }
        ),
      }
    }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    storage: { from: vi.fn().mockReturnValue({ download: vi.fn().mockResolvedValue({ data: new Blob(['img']), error: null }) }) },
  }
}

function makeWhatsAppSupabase() {
  const convData = { id: CONV_ID, tenant_id: TENANT_ID, channel_type: 'whatsapp', channel_identifier: '+15005550001', customer_id: 'cust-1' }
  const channelData = { credentials: { phone_number: '+15005550001' }, is_active: true }
  let callCount = 0
  return {
    from: vi.fn().mockImplementation(() => {
      callCount++
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(
          callCount === 1 ? { data: convData, error: null }
          : callCount === 2 ? { data: channelData, error: null }
          : { data: { id: 'msg-new' }, error: null }
        ),
      }
    }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    storage: { from: vi.fn().mockReturnValue({ download: vi.fn().mockResolvedValue({ data: new Blob(['img']), error: null }) }) },
  }
}

describe('POST /api/send', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends a Telegram message and inserts outbound message row', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const req = new Request('http://localhost/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: CONV_ID, content: 'hello customer' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(sendTelegramMessage).toHaveBeenCalledWith('bot:TOKEN', '99887766', 'hello customer', undefined)
  })

  it('sends a WhatsApp photo: generates signed URL and calls sendWhatsAppMedia', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeWhatsAppSupabase())
    const req = new Request('http://localhost/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: CONV_ID, storagePath: 'tid/abc.jpg' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(generateSignedUrl).toHaveBeenCalledWith(expect.anything(), 'tid/abc.jpg')
    expect(sendWhatsAppMedia).toHaveBeenCalledWith('https://sb.co/signed-photo', '+15005550001')
  })

  it('sends a Telegram photo: downloads blob from storage and calls sendTelegramPhoto', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const req = new Request('http://localhost/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: CONV_ID, storagePath: 'tid/abc.jpg' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(sendTelegramPhoto).toHaveBeenCalledWith('bot:TOKEN', '99887766', expect.any(Blob), undefined)
  })

  it('returns 400 when neither content nor storagePath is provided', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const req = new Request('http://localhost/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: CONV_ID }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
