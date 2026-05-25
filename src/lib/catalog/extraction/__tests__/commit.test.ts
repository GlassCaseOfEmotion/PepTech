import { describe, it, expect } from 'vitest'
import { commitExtractedCatalog } from '../commit'
import type { CommitInput, ExtractedProduct } from '../types'

function row(over: Partial<ExtractedProduct & { user_edited: boolean }> = {}): ExtractedProduct & { user_edited: boolean } {
  return {
    name: 'BPC-157 5mg',
    sku: 'BPC-157',
    raw_name: 'BPC-157 5mg',
    raw_category: 'RECOVERY',
    family: 'HEALING',
    presentation: 'vial',
    unit_price: 900000,
    stock: 10,
    confidence: 0.97,
    reference_id: null,
    description: null,
    protocol: null,
    user_edited: false,
    ...over,
  }
}

describe('commitExtractedCatalog', () => {
  it('inserts products with presentation, provenance, and per-row stock', async () => {
    const captured: { table: string; rows: unknown[] }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          select() {
            return { eq: () => Promise.resolve({ data: [], error: null }) }
          },
          insert(rows: unknown[]) {
            captured.push({ table, rows })
            const out = table === 'products'
              ? (rows as { sku: string }[]).map((r, i) => ({ id: `pid-${i}`, sku: r.sku }))
              : null
            return {
              select: () => Promise.resolve({ data: out, error: null }),
              then: (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null }),
            }
          },
        }
      },
    } as unknown as Parameters<typeof commitExtractedCatalog>[0]['supabase']

    const input: CommitInput = {
      rows: [row({ stock: 25 })],
      source_file_ref: 'abc',
      source_filename: 'list.pdf',
      model: 'google/gemini-2.5-pro',
    }

    const result = await commitExtractedCatalog({ supabase: fakeSupabase, tenantId: 'tenant-1', input })
    expect(result.count).toBe(1)

    const productsCall = captured.find(c => c.table === 'products')!
    const product = productsCall.rows[0] as {
      sku: string; tenant_id: string; product_family: string; presentation: string | null;
      resources: { provenance: { source: string; user_edited: boolean; raw_family: string | null } };
    }
    expect(product.sku).toBe('BPC-157')
    expect(product.tenant_id).toBe('tenant-1')
    expect(product.product_family).toBe('HEALING')
    expect(product.presentation).toBe('vial')
    expect(product.resources.provenance.source).toBe('extraction')
    expect(product.resources.provenance.raw_family).toBe('RECOVERY')
    expect(product.resources.provenance.user_edited).toBe(false)

    const batchesCall = captured.find(c => c.table === 'batches')!
    expect(batchesCall.rows).toHaveLength(1)
    expect((batchesCall.rows[0] as { product_id: string }).product_id).toBe('pid-0')
    expect((batchesCall.rows[0] as { stock: number }).stock).toBe(25)
  })

  it('falls back to "OTHER" when family is null', async () => {
    const captured: { table: string; rows: unknown[] }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          select() { return { eq: () => Promise.resolve({ data: [], error: null }) } },
          insert(rows: unknown[]) {
            captured.push({ table, rows })
            return {
              select: () => Promise.resolve({ data: table === 'products' ? [{ id: 'pid-0', sku: 'x' }] : null, error: null }),
              then: (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null }),
            }
          },
        }
      },
    } as unknown as Parameters<typeof commitExtractedCatalog>[0]['supabase']

    await commitExtractedCatalog({
      supabase: fakeSupabase,
      tenantId: 't',
      input: {
        rows: [row({ family: null, raw_category: null, presentation: null, user_edited: true })],
        source_file_ref: 'f', source_filename: 'f.pdf', model: 'm',
      },
    })

    const productsCall = captured.find(c => c.table === 'products')!
    expect((productsCall.rows[0] as { product_family: string }).product_family).toBe('OTHER')
    expect((productsCall.rows[0] as { presentation: string | null }).presentation).toBeNull()
  })

  it('dedupes SKUs against existing tenant skus', async () => {
    const captured: { table: string; rows: unknown[] }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          select() {
            return { eq: () => Promise.resolve({ data: [{ sku: 'BPC-157' }], error: null }) }
          },
          insert(rows: unknown[]) {
            captured.push({ table, rows })
            return {
              select: () => Promise.resolve({ data: table === 'products' ? [{ id: 'pid-0', sku: 'BPC-157-2' }] : null, error: null }),
              then: (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null }),
            }
          },
        }
      },
    } as unknown as Parameters<typeof commitExtractedCatalog>[0]['supabase']

    await commitExtractedCatalog({
      supabase: fakeSupabase,
      tenantId: 't',
      input: {
        rows: [row({ family: null, raw_category: null })],
        source_file_ref: 'f', source_filename: 'f.pdf', model: 'm',
      },
    })

    const productsCall = captured.find(c => c.table === 'products')!
    expect((productsCall.rows[0] as { sku: string }).sku).toBe('BPC-157-2')
  })

  it('uses the user-edited SKU when one is supplied on the row', async () => {
    const captured: { table: string; rows: unknown[] }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          select() { return { eq: () => Promise.resolve({ data: [], error: null }) } },
          insert(rows: unknown[]) {
            captured.push({ table, rows })
            return {
              select: () => Promise.resolve({ data: table === 'products' ? [{ id: 'pid-0', sku: (rows as { sku: string }[])[0].sku }] : null, error: null }),
              then: (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null }),
            }
          },
        }
      },
    } as unknown as Parameters<typeof commitExtractedCatalog>[0]['supabase']

    await commitExtractedCatalog({
      supabase: fakeSupabase,
      tenantId: 't',
      input: {
        rows: [row({ sku: 'MY-CUSTOM-SKU' })],
        source_file_ref: 'f', source_filename: 'f.pdf', model: 'm',
      },
    })

    const productsCall = captured.find(c => c.table === 'products')!
    expect((productsCall.rows[0] as { sku: string }).sku).toBe('MY-CUSTOM-SKU')
  })

  it('writes description to products.description when reference matched', async () => {
    const captured: { table: string; rows: unknown[] }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          select() { return { eq: () => Promise.resolve({ data: [], error: null }) } },
          insert(rows: unknown[]) {
            captured.push({ table, rows })
            return {
              select: () => Promise.resolve({ data: table === 'products' ? [{ id: 'pid-0', sku: (rows as { sku: string }[])[0].sku }] : null, error: null }),
              then: (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null }),
            }
          },
        }
      },
    } as unknown as Parameters<typeof commitExtractedCatalog>[0]['supabase']

    await commitExtractedCatalog({
      supabase: fakeSupabase,
      tenantId: 't',
      input: {
        rows: [row({
          reference_id: 'ref-bpc',
          description: 'Body Protection Compound-157.',
        })],
        source_file_ref: 'f', source_filename: 'f.pdf', model: 'm',
      },
    })

    const productsCall = captured.find(c => c.table === 'products')!
    const product = productsCall.rows[0] as { description: string | null }
    expect(product.description).toBe('Body Protection Compound-157.')
  })

  it('inserts a product_protocols row when reference protocol is present', async () => {
    const captured: { table: string; rows: unknown[] }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          select() { return { eq: () => Promise.resolve({ data: [], error: null }) } },
          insert(rows: unknown[]) {
            captured.push({ table, rows })
            return {
              select: () => Promise.resolve({ data: table === 'products' ? [{ id: 'pid-0', sku: (rows as { sku: string }[])[0].sku }] : null, error: null }),
              then: (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null }),
            }
          },
        }
      },
    } as unknown as Parameters<typeof commitExtractedCatalog>[0]['supabase']

    await commitExtractedCatalog({
      supabase: fakeSupabase,
      tenantId: 't',
      input: {
        rows: [row({
          reference_id: 'ref-bpc',
          protocol: {
            vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.1,
            frequency: 'once_daily', timing: 'morning', cycle_length_weeks: 10,
            notes: null, dose_display: '250mcg',
          },
        })],
        source_file_ref: 'f', source_filename: 'f.pdf', model: 'm',
      },
    })

    const protoCall = captured.find(c => c.table === 'product_protocols')
    expect(protoCall).toBeTruthy()
    expect(protoCall!.rows).toHaveLength(1)
    const protoRow = protoCall!.rows[0] as {
      tenant_id: string; product_id: string;
      vial_strength: string | null; reconstitution_ml: number | null;
      frequency: string | null; cycle_length_weeks: number | null;
    }
    expect(protoRow.tenant_id).toBe('t')
    expect(protoRow.product_id).toBe('pid-0')
    expect(protoRow.vial_strength).toBe('5mg/vial')
    expect(protoRow.frequency).toBe('once_daily')
    expect(protoRow.cycle_length_weeks).toBe(10)
  })

  it('does NOT insert product_protocols when no row matched a reference', async () => {
    const captured: { table: string; rows: unknown[] }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          select() { return { eq: () => Promise.resolve({ data: [], error: null }) } },
          insert(rows: unknown[]) {
            captured.push({ table, rows })
            return {
              select: () => Promise.resolve({ data: table === 'products' ? [{ id: 'pid-0', sku: (rows as { sku: string }[])[0].sku }] : null, error: null }),
              then: (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null }),
            }
          },
        }
      },
    } as unknown as Parameters<typeof commitExtractedCatalog>[0]['supabase']

    await commitExtractedCatalog({
      supabase: fakeSupabase,
      tenantId: 't',
      input: { rows: [row()], source_file_ref: 'f', source_filename: 'f.pdf', model: 'm' },
    })

    expect(captured.find(c => c.table === 'product_protocols')).toBeUndefined()
  })

  it('throws if rows is empty', async () => {
    const fakeSupabase = {} as Parameters<typeof commitExtractedCatalog>[0]['supabase']
    await expect(commitExtractedCatalog({
      supabase: fakeSupabase,
      tenantId: 't',
      input: { rows: [], source_file_ref: 'f', source_filename: 'f.pdf', model: 'm' },
    })).rejects.toThrow(/no rows/i)
  })
})
