import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import {
  verifyTwilioSignature,
  extractTwilioMessage,
  sendWhatsAppMessage,
} from '../whatsapp'

const AUTH_TOKEN = 'test-auth-token'
const WEBHOOK_URL = 'https://peptech.app/api/webhooks/whatsapp/tenant-123'

function twilioSign(url: string, params: Record<string, string>, token: string): string {
  const sortedKeys = Object.keys(params).sort()
  const str = url + sortedKeys.map(k => k + params[k]).join('')
  return createHmac('sha1', token).update(str).digest('base64')
}

describe('verifyTwilioSignature', () => {
  it('returns true for a valid signature', () => {
    const params = { Body: 'Hello', From: 'whatsapp:+15005550001', MessageSid: 'SM123', To: 'whatsapp:+14155551234' }
    const sig = twilioSign(WEBHOOK_URL, params, AUTH_TOKEN)
    expect(verifyTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, params, sig)).toBe(true)
  })

  it('returns false for a tampered signature', () => {
    const params = { Body: 'Hello', From: 'whatsapp:+15005550001', MessageSid: 'SM123', To: 'whatsapp:+14155551234' }
    expect(verifyTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, params, 'badsig')).toBe(false)
  })

  it('returns false when params differ from signed params', () => {
    const params = { Body: 'Hello', From: 'whatsapp:+15005550001', MessageSid: 'SM123', To: 'whatsapp:+14155551234' }
    const sig = twilioSign(WEBHOOK_URL, params, AUTH_TOKEN)
    const tamperedParams = { ...params, Body: 'Hacked' }
    expect(verifyTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, tamperedParams, sig)).toBe(false)
  })
})

describe('extractTwilioMessage', () => {
  it('extracts message fields and strips whatsapp: prefix from From', () => {
    const params = {
      MessageSid: 'SM001',
      From: 'whatsapp:+15005550001',
      Body: 'Hello world',
      ProfileName: 'John Doe',
      To: 'whatsapp:+14155551234',
      WaId: '15005550001',
    }
    const msg = extractTwilioMessage(params)
    expect(msg).not.toBeNull()
    expect(msg!.externalId).toBe('SM001')
    expect(msg!.from).toBe('+15005550001')
    expect(msg!.displayName).toBe('John Doe')
    expect(msg!.content).toBe('Hello world')
    expect(msg!.sentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('falls back to from number as displayName when ProfileName missing', () => {
    const params = { MessageSid: 'SM002', From: 'whatsapp:+15005550001', Body: 'Hi', To: 'whatsapp:+14155551234' }
    const msg = extractTwilioMessage(params)
    expect(msg!.displayName).toBe('+15005550001')
  })

  it('returns null when required fields are missing', () => {
    expect(extractTwilioMessage({ MessageSid: 'SM003', From: 'whatsapp:+1500' })).toBeNull()
    expect(extractTwilioMessage({ Body: 'Hi', From: 'whatsapp:+1500' })).toBeNull()
  })

  it('uses DateSent when provided', () => {
    const params = {
      MessageSid: 'SM003',
      From: 'whatsapp:+15005550001',
      Body: 'Hi',
      To: 'whatsapp:+14155551234',
      DateSent: 'Mon, 28 Apr 2026 10:00:00 +0000',
    }
    const msg = extractTwilioMessage(params)
    expect(msg!.sentAt).toBe(new Date('Mon, 28 Apr 2026 10:00:00 +0000').toISOString())
  })
})

describe('sendWhatsAppMessage', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TWILIO_ACCOUNT_SID: 'ACtest123',
      TWILIO_AUTH_TOKEN: 'authtoken123',
      TWILIO_WHATSAPP_NUMBER: '+14155551234',
    }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('POSTs to Twilio API with correct auth and form body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    await sendWhatsAppMessage('+15005550001', 'Hello')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest123/Messages.json')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(options.headers['Authorization']).toBe('Basic ' + Buffer.from('ACtest123:authtoken123').toString('base64'))
    const body = new URLSearchParams(options.body)
    expect(body.get('To')).toBe('whatsapp:+15005550001')
    expect(body.get('From')).toBe('whatsapp:+14155551234')
    expect(body.get('Body')).toBe('Hello')
  })

  it('adds whatsapp: prefix to numbers that lack it', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    await sendWhatsAppMessage('+15005550001', 'Hi')

    const body = new URLSearchParams(mockFetch.mock.calls[0][1].body)
    expect(body.get('To')).toBe('whatsapp:+15005550001')
    expect(body.get('From')).toBe('whatsapp:+14155551234')
  })

  it('throws when to or text is empty', async () => {
    await expect(sendWhatsAppMessage('', 'Hello')).rejects.toThrow()
    await expect(sendWhatsAppMessage('+15005550001', '')).rejects.toThrow()
  })

  it('throws when Twilio responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad Request' }))
    await expect(sendWhatsAppMessage('+15005550001', 'Hello')).rejects.toThrow('Twilio send failed')
  })
})
