import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import {
  verifyTwilioSignature,
  extractTwilioMessage,
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
})
