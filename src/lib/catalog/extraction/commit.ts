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
  const rows = input.rows.map(r => {
    const provenance: Provenance = {
      source: 'extraction',
      model: input.model,
      extracted_at: extractedAt,
      source_file_ref: input.source_file_ref,
      source_filename: input.source_filename,
      raw_name: r.raw_name,
      confidence: r.confidence,
      user_edited: r.user_edited,
    }
    return {
      tenant_id:      tenantId,
      name:           r.name,
      sku:            generateSku(r.name, taken),
      product_family: r.category ?? 'UNCATEGORISED',
      unit_price:     r.unit_price,
      description:    null,
      resources:      { provenance } as unknown as import('@/types/database').Json,
    }
  })

  const { data: inserted, error: insertErr } = await supabase
    .from('products').insert(rows).select('id, sku') as unknown as { data: { id: string; sku: string }[] | null; error: { message: string } | null }
  if (insertErr || !inserted) throw new Error(insertErr?.message ?? 'Failed to insert products')

  // Seed a starter batch (10 units, SEED-001) for every product. Non-fatal if it fails.
  const batchRows = inserted.map(p => ({
    tenant_id:    tenantId,
    product_id:   p.id,
    batch_number: 'SEED-001',
    stock:        10,
  }))
  if (batchRows.length > 0) {
    await supabase.from('batches').insert(batchRows).then(() => {})
  }

  return { count: inserted.length, productIds: inserted.map(p => p.id) }
}
