import type { AgentSupabase } from '@/lib/agent/types'
import type { CommitInput, Provenance } from './types'
import { generateSku } from './validate'

interface CommitParams {
  supabase: AgentSupabase
  tenantId: string
  input: CommitInput
}

export async function commitExtractedCatalog(params: CommitParams): Promise<{ count: number; productIds: string[] }> {
  const { supabase, tenantId, input } = params
  if (input.rows.length === 0) throw new Error('Commit failed: no rows to insert')

  // Load existing tenant SKUs so generated SKUs do not collide.
  const { data: existing, error: existErr } = await supabase
    .from('products').select('sku').eq('tenant_id', tenantId) as unknown as { data: { sku: string }[] | null; error: { message: string } | null }
  if (existErr) throw new Error(existErr.message)
  const taken = new Set((existing ?? []).map(r => r.sku))

  const extractedAt = new Date().toISOString()
  const rowsWithSkus = input.rows.map(r => {
    const provenance: Provenance = {
      source: 'extraction',
      model: input.model,
      extracted_at: extractedAt,
      source_file_ref: input.source_file_ref,
      source_filename: input.source_filename,
      raw_name: r.raw_name,
      raw_family: r.raw_category,
      confidence: r.confidence,
      user_edited: r.user_edited,
    }
    return {
      sku: generateSku(r.name, taken),
      stock: Math.max(0, Math.floor(r.stock ?? 10)),
      row: {
        tenant_id:      tenantId,
        name:           r.name,
        sku:            '',
        product_family: r.family ?? 'OTHER',
        presentation:   r.presentation ?? null,
        unit_price:     r.unit_price,
        description:    null,
        resources:      { provenance } as unknown as import('@/types/database').Json,
      },
    }
  })
  // Apply the generated SKU back onto each row (kept in the map for clarity).
  for (const r of rowsWithSkus) r.row.sku = r.sku

  const { data: inserted, error: insertErr } = await supabase
    .from('products').insert(rowsWithSkus.map(r => r.row)).select('id, sku') as unknown as { data: { id: string; sku: string }[] | null; error: { message: string } | null }
  if (insertErr || !inserted) throw new Error(insertErr?.message ?? 'Failed to insert products')

  // Match returned product ids back to their per-row stock (by sku, since order
  // is not guaranteed across the round-trip).
  const stockBySku = new Map(rowsWithSkus.map(r => [r.sku, r.stock]))
  const batchRows = inserted.map(p => ({
    tenant_id:    tenantId,
    product_id:   p.id,
    batch_number: 'SEED-001',
    stock:        stockBySku.get(p.sku) ?? 10,
  }))
  if (batchRows.length > 0) {
    await supabase.from('batches').insert(batchRows).then(() => {})
  }

  return { count: inserted.length, productIds: inserted.map(p => p.id) }
}
