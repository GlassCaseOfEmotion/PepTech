import { describe, it, expect } from 'vitest'
import { enrichWithReference } from '../enrich'
import type { ExtractionResult } from '../types'
import type { PeptideReference } from '@/lib/catalog/reference/types'

const refBpc: PeptideReference = {
  id: 'ref-bpc',
  canonical_name: 'BPC-157 5mg',
  family: 'HEALING',
  description: 'Body Protection Compound-157 — accelerates soft-tissue healing.',
  aliases: ['BPC157', 'BPC 157', 'Body Protection Compound'],
  protocol: {
    vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.1,
    frequency: 'once_daily', timing: 'morning', cycle_length_weeks: 10,
    notes: null, dose_display: '250mcg',
  },
}

function buildResult(productNames: string[]): ExtractionResult {
  return {
    detected_currency: 'IDR',
    products: productNames.map(name => ({
      name, sku: 'X', raw_name: name, raw_category: null,
      family: null, presentation: 'vial', unit_price: 1, stock: 10, confidence: 1,
      reference_id: null, description: null, protocol: null,
    })),
    tenant_notes: [],
    source_file_ref: 'f',
    source_filename: 'f.pdf',
    model: 'm',
  }
}

describe('enrichWithReference', () => {
  it('tags matched rows with reference_id, description, and protocol', () => {
    const enriched = enrichWithReference(buildResult(['BPC-157 5mg']), [refBpc])
    expect(enriched.products[0].reference_id).toBe('ref-bpc')
    expect(enriched.products[0].description).toMatch(/Body Protection/)
    expect(enriched.products[0].protocol?.vial_strength).toBe('5mg/vial')
  })

  it('matches via alias and remembers which one matched (in provenance later — verified at commit)', () => {
    const enriched = enrichWithReference(buildResult(['BPC157']), [refBpc])
    expect(enriched.products[0].reference_id).toBe('ref-bpc')
  })

  it('leaves unmatched rows untouched (reference_id null, description null)', () => {
    const enriched = enrichWithReference(buildResult(['Wolverine Pen 15mg']), [refBpc])
    expect(enriched.products[0].reference_id).toBeNull()
    expect(enriched.products[0].description).toBeNull()
    expect(enriched.products[0].protocol).toBeNull()
  })

  it('overrides the model family with the reference family when matched', () => {
    const result = buildResult(['BPC-157 5mg'])
    result.products[0].family = 'OTHER'  // model got it wrong
    const enriched = enrichWithReference(result, [refBpc])
    expect(enriched.products[0].family).toBe('HEALING')
  })

  it('keeps the model family when unmatched', () => {
    const result = buildResult(['Wolverine Pen 15mg'])
    result.products[0].family = 'HEALING'
    const enriched = enrichWithReference(result, [refBpc])
    expect(enriched.products[0].family).toBe('HEALING')
  })

  it('returns the result unchanged when references array is empty', () => {
    const enriched = enrichWithReference(buildResult(['BPC-157 5mg']), [])
    expect(enriched.products[0].reference_id).toBeNull()
  })
})
