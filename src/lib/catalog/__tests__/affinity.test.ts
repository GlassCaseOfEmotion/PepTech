import { describe, it, expect } from 'vitest'
import { computeCoProductAffinity, type OrderForAffinity } from '../affinity'

describe('computeCoProductAffinity', () => {
  it('counts co-occurrence within the same order and returns top-5 sorted desc', () => {
    const orders = [
      { order_items: [{ product_id: 'A' }, { product_id: 'B' }] },
      { order_items: [{ product_id: 'A' }, { product_id: 'B' }] },
      { order_items: [{ product_id: 'A' }, { product_id: 'C' }] },
    ]
    const result = computeCoProductAffinity(orders)
    expect(result['A']).toEqual([
      { productId: 'B', count: 2 },
      { productId: 'C', count: 1 },
    ])
    expect(result['B']).toEqual([{ productId: 'A', count: 2 }])
  })

  it('ignores self-pairs and tolerates missing/empty order_items', () => {
    const orders = [
      { order_items: [{ product_id: 'A' }] },
      { order_items: [] },
      { order_items: null },
    ]
    const result = computeCoProductAffinity(orders as OrderForAffinity[])
    expect(result['A']).toBeUndefined()
  })

  it('caps each product list at 5 entries', () => {
    const ids = ['B', 'C', 'D', 'E', 'F', 'G']
    const orders = ids.map(id => ({ order_items: [{ product_id: 'A' }, { product_id: id }] }))
    const result = computeCoProductAffinity(orders)
    expect(result['A']).toHaveLength(5)
  })
})
