import { describe, it, expect } from 'vitest'
import { verifyNowPaymentsSignature } from '../hmac'
import { createHmac } from 'crypto'

function makeSignature(body: string, secret: string) {
  return createHmac('sha512', secret).update(body).digest('hex')
}

describe('verifyNowPaymentsSignature', () => {
  const secret = 'test_secret'
  const body = '{"payment_id":"123","payment_status":"finished"}'

  it('returns true for valid signature', () => {
    const sig = makeSignature(body, secret)
    expect(verifyNowPaymentsSignature(body, sig, secret)).toBe(true)
  })

  it('returns false for wrong signature', () => {
    expect(verifyNowPaymentsSignature(body, 'badsig', secret)).toBe(false)
  })

  it('returns false for empty signature', () => {
    expect(verifyNowPaymentsSignature(body, '', secret)).toBe(false)
  })
})
