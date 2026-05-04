import { describe, it, expect, vi } from 'vitest'
import { extractTelegramMessage, sendTelegramMessage } from '../telegram'
import type { TelegramUpdate } from '../telegram'

describe('extractTelegramMessage', () => {
  it('extracts fields from a regular bot message', () => {
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 42,
        chat: { id: 99887766, type: 'private' },
        from: { id: 99887766, username: 'gymrat_84', first_name: 'John' },
        text: 'hello',
        date: 1714204800,
      },
    }
    const result = extractTelegramMessage(update)
    expect(result).not.toBeNull()
    expect(result!.externalId).toBe('tg-42')
    expect(result!.chatId).toBe('99887766')
    expect(result!.displayHandle).toBe('@gymrat_84')
    expect(result!.content).toBe('hello')
    expect(result!.businessConnectionId).toBeUndefined()
  })

  it('extracts business_connection_id when present', () => {
    const update: TelegramUpdate = {
      update_id: 2,
      message: {
        message_id: 43,
        business_connection_id: 'biz-conn-abc123',
        chat: { id: 11223344, type: 'private' },
        from: { id: 11223344, username: 'customer1', first_name: 'Alice' },
        text: 'order info',
        date: 1714204900,
      },
    }
    const result = extractTelegramMessage(update)
    expect(result!.businessConnectionId).toBe('biz-conn-abc123')
    expect(result!.chatId).toBe('11223344')
  })

  it('falls back to first_name when no username', () => {
    const update: TelegramUpdate = {
      update_id: 3,
      message: {
        message_id: 44,
        chat: { id: 55667788, type: 'private' },
        from: { id: 55667788, first_name: 'Bob' },
        text: 'hi',
        date: 1714204900,
      },
    }
    expect(extractTelegramMessage(update)!.displayHandle).toBe('Bob')
  })

  it('returns null for non-text updates', () => {
    const update: TelegramUpdate = {
      update_id: 4,
      message: { message_id: 45, chat: { id: 123, type: 'private' }, date: 1714204900 },
    }
    expect(extractTelegramMessage(update)).toBeNull()
  })

  it('returns null for business_connection events (no message field)', () => {
    const update: TelegramUpdate = {
      update_id: 5,
      business_connection: {
        id: 'biz-conn-abc123',
        user: { id: 222, first_name: 'Dealer' },
        user_chat_id: 222,
        date: 1714204900,
        is_enabled: true,
      },
    }
    expect(extractTelegramMessage(update)).toBeNull()
  })
})

describe('sendTelegramMessage', () => {
  it('sends without business_connection_id for regular bot messages', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    await sendTelegramMessage('bot-token', '99887766', 'Hello')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.chat_id).toBe(99887766)
    expect(body.text).toBe('Hello')
    expect(body.business_connection_id).toBeUndefined()
    vi.restoreAllMocks()
  })

  it('includes business_connection_id when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    await sendTelegramMessage('bot-token', '11223344', 'Hi there', 'biz-conn-abc123')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.business_connection_id).toBe('biz-conn-abc123')
    vi.restoreAllMocks()
  })

  it('throws when Telegram responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }))
    await expect(sendTelegramMessage('token', '123', 'Hi')).rejects.toThrow('Telegram sendMessage failed')
    vi.restoreAllMocks()
  })
})
