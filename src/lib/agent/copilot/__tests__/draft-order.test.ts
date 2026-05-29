import { describe, it, expect } from 'vitest'
import { applyItemDeltas } from '../draft-order'

describe('applyItemDeltas', () => {
  it('adds new lines, updates existing qty, removes on qty<=0, recomputes total', () => {
    const current = [{ product_id: 'p1', qty: 1, unit_price_snapshot: 100 }]
    const priceMap = { p1: 100, p2: 50 }
    const result = applyItemDeltas(current, [{ product_id: 'p2', qty: 2 }, { product_id: 'p1', qty: 3 }], priceMap)
    expect(result.items).toEqual([
      { product_id: 'p1', qty: 3, unit_price_snapshot: 100 },
      { product_id: 'p2', qty: 2, unit_price_snapshot: 50 },
    ])
    expect(result.total).toBe(3 * 100 + 2 * 50)
  })

  it('removes a line when qty <= 0', () => {
    const current = [{ product_id: 'p1', qty: 2, unit_price_snapshot: 100 }]
    const result = applyItemDeltas(current, [{ product_id: 'p1', qty: 0 }], { p1: 100 })
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  it('ignores deltas for products absent from the price map (not in catalog)', () => {
    const result = applyItemDeltas([], [{ product_id: 'ghost', qty: 2 }], { p1: 100 })
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })
})
