import { describe, it, expect } from 'vitest'
import { validateAndNormalise, generateSku } from '../validate'

describe('generateSku', () => {
  it('slugifies a product name', () => {
    expect(generateSku('BPC-157 5mg', new Set())).toBe('bpc-157-5mg')
  })
  it('dedupes against an existing set with -2, -3 suffixes', () => {
    const taken = new Set(['bpc-157-5mg'])
    expect(generateSku('BPC-157 5mg', taken)).toBe('bpc-157-5mg-2')
    taken.add('bpc-157-5mg-2')
    expect(generateSku('BPC-157 5mg', taken)).toBe('bpc-157-5mg-3')
  })
  it('handles characters outside [a-z0-9-]', () => {
    expect(generateSku('5-Amino-1MQ Capsule 50mg × 60caps', new Set())).toBe('5-amino-1mq-capsule-50mg-60caps')
  })
})

describe('validateAndNormalise', () => {
  const baseCtx = {
    source_file_ref: 'abc123',
    source_filename: 'list.pdf',
    model: 'google/gemini-2.5-pro',
    businessType: 'peptides' as const,
  }

  it('passes through a clean response and defaults stock to 10', () => {
    const out = validateAndNormalise({
      detected_currency: 'IDR',
      products: [
        { name: 'BPC-157 5mg', raw_name: 'BPC-157 5mg', raw_category: 'RECOVERY & HEALING', family: 'HEALING', presentation: 'vial', unit_price: 900000, confidence: 0.97 },
      ],
      tenant_notes: [],
    }, baseCtx)
    expect(out.products).toHaveLength(1)
    expect(out.products[0].name).toBe('BPC-157 5mg')
    expect(out.products[0].family).toBe('HEALING')
    expect(out.products[0].presentation).toBe('vial')
    expect(out.products[0].stock).toBe(10)
    expect(out.detected_currency).toBe('IDR')
    expect(out.source_file_ref).toBe('abc123')
  })

  it('drops rows with non-positive prices', () => {
    const out = validateAndNormalise({
      detected_currency: null,
      products: [
        { name: 'A', raw_name: 'A', raw_category: null, family: null, presentation: null, unit_price: 0, confidence: 0.9 },
        { name: 'B', raw_name: 'B', raw_category: null, family: null, presentation: null, unit_price: -10, confidence: 0.9 },
        { name: 'C', raw_name: 'C', raw_category: null, family: null, presentation: null, unit_price: 5, confidence: 0.9 },
      ],
      tenant_notes: [],
    }, baseCtx)
    expect(out.products.map(p => p.name)).toEqual(['C'])
  })

  it('clamps confidence to [0,1] and trims long names', () => {
    const longName = 'X'.repeat(300)
    const out = validateAndNormalise({
      detected_currency: null,
      products: [
        { name: longName, raw_name: 'orig', raw_category: null, family: null, presentation: null, unit_price: 1, confidence: 1.5 },
      ],
      tenant_notes: [],
    }, baseCtx)
    expect(out.products[0].confidence).toBe(1)
    expect(out.products[0].name.length).toBeLessThanOrEqual(200)
  })

  it('defaults missing tenant_notes to []', () => {
    const out = validateAndNormalise(
      { detected_currency: null, products: [] } as unknown as Parameters<typeof validateAndNormalise>[0],
      baseCtx,
    )
    expect(out.tenant_notes).toEqual([])
  })

  it('throws if products is not an array', () => {
    expect(() =>
      validateAndNormalise(
        { detected_currency: null, products: 'oops', tenant_notes: [] } as unknown as Parameters<typeof validateAndNormalise>[0],
        baseCtx,
      ),
    ).toThrow(/products/i)
  })

  it('coerces non-canonical family to OTHER (peptides)', () => {
    const out = validateAndNormalise({
      detected_currency: null,
      products: [
        { name: 'X', raw_name: 'X', raw_category: 'WHATEVER', family: 'FAT LOSS', presentation: 'vial', unit_price: 1, confidence: 0.9 },
      ],
      tenant_notes: [],
    }, baseCtx)
    expect(out.products[0].family).toBe('OTHER')
  })

  it('maps known synonyms to canonical families', () => {
    const out = validateAndNormalise({
      detected_currency: null,
      products: [
        { name: 'Sema', raw_name: 'S', raw_category: 'recovery', family: 'RECOVERY', presentation: 'vial', unit_price: 1, confidence: 0.9 },
        { name: 'TES',  raw_name: 'T', raw_category: 'gh',       family: 'GROWTH HORMONE', presentation: 'vial', unit_price: 1, confidence: 0.9 },
      ],
      tenant_notes: [],
    }, baseCtx)
    expect(out.products[0].family).toBe('HEALING')
    expect(out.products[1].family).toBe('GH')
  })

  it('defaults presentation to "vial" for peptides when missing', () => {
    const out = validateAndNormalise({
      detected_currency: null,
      products: [
        { name: 'A', raw_name: 'A', raw_category: null, family: 'HEALING', presentation: null, unit_price: 1, confidence: 0.9 },
      ],
      tenant_notes: [],
    }, baseCtx)
    expect(out.products[0].presentation).toBe('vial')
  })

  it('keeps presentation null when business type unknown', () => {
    const out = validateAndNormalise({
      detected_currency: null,
      products: [
        { name: 'A', raw_name: 'A', raw_category: null, family: null, presentation: null, unit_price: 1, confidence: 0.9 },
      ],
      tenant_notes: [],
    }, { ...baseCtx, businessType: null })
    expect(out.products[0].presentation).toBeNull()
  })
})
