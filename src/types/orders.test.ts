import { describe, it, expect } from 'vitest'
import { dbOrderToCard } from './orders'
import type { DbOrderRow } from './orders'

const BASE_ORDER: DbOrderRow = {
  id: 'o1', ref_number: 'A-2247', customer_id: 'c1',
  conversation_id: null, status: 'awaiting',
  payment_asset: 'USDT', payment_amount: 189,
  payment_address: null, tx_hash: null,
  shipping_address: null, carrier: null, tracking_number: null,
  notes: null, created_at: new Date(Date.now() - 8 * 60000).toISOString(),
  updated_at: new Date().toISOString(),
  customers: {
    id: 'c1', display_name: 'K. (gymrat_84)', trust_score: 92, ltv: 2840,
    customer_channels: [{ channel_type: 'whatsapp', display_handle: '+1 ••• 4421', is_primary: true }],
  },
  order_items: [
    { id: 'i1', qty: 3, unit_price_snapshot: 38, products: { sku: 'BPC-157', name: 'BPC-157 5mg' }, batches: null },
    { id: 'i2', qty: 1, unit_price_snapshot: 75, products: { sku: 'GHK-Cu', name: 'GHK-Cu 50mg' }, batches: null },
  ],
}

describe('dbOrderToCard', () => {
  it('maps ref number and status', () => {
    const card = dbOrderToCard(BASE_ORDER)
    expect(card.refNumber).toBe('A-2247')
    expect(card.status).toBe('awaiting')
  })

  it('maps channel from primary customer_channel', () => {
    const card = dbOrderToCard(BASE_ORDER)
    expect(card.channel).toBe('wa')
  })

  it('builds items summary string', () => {
    const card = dbOrderToCard(BASE_ORDER)
    expect(card.itemsSummary).toBe('BPC-157 5mg ×3, GHK-Cu 50mg ×1')
  })

  it('calculates minsAgo from created_at', () => {
    const card = dbOrderToCard(BASE_ORDER)
    expect(card.minsAgo).toBeGreaterThanOrEqual(7)
    expect(card.minsAgo).toBeLessThan(10)
  })

  it('handles null customers gracefully', () => {
    const card = dbOrderToCard({ ...BASE_ORDER, customers: null })
    expect(card.customerId).toBe('')
    expect(card.customerName).toBe('Unknown')
    expect(card.channel).toBe('wa')
    expect(card.handle).toBe('')
  })
})
