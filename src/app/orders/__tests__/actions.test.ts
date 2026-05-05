import { describe, it, expect } from 'vitest'

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
