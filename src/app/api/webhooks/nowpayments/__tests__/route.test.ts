import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'
import { createHmac } from 'crypto'

const IPN_SECRET = 'test_ipn_secret'

function makeRequest(body: object, secret = IPN_SECRET) {
  const bodyStr = JSON.stringify(body)
  const sig = createHmac('sha512', secret).update(bodyStr).digest('hex')
  return new Request('http://localhost/api/webhooks/nowpayments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nowpayments-sig': sig,
    },
    body: bodyStr,
  })
}

// Mock env + supabase
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'link_id', tenant_id: 'tenant_id', nowpayments_tx_id: null }, error: null }),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    })),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  })),
}))

describe('NOWPayments webhook', () => {
  beforeEach(() => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', IPN_SECRET)
  })

  it('returns 401 for invalid signature', async () => {
    const body = JSON.stringify({ payment_id: '1', payment_status: 'finished' })
    const req = new Request('http://localhost/api/webhooks/nowpayments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nowpayments-sig': 'badsig' },
      body,
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 for non-finished status (status update only)', async () => {
    const req = makeRequest({ payment_id: 'pay_1', payment_status: 'confirming', order_id: 'order-uuid' })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
