import { describe, it, expect } from 'vitest'
import type { OrderStatus } from '@/types/orders'

describe('OrderStatus', () => {
  it('includes created', () => {
    const s: OrderStatus = 'created'
    expect(s).toBe('created')
  })
})
