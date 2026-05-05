import { describe, it, expect } from 'vitest'

function validateSku(sku: string): string | null {
  const cleaned = sku.trim().toUpperCase()
  if (!cleaned) return 'SKU is required'
  if (cleaned.length > 32) return 'SKU must be 32 characters or fewer'
  if (!/^[A-Z0-9\-_]+$/.test(cleaned)) return 'SKU may only contain letters, numbers, hyphens, and underscores'
  return null
}

function validateBatch(data: { batchNumber: string; stock: number }): string | null {
  if (!data.batchNumber.trim()) return 'Batch number is required'
  if (data.stock < 0) return 'Stock cannot be negative'
  return null
}

describe('validateSku', () => {
  it('returns null for valid SKU', () => {
    expect(validateSku('BPC-157-5MG')).toBeNull()
  })
  it('returns error for empty SKU', () => {
    expect(validateSku('')).toBe('SKU is required')
  })
  it('returns error for invalid characters', () => {
    expect(validateSku('BPC 157')).toBe('SKU may only contain letters, numbers, hyphens, and underscores')
  })
  it('uppercases the SKU', () => {
    expect(validateSku('bpc-157')).toBeNull()
  })
})

describe('validateBatch', () => {
  it('returns null for valid batch', () => {
    expect(validateBatch({ batchNumber: 'BPC-0408-B', stock: 48 })).toBeNull()
  })
  it('returns error for negative stock', () => {
    expect(validateBatch({ batchNumber: 'B1', stock: -1 })).toBe('Stock cannot be negative')
  })
  it('returns error for empty batch number', () => {
    expect(validateBatch({ batchNumber: '', stock: 10 })).toBe('Batch number is required')
  })
})
