import { describe, it, expect } from 'vitest'
import { buildExtractionPrompt, EXTRACTION_JSON_SCHEMA } from '../prompt'

describe('buildExtractionPrompt', () => {
  it('produces a deterministic prompt referencing tenant context', () => {
    const out = buildExtractionPrompt({ businessType: 'peptides', baseCurrency: 'IDR' })
    expect(out).toContain('peptide')
    expect(out).toContain('IDR')
    expect(out).toMatchSnapshot()
  })

  it('exposes a JSON schema with the expected top-level fields', () => {
    expect(EXTRACTION_JSON_SCHEMA.name).toBe('catalog_extraction')
    const schema = EXTRACTION_JSON_SCHEMA.schema as Record<string, unknown>
    const props = (schema.properties as Record<string, unknown>) ?? {}
    expect(Object.keys(props).sort()).toEqual(['detected_currency', 'products', 'tenant_notes'])
  })
})
