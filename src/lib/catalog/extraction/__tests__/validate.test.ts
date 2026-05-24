import { describe, it, expect } from 'vitest'
import { validateAndNormalise, generateSku, suggestSku, reserveSku } from '../validate'

describe('suggestSku', () => {
  it('takes first 4 letters + dose for plain alphabetic compounds', () => {
    expect(suggestSku('Retatrutide 10mg')).toBe('RETA-10')
    expect(suggestSku('Tirzepatide 30mg')).toBe('TIRZ-30')
    expect(suggestSku('Semaglutide 10mg')).toBe('SEMA-10')
    expect(suggestSku('Ipamorelin 5mg')).toBe('IPAM-5')
  })

  it('keeps the compound name when it already carries a digit (no dose suffix)', () => {
    expect(suggestSku('BPC-157 5mg')).toBe('BPC-157')
    expect(suggestSku('TB-500 5mg')).toBe('TB-500')
    expect(suggestSku('5-Amino-1MQ 50mg')).toBe('5-AMINO-1MQ')
  })

  it('preserves hyphens in alphabetic compound names (with dose suffix)', () => {
    expect(suggestSku('GHK-Cu 50mg')).toBe('GHK-CU-50')
  })

  it('handles blends by taking the first compound', () => {
    expect(suggestSku('CJC1295+IPAMORELIN BLEND 5mg+5mg')).toBe('CJC1295')
    expect(suggestSku('BPC-157+TB-500 BLEND 5mg+5mg')).toBe('BPC-157')
  })

  it('produces PROD- when name is empty / unparseable', () => {
    expect(suggestSku('')).toBe('PROD')
    expect(suggestSku('— —')).toBe('PROD')
  })
})

describe('reserveSku', () => {
  it('passes through clean candidates and reserves them', () => {
    const taken = new Set<string>()
    expect(reserveSku('RETA-10', taken, 'Retatrutide 10mg')).toBe('RETA-10')
    expect(taken.has('RETA-10')).toBe(true)
  })

  it('appends -2/-3 on collision', () => {
    const taken = new Set(['RETA-10'])
    expect(reserveSku('RETA-10', taken, 'x')).toBe('RETA-10-2')
    expect(reserveSku('RETA-10', taken, 'x')).toBe('RETA-10-3')
  })

  it('falls back to suggestSku(name) when candidate is empty', () => {
    const taken = new Set<string>()
    expect(reserveSku('', taken, 'Semaglutide 10mg')).toBe('SEMA-10')
  })

  it('normalises messy user input to alphanumeric + hyphen', () => {
    const taken = new Set<string>()
    expect(reserveSku('reta 10!!', taken, 'x')).toBe('RETA-10')
  })
})

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

  it('passes through a clean response, defaults stock to 10, and suggests a SKU', () => {
    const out = validateAndNormalise({
      detected_currency: 'IDR',
      products: [
        { name: 'BPC-157 5mg', raw_name: 'BPC-157 5mg', raw_category: 'RECOVERY & HEALING', family: 'HEALING', presentation: 'vial', unit_price: 900000, confidence: 0.97 },
      ],
      tenant_notes: [],
    }, baseCtx)
    expect(out.products).toHaveLength(1)
    expect(out.products[0].name).toBe('BPC-157 5mg')
    expect(out.products[0].sku).toBe('BPC-157')
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
