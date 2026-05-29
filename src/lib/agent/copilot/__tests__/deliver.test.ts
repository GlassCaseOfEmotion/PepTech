import { describe, it, expect, vi, beforeEach } from 'vitest'

const { sendWhatsAppMessage, sendTelegramMessage, sendGmailMessage, sendMicrosoftMessage, TwilioWindowError } = vi.hoisted(() => {
  class TwilioWindowError extends Error { readonly code = 63016 }
  return {
    sendWhatsAppMessage: vi.fn(),
    sendTelegramMessage: vi.fn(),
    sendGmailMessage: vi.fn(),
    sendMicrosoftMessage: vi.fn(),
    TwilioWindowError,
  }
})

vi.mock('@/lib/channels/whatsapp', () => ({ sendWhatsAppMessage, TwilioWindowError }))
vi.mock('@/lib/channels/telegram', () => ({ sendTelegramMessage }))
vi.mock('@/lib/channels/email', () => ({ sendGmailMessage, sendMicrosoftMessage }))

import { deliverMessage } from '../deliver'

function fakeSupabase(opts: { conv: Record<string, unknown> | null; channel: Record<string, unknown> | null; insertedId?: string }) {
  const insert = vi.fn().mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: opts.insertedId ?? 'msg1' }, error: null }) }) })
  const update = vi.fn().mockReturnValue({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) })
  return {
    _insert: insert, _update: update,
    from: vi.fn().mockImplementation((t: string) => {
      if (t === 'conversations') return { select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: opts.conv }) }) }) }), update }
      if (t === 'tenant_channels') return { select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: opts.channel }) }) }) }) }
      if (t === 'messages') return { insert }
      throw new Error('unexpected table ' + t)
    }),
  }
}

beforeEach(() => { sendWhatsAppMessage.mockReset(); sendTelegramMessage.mockReset(); sendGmailMessage.mockReset(); sendMicrosoftMessage.mockReset() })

describe('deliverMessage', () => {
  it('dispatches telegram + inserts outbound + returns messageId', async () => {
    sendTelegramMessage.mockResolvedValue(undefined)
    const sb = fakeSupabase({
      conv: { id: 'c1', tenant_id: 't1', channel_type: 'telegram', channel_identifier: '999' },
      channel: { is_active: true, credentials: { bot_token: 'BOT', business_connection_id: 'BC' } },
    })
    const out = await deliverMessage(sb as never, 't1', 'c1', 'hi there')
    expect(sendTelegramMessage).toHaveBeenCalledWith('BOT', '999', 'hi there', 'BC')
    expect(out).toEqual({ messageId: 'msg1' })
    expect(sb._insert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 't1', conversation_id: 'c1', direction: 'outbound', status: 'sent', content: 'hi there' }))
  })

  it('returns an error when the channel is inactive', async () => {
    const sb = fakeSupabase({ conv: { id: 'c1', tenant_id: 't1', channel_type: 'telegram', channel_identifier: '999' }, channel: { is_active: false, credentials: null } })
    const out = await deliverMessage(sb as never, 't1', 'c1', 'hi')
    expect('error' in out).toBe(true)
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('maps a closed WhatsApp window to a friendly error', async () => {
    sendWhatsAppMessage.mockRejectedValue(new TwilioWindowError('closed'))
    const sb = fakeSupabase({ conv: { id: 'c1', tenant_id: 't1', channel_type: 'whatsapp', channel_identifier: '+1' }, channel: { is_active: true, credentials: { phone_number: '+1' } } })
    const out = await deliverMessage(sb as never, 't1', 'c1', 'hi') as { error: string }
    expect(out.error).toMatch(/window/i)
  })

  it('returns an error when the conversation is missing', async () => {
    const sb = fakeSupabase({ conv: null, channel: null })
    expect('error' in (await deliverMessage(sb as never, 't1', 'cX', 'hi'))).toBe(true)
  })
})
