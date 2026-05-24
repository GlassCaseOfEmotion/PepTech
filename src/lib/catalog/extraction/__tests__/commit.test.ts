import { describe, it, expect, vi } from 'vitest'
import { commitExtractedCatalog } from '../commit'
import type { CommitInput } from '../types'

function mockSupabase(opts: { existingSkus?: string[]; productsInsertResult?: { id: string; sku: string }[] } = {}) {
  const inserts: { table: string; rows: unknown[] }[] = []
  const supabase = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            // existing skus lookup
            // returns array of { sku }
            then: undefined,
            data: (opts.existingSkus ?? []).map(s => ({ sku: s })),
            error: null,
          }),
        }),
        insert: (rows: unknown[]) => ({
          select: () => ({
            data: opts.productsInsertResult ?? (rows as { sku: string }[]).map((r, i) => ({ id: `id-${i}`, sku: r.sku })),
            error: null,
          }),
          // for batches insert (no .select())
          data: null,
          error: null,
          then: (resolve: (v: { data: null; error: null }) => void) => resolve({ data: null, error: null }),
        }),
      }
    },
  }
  // Hijack the select-eq chain: tests below use a helper to drive it differently
  return { supabase, inserts }
}

describe('commitExtractedCatalog', () => {
  it('inserts products with provenance and seed batches', async () => {
    const captured: { table: string; rows: unknown[] }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          select() {
            return {
              eq: () => Promise.resolve({ data: [], error: null }),
            }
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
      rows: [
        { name: 'BPC-157 5mg', raw_name: 'BPC-157 5mg', category: 'RECOVERY', unit_price: 900000, confidence: 0.97, user_edited: false },
      ],
      source_file_ref: 'abc',
      source_filename: 'list.pdf',
      model: 'google/gemini-2.5-pro',
    }

    const result = await commitExtractedCatalog({ supabase: fakeSupabase, tenantId: 'tenant-1', input })
    expect(result.count).toBe(1)

    const productsCall = captured.find(c => c.table === 'products')!
    expect((productsCall.rows[0] as { sku: string }).sku).toBe('bpc-157-5mg')
    expect((productsCall.rows[0] as { tenant_id: string }).tenant_id).toBe('tenant-1')
    expect((productsCall.rows[0] as { product_family: string }).product_family).toBe('RECOVERY')
    const prov = (productsCall.rows[0] as { resources: { provenance: { source: string; user_edited: boolean } } }).resources.provenance
    expect(prov.source).toBe('extraction')
    expect(prov.user_edited).toBe(false)

    const batchesCall = captured.find(c => c.table === 'batches')!
    expect(batchesCall.rows).toHaveLength(1)
    expect((batchesCall.rows[0] as { product_id: string }).product_id).toBe('pid-0')
  })

  it('falls back to "UNCATEGORISED" when category is null', async () => {
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
        rows: [{ name: 'X', raw_name: 'X', category: null, unit_price: 1, confidence: 1, user_edited: true }],
        source_file_ref: 'f', source_filename: 'f.pdf', model: 'm',
      },
    })

    const productsCall = captured.find(c => c.table === 'products')!
    expect((productsCall.rows[0] as { product_family: string }).product_family).toBe('UNCATEGORISED')
  })

  it('dedupes SKUs against existing tenant skus', async () => {
    const captured: { table: string; rows: unknown[] }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          select() {
            return {
              eq: () => Promise.resolve({ data: [{ sku: 'bpc-157-5mg' }], error: null }),
            }
          },
          insert(rows: unknown[]) {
            captured.push({ table, rows })
            return {
              select: () => Promise.resolve({ data: table === 'products' ? [{ id: 'pid-0', sku: 'bpc-157-5mg-2' }] : null, error: null }),
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
        rows: [{ name: 'BPC-157 5mg', raw_name: 'x', category: null, unit_price: 1, confidence: 1, user_edited: false }],
        source_file_ref: 'f', source_filename: 'f.pdf', model: 'm',
      },
    })

    const productsCall = captured.find(c => c.table === 'products')!
    expect((productsCall.rows[0] as { sku: string }).sku).toBe('bpc-157-5mg-2')
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
