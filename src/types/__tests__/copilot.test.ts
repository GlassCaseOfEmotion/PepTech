import { describe, it, expect } from 'vitest'
import { mapSuggestionRow, draftOrderToCreateOrderInput } from '../copilot'

describe('mapSuggestionRow', () => {
  it('maps a db row (snake_case) to a SuggestionRow (camelCase)', () => {
    const row = {
      id: 's1', conversation_id: 'c1', customer_id: 'cu1', kind: 'quote',
      status: 'open', payload: { message: 'RETA-10 is $120' }, confidence: 0.9,
      reasoning: 'price question', created_at: '2026-05-29T10:00:00Z',
    }
    expect(mapSuggestionRow(row as never)).toEqual({
      id: 's1', conversationId: 'c1', customerId: 'cu1', kind: 'quote',
      status: 'open', payload: { message: 'RETA-10 is $120' }, confidence: 0.9,
      reasoning: 'price question', createdAt: '2026-05-29T10:00:00Z',
    })
  })
})

describe('draftOrderToCreateOrderInput', () => {
  it('maps a draft_order payload into the createOrder server-action shape', () => {
    const payload = {
      customer_id: 'cu1', payment_asset: 'USDC',
      items: [
        { product_id: 'p1', product_name: 'RETA-10', qty: 2, unit_price: 120 },
        { product_id: 'p2', product_name: 'BPC-157', qty: 1, unit_price: 50 },
      ],
      total: 290,
    }
    expect(draftOrderToCreateOrderInput(payload, 'c1')).toEqual({
      customerId: 'cu1',
      conversationId: 'c1',
      paymentAsset: 'USDC',
      paymentAmount: 290,
      items: [
        { productId: 'p1', qty: 2, unitPriceSnapshot: 120 },
        { productId: 'p2', qty: 1, unitPriceSnapshot: 50 },
      ],
    })
  })
})
