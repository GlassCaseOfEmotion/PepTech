import { describe, it, expect } from 'vitest'
import { dbProductToDisplay } from './catalog'
import type { DbProduct, DbBatch } from './catalog'

const BASE_PRODUCT: DbProduct = {
  id: 'p1', tenant_id: 't1', sku: 'BPC-157-5MG', name: 'BPC-157 5mg',
  product_family: 'BPC-157', unit_price: 38, description: null,
  is_active: true, created_at: '2024-01-01T00:00:00Z',
}
const BASE_BATCH: DbBatch = {
  id: 'b1', tenant_id: 't1', product_id: 'p1', batch_number: 'BPC-0408-B',
  coa_path: 'tenant-1/BPC-0408-B.pdf', stock: 48,
  expires_at: '2025-12-31', created_at: '2024-04-08T00:00:00Z',
}

describe('dbProductToDisplay', () => {
  it('sums stock across batches', () => {
    const b2: DbBatch = { ...BASE_BATCH, id: 'b2', stock: 20 }
    const result = dbProductToDisplay(BASE_PRODUCT, [BASE_BATCH, b2])
    expect(result.totalStock).toBe(68)
  })

  it('returns empty batches array when none provided', () => {
    const result = dbProductToDisplay(BASE_PRODUCT, [])
    expect(result.batches).toHaveLength(0)
    expect(result.totalStock).toBe(0)
  })

  it('maps product fields correctly', () => {
    const result = dbProductToDisplay(BASE_PRODUCT, [BASE_BATCH])
    expect(result.id).toBe('p1')
    expect(result.sku).toBe('BPC-157-5MG')
    expect(result.productFamily).toBe('BPC-157')
    expect(result.unitPrice).toBe(38)
    expect(result.isActive).toBe(true)
    expect(result.description).toBeNull()
  })
})
