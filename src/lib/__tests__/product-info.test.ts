import { describe, it, expect } from 'vitest'
import { formatProductInfo } from '../product-info'
import type { ProductInfoIncludes } from '../product-info'
import type { ProductProtocol } from '@/types/protocols'

const PRODUCT = {
  name: 'BPC-157',
  sku: 'PEP-BPC157',
  description: 'A healing peptide',
  resources: [{ label: 'Tutorial', url: 'https://example.com' }],
}

const PROTOCOL: ProductProtocol = {
  id: 'p1', tenant_id: 't1', product_id: 'pr1',
  vial_strength: '5mg',
  reconstitution_ml: 2,
  reconstitution_solvent: 'bacteriostatic water',
  draw_volume_ml: 0.1,
  frequency: 'once_daily',
  timing: 'Morning',
  cycle_length_weeks: 12,
  storage: 'Refrigerate',
  notes: 'Use bac water',
  created_at: '', updated_at: '',
}

const ALL: ProductInfoIncludes = { description: true, protocol: true, resources: true }
const NONE: ProductInfoIncludes = { description: false, protocol: false, resources: false }

describe('formatProductInfo', () => {
  it('includes product header always', () => {
    const result = formatProductInfo(PRODUCT, null, NONE)
    expect(result).toContain('BPC-157 (PEP-BPC157)')
  })

  it('includes description when toggled on', () => {
    const result = formatProductInfo(PRODUCT, null, { ...NONE, description: true })
    expect(result).toContain('A healing peptide')
  })

  it('excludes description when toggled off', () => {
    const result = formatProductInfo(PRODUCT, null, NONE)
    expect(result).not.toContain('A healing peptide')
  })

  it('includes full protocol when toggled on', () => {
    const result = formatProductInfo(PRODUCT, PROTOCOL, { ...NONE, protocol: true })
    expect(result).toContain('Vial strength: 5mg')
    expect(result).toContain('2mL')
    expect(result).toContain('20 doses/vial')  // floor(2/0.1) = 20
    expect(result).toContain('Once daily')
    expect(result).toContain('Morning')
    expect(result).toContain('12 weeks')
    expect(result).toContain('Refrigerate')
    expect(result).toContain('Use bac water')
  })

  it('uses Math.floor for doses (not round)', () => {
    const protocol = { ...PROTOCOL, reconstitution_ml: 2, draw_volume_ml: 0.3 }  // 6.67 → floor = 6
    const result = formatProductInfo(PRODUCT, protocol, { ...NONE, protocol: true })
    expect(result).toContain('6 doses/vial')
    expect(result).not.toContain('7 doses/vial')
  })

  it('excludes protocol when null', () => {
    const result = formatProductInfo(PRODUCT, null, ALL)
    expect(result).not.toContain('Protocol')
    expect(result).not.toContain('doses/vial')
  })

  it('includes resources when toggled on', () => {
    const result = formatProductInfo(PRODUCT, null, { ...NONE, resources: true })
    expect(result).toContain('Tutorial: https://example.com')
  })

  it('excludes resources when toggled off', () => {
    const result = formatProductInfo(PRODUCT, null, NONE)
    expect(result).not.toContain('Tutorial')
  })

  it('omits optional protocol fields when null', () => {
    const protocol = { ...PROTOCOL, timing: null, cycle_length_weeks: null, storage: null, notes: null, vial_strength: null }
    const result = formatProductInfo(PRODUCT, protocol, { ...NONE, protocol: true })
    expect(result).toContain('doses/vial')
    expect(result).not.toContain('Timing:')
    expect(result).not.toContain('Cycle length:')
    expect(result).not.toContain('Storage:')
    expect(result).not.toContain('Notes:')
    expect(result).not.toContain('Vial strength:')
  })
})
