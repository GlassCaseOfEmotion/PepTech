import { describe, it, expect, vi } from 'vitest'
import { extractTelegramMessage, sendTelegramMessage, getTelegramFileBuffer, sendTelegramPhoto } from '../telegram'
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

describe('extractTelegramMessage — photo', () => {
  it('returns photoFileId when message.photo is present', () => {
    const update: TelegramUpdate = {
      update_id: 10,
      message: {
        message_id: 99,
        chat: { id: 11223344, type: 'private' },
        from: { id: 11223344, username: 'customer1' },
        date: 1714204900,
        photo: [
          { file_id: 'small_id', file_unique_id: 'u1', width: 90, height: 90 },
          { file_id: 'large_id', file_unique_id: 'u2', width: 800, height: 600 },
        ],
      },
    }
    const result = extractTelegramMessage(update)
    expect(result).not.toBeNull()
    expect(result!.photoFileId).toBe('large_id')
    expect(result!.content).toBe('')
  })

  it('returns null content and correct chatId for photo-only message', () => {
    const update: TelegramUpdate = {
      update_id: 11,
      message: {
        message_id: 100,
        chat: { id: 55667788, type: 'private' },
        from: { id: 55667788, first_name: 'Bob' },
        date: 1714204900,
        photo: [{ file_id: 'fid1', file_unique_id: 'u1', width: 320, height: 240 }],
      },
    }
    const result = extractTelegramMessage(update)
    expect(result!.chatId).toBe('55667788')
    expect(result!.photoFileId).toBe('fid1')
  })

  it('returns null for message with neither text nor photo', () => {
    const update: TelegramUpdate = {
      update_id: 12,
      message: { message_id: 101, chat: { id: 123, type: 'private' }, date: 1714204900 },
    }
    expect(extractTelegramMessage(update)).toBeNull()
  })
})

describe('getTelegramFileBuffer', () => {
  it('calls getFile then downloads the file and returns buffer + mimeType', async () => {
    const getFileRes = { ok: true, result: { file_path: 'photos/abc.jpg' } }
    const fileBytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => getFileRes })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => fileBytes })
    vi.stubGlobal('fetch', mockFetch)

    const { buffer, mimeType } = await getTelegramFileBuffer('bot-token', 'file-id-abc')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[0][0]).toContain('getFile?file_id=file-id-abc')
    expect(mockFetch.mock.calls[1][0]).toContain('photos/abc.jpg')
    expect(mimeType).toBe('image/jpeg')
    expect(buffer).toBeInstanceOf(Buffer)
    vi.restoreAllMocks()
  })

  it('throws when getFile fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false }) }))
    await expect(getTelegramFileBuffer('token', 'bad-id')).rejects.toThrow('getFile failed')
    vi.restoreAllMocks()
  })
})

describe('sendTelegramPhoto', () => {
  it('POSTs multipart form to sendPhoto with chat_id and photo', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    await sendTelegramPhoto('bot-token', '11223344', new Blob(['img']))
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('sendPhoto')
    expect(options.body).toBeInstanceOf(FormData)
    vi.restoreAllMocks()
  })

  it('includes business_connection_id when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    await sendTelegramPhoto('bot-token', '11223344', new Blob(['img']), 'biz-conn-abc')
    const form = mockFetch.mock.calls[0][1].body as FormData
    expect(form.get('business_connection_id')).toBe('biz-conn-abc')
    vi.restoreAllMocks()
  })

  it('throws when Telegram responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }))
    await expect(sendTelegramPhoto('token', '123', new Blob(['x']))).rejects.toThrow('Telegram sendPhoto failed')
    vi.restoreAllMocks()
  })
})
