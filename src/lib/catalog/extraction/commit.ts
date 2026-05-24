import type { AgentSupabase } from '@/lib/agent/types'
import type { CommitInput, Provenance } from './types'
import { reserveSku, suggestSku } from './validate'

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
    // Prefer the SKU on the row (which may have been user-edited in the
    // proposal) — fall back to suggestSku(name) if for some reason it's
    // missing. Either way, reserveSku normalises + dedupes against
    // existing tenant SKUs and within this batch.
    const candidate = r.sku && r.sku.trim() ? r.sku : suggestSku(r.name)
    const finalSku = reserveSku(candidate, taken, r.name)
    return {
      sku: finalSku,
      stock: Math.max(0, Math.floor(r.stock ?? 10)),
      row: {
        tenant_id:      tenantId,
        name:           r.name,
        sku:            finalSku,
        product_family: r.family ?? 'OTHER',
        presentation:   r.presentation ?? null,
        unit_price:     r.unit_price,
        description:    null,
        resources:      { provenance } as unknown as import('@/types/database').Json,
      },
    }
  })

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
    // Explicit error logging — the previous `.then(() => {})` swallowed any
    // failure silently and left products without any stock-on-hand. We still
    // don't throw (products are committed; better to surface in logs and let
    // the user adjust stock from the dashboard) but we no longer hide it.
    const { error: batchErr } = await supabase.from('batches').insert(batchRows)
    if (batchErr) {
      console.error('[commitExtractedCatalog] batches insert failed', {
        message: batchErr.message,
        count: batchRows.length,
        sample: batchRows[0],
      })
    }
  }

  return { count: inserted.length, productIds: inserted.map(p => p.id) }
}
