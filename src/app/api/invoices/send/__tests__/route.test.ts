import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock modules before any imports that use them
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getServerUser: vi.fn(),
}))
vi.mock('@/lib/channels/whatsapp', () => ({
  sendWhatsAppMedia: vi.fn(),
}))
vi.mock('@/lib/channels/telegram', () => ({
  sendTelegramDocument: vi.fn(),
}))

import { POST } from '../route'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { sendWhatsAppMedia } from '@/lib/channels/whatsapp'
import { sendTelegramDocument } from '@/lib/channels/telegram'

function makeRequest(body: object) {
  return new Request('http://localhost/api/invoices/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeSupabase(overrides: Record<string, unknown> = {}) {
  const base = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.url/invoice.pdf' }, error: null }),
        download: vi.fn().mockResolvedValue({ data: new Blob(['%PDF']), error: null }),
      }),
    },
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }
  return { ...base, ...overrides }
}

const VALID_BODY = { conversationId: 'conv-1', invoicePath: 'tenant-1/order-1/INV-A-1001.pdf', invoiceName: 'INV-A-1001.pdf' }

const CONV = { id: 'conv-1', tenant_id: 'tenant-1', channel_type: 'whatsapp', channel_identifier: '+15005550001' }
const WA_CHANNEL = { credentials: { phone_number: '+15005550001' }, is_active: true }

describe('POST /api/invoices/send', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 400 when required fields are missing', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(createClient).mockResolvedValue(makeSupabase() as never)
    const res = await POST(makeRequest({ conversationId: 'conv-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when conversation not found', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-1' } as never)
    const supabase = makeSupabase()
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as never)
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(404)
  })

  it('returns 422 when channel is inactive', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-1' } as never)
    const supabase = makeSupabase()
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve({ data: CONV, error: null })
        return Promise.resolve({ data: { credentials: {}, is_active: false }, error: null })
      }),
    } as never))
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(422)
  })

  it('dispatches via WhatsApp and records message', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(sendWhatsAppMedia).mockResolvedValue(undefined)
    const supabase = makeSupabase()
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'msg-1' }, error: null }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      single: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve({ data: CONV, error: null })
        return Promise.resolve({ data: WA_CHANNEL, error: null })
      }),
    } as never))
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(sendWhatsAppMedia).toHaveBeenCalledWith('https://signed.url/invoice.pdf', '+15005550001')
    const body = await res.json() as { messageId: string }
    expect(body.messageId).toBe('msg-1')
  })

  it('dispatches via Telegram sendDocument and records message', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(sendTelegramDocument).mockResolvedValue(undefined)
    const TG_CONV = { ...CONV, channel_type: 'telegram', channel_identifier: '11223344' }
    const TG_CHANNEL = { credentials: { bot_token: 'bot-tok', business_connection_id: 'biz-1' }, is_active: true }
    const supabase = makeSupabase()
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'msg-2' }, error: null }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      single: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve({ data: TG_CONV, error: null })
        return Promise.resolve({ data: TG_CHANNEL, error: null })
      }),
    } as never))
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(sendTelegramDocument).toHaveBeenCalledWith('bot-tok', '11223344', expect.any(Blob), 'INV-A-1001.pdf', 'biz-1')
  })

  it('returns 500 when channel dispatch throws', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(sendWhatsAppMedia).mockRejectedValue(new Error('network timeout'))
    const supabase = makeSupabase()
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'msg-1' }, error: null }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      single: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve({ data: CONV, error: null })
        return Promise.resolve({ data: WA_CHANNEL, error: null })
      }),
    } as never))
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(500)
  })
})
