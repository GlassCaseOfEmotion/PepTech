import type { AgentSupabase } from '@/lib/agent/types'
import type { CommitInput } from './types'
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

  const rowsWithSkus = input.rows.map(r => {
    // Prefer the SKU on the row (which may have been user-edited in the
    // proposal) — fall back to suggestSku(name) if for some reason it's
    // missing. Either way, reserveSku normalises + dedupes against
    // existing tenant SKUs and within this batch.
    const candidate = r.sku && r.sku.trim() ? r.sku : suggestSku(r.name)
    const finalSku = reserveSku(candidate, taken, r.name)
    return {
      sku: finalSku,
      stock: Math.max(0, Math.floor(r.stock ?? 10)),
      protocol: r.protocol,
      referenceId: r.reference_id,
      row: {
        tenant_id:      tenantId,
        name:           r.name,
        sku:            finalSku,
        product_family: r.family ?? 'OTHER',
        presentation:   r.presentation ?? null,
        unit_price:     r.unit_price,
        description:    r.description ?? null,
        // resources is for product marketing links (legacy shape:
        // { label, url }[]). We don't write any on import — the imported
        // product starts with an empty links list and the tenant adds
        // links later via the catalog edit form.
        resources:      [] as unknown as import('@/types/database').Json,
      },
    }
  })

  const { data: inserted, error: insertErr } = await supabase
    .from('products').insert(rowsWithSkus.map(r => r.row)).select('id, sku') as unknown as { data: { id: string; sku: string }[] | null; error: { message: string } | null }
  if (insertErr || !inserted) throw new Error(insertErr?.message ?? 'Failed to insert products')

  // Match returned product ids back to their per-row stock (by sku, since order
  // is not guaranteed across the round-trip). batch_number is unique per tenant
  // (DB-level constraint), so we suffix with the SKU to avoid collisions when
  // seeding multiple products in one go — SEED-RETA-10, SEED-BPC157-5, etc.
  const stockBySku = new Map(rowsWithSkus.map(r => [r.sku, r.stock]))
  const batchRows = inserted.map(p => ({
    tenant_id:    tenantId,
    product_id:   p.id,
    batch_number: `SEED-${p.sku}`,
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

  // Create product_protocols rows for products whose extraction matched a
  // peptide_reference with protocol data. Non-fatal but logged on error.
  const protocolBySku = new Map(
    rowsWithSkus
      .filter(r => r.protocol)
      .map(r => [r.sku, r.protocol!]),
  )
  if (protocolBySku.size > 0) {
    const protocolRows = inserted
      .map(p => {
        const proto = protocolBySku.get(p.sku)
        // draw_volume_ml, frequency, reconstitution_ml are required (NOT NULL) in
        // the product_protocols table — skip if any required field is absent.
        if (!proto || proto.draw_volume_ml == null || proto.frequency == null || proto.reconstitution_ml == null) return null
        return {
          tenant_id:          tenantId,
          product_id:         p.id,
          vial_strength:      proto.vial_strength,
          reconstitution_ml:  proto.reconstitution_ml,
          draw_volume_ml:     proto.draw_volume_ml,
          frequency:          proto.frequency,
          timing:             proto.timing,
          cycle_length_weeks: proto.cycle_length_weeks,
          notes:              proto.notes,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
    if (protocolRows.length > 0) {
      const { error: protoErr } = await supabase.from('product_protocols').insert(protocolRows)
      if (protoErr) {
        console.error('[commitExtractedCatalog] product_protocols insert failed', {
          message: protoErr.message,
          count: protocolRows.length,
        })
      }
    }
  }

  return { count: inserted.length, productIds: inserted.map(p => p.id) }
}
