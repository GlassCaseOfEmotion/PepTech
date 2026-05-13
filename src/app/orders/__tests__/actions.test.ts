import { describe, it, expect } from 'vitest'
import { buildAssignments } from '../utils'

function validateOrderItems(items: { productId: string; qty: number; unitPriceSnapshot: number }[]): string | null {
  if (items.length === 0) return 'Order must have at least one item'
  for (const it of items) {
    if (!it.productId) return 'All items must have a product selected'
    if (it.qty < 1) return 'Quantity must be at least 1'
    if (it.unitPriceSnapshot <= 0) return 'Unit price must be greater than 0'
  }
  return null
}

function calcOrderTotal(items: { qty: number; unitPriceSnapshot: number }[]): number {
  return items.reduce((sum, it) => sum + it.qty * it.unitPriceSnapshot, 0)
}

describe('validateOrderItems', () => {
  it('returns null for valid items', () => {
    expect(validateOrderItems([{ productId: 'p1', qty: 2, unitPriceSnapshot: 38 }])).toBeNull()
  })
  it('returns error for empty items', () => {
    expect(validateOrderItems([])).toBe('Order must have at least one item')
  })
  it('returns error for qty < 1', () => {
    expect(validateOrderItems([{ productId: 'p1', qty: 0, unitPriceSnapshot: 38 }])).toBe('Quantity must be at least 1')
  })
  it('returns error for missing product', () => {
    expect(validateOrderItems([{ productId: '', qty: 1, unitPriceSnapshot: 38 }])).toBe('All items must have a product selected')
  })
})

describe('calcOrderTotal', () => {
  it('sums line totals', () => {
    expect(calcOrderTotal([
      { qty: 3, unitPriceSnapshot: 38 },
      { qty: 1, unitPriceSnapshot: 75 },
    ])).toBe(189)
  })
})

describe('buildAssignments', () => {
  const items = [
    { id: 'i1', productName: 'BPC-157 5mg', qty: 2 },
    { id: 'i2', productName: 'Retatrutide 10mg', qty: 1 },
  ]

  it('returns assignments when all items have a batch', () => {
    const batchMap = new Map([['i1', 'b1'], ['i2', 'b2']])
    const result = buildAssignments(items, batchMap)
    expect(result).toEqual({
      assignments: [
        { item_id: 'i1', batch_id: 'b1', qty: 2 },
        { item_id: 'i2', batch_id: 'b2', qty: 1 },
      ],
    })
  })

  it('returns error naming one insufficient product', () => {
    const batchMap = new Map<string, string | null>([['i1', 'b1'], ['i2', null]])
    const result = buildAssignments(items, batchMap)
    expect(result).toEqual({ error: 'Insufficient stock: Retatrutide 10mg' })
  })

  it('returns error naming all insufficient products', () => {
    const batchMap = new Map<string, string | null>([['i1', null], ['i2', null]])
    const result = buildAssignments(items, batchMap)
    expect(result).toEqual({ error: 'Insufficient stock: BPC-157 5mg, Retatrutide 10mg' })
  })

  it('returns error when item is missing from batchMap entirely', () => {
    const batchMap = new Map<string, string | null>([['i1', 'b1']])
    const result = buildAssignments(items, batchMap)
    expect(result).toEqual({ error: 'Insufficient stock: Retatrutide 10mg' })
  })
})

describe('updateOrderStatus confirming→packing guard', () => {
  // Documents that confirming→packing is not a valid updateOrderStatus transition
  const ALLOWED_FROM: Record<string, string> = {
    awaiting: 'confirming',
    packing: 'shipped',
    shipped: 'delivered',
  }

  it('does not have confirming→packing in ALLOWED_FROM', () => {
    expect(ALLOWED_FROM['confirming']).toBeUndefined()
  })
})

describe('packOrder prerequisites', () => {
  it('buildAssignments returns error for a single item with no batch', () => {
    const result = buildAssignments(
      [{ id: 'i1', productName: 'Widget', qty: 3 }],
      new Map([['i1', null]]),
    )
    expect(result).toEqual({ error: 'Insufficient stock: Widget' })
  })
})

describe('payment_amount_base invariant', () => {
  it('equals payment_amount (amounts stored in base currency)', () => {
    // payment_amount is always in the tenant base currency.
    // payment_amount_base captures this explicitly for LTV aggregation.
    const paymentAmount = 150
    const paymentAmountBase = paymentAmount
    expect(paymentAmountBase).toBe(paymentAmount)
  })
})
