import { describe, it, expect } from 'vitest'

// Pure search filtering logic extracted for testing
function filterProducts(
  products: { sku: string; name: string; product_family: string }[],
  query: string
): typeof products {
  if (!query.trim()) return products
  const q = query.toLowerCase()
  return products.filter(p =>
    p.sku.toLowerCase().includes(q) ||
    p.name.toLowerCase().includes(q) ||
    p.product_family.toLowerCase().includes(q)
  )
}

const PRODUCTS = [
  { sku: 'BPC-157-5MG', name: 'BPC-157 5mg', product_family: 'BPC-157' },
  { sku: 'BPC-157-10MG', name: 'BPC-157 10mg', product_family: 'BPC-157' },
  { sku: 'TIRZ-30MG', name: 'Tirzepatide 30mg', product_family: 'Tirzepatide' },
]

describe('filterProducts', () => {
  it('returns all products for empty query', () => {
    expect(filterProducts(PRODUCTS, '')).toHaveLength(3)
  })
  it('filters by SKU prefix', () => {
    expect(filterProducts(PRODUCTS, 'BPC')).toHaveLength(2)
  })
  it('filters by family name', () => {
    expect(filterProducts(PRODUCTS, 'Tirzepatide')).toHaveLength(1)
  })
  it('filters by product name (case insensitive)', () => {
    expect(filterProducts(PRODUCTS, '10mg')).toHaveLength(1)
  })
})
