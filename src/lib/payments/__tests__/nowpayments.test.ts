import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNowPayment, getNowPayment } from '../nowpayments'

describe('createNowPayment', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('returns payment id and hosted url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        payment_id: 'pay_123',
        payment_url: 'https://nowpayments.io/payment/?iid=pay_123',
        expiration_estimate_date: '2026-05-23T10:00:00Z',
      }),
    }))
    const result = await createNowPayment({
      amountUsd: 150,
      payCurrency: 'usdttrc20',
      payoutAddress: 'So1anaAddr1234',
      orderId: 'order-uuid',
      orderDescription: 'A-2001',
    })
    expect(result.id).toBe('pay_123')
    expect(result.hostedUrl).toBe('https://nowpayments.io/payment/?iid=pay_123')
    expect(result.expiresAt).toBe('2026-05-23T10:00:00Z')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    }))
    await expect(createNowPayment({
      amountUsd: 150,
      payCurrency: 'btc',
      payoutAddress: 'addr',
      orderId: 'id',
      orderDescription: 'A-1',
    })).rejects.toThrow('NOWPayments error 500')
  })
})

describe('getNowPayment', () => {
  it('returns payment status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'pay_123', payment_status: 'confirming' }),
    }))
    const result = await getNowPayment('pay_123')
    expect(result.payment_status).toBe('confirming')
  })
})
