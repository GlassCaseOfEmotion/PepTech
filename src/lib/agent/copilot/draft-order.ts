import type { AgentSupabase } from '../types'

export interface DraftItem { product_id: string; qty: number; unit_price_snapshot: number }
export interface ItemDelta { product_id: string; qty: number }

/** Pure: apply qty deltas to the current line items using a product→price map.
 * qty<=0 removes the line; products absent from the price map (not in the
 * tenant catalog) are ignored. Returns the merged items + recomputed total. */
export function applyItemDeltas(
  current: DraftItem[],
  deltas: ItemDelta[],
  priceMap: Record<string, number>,
): { items: DraftItem[]; total: number } {
  const byId = new Map(current.map(i => [i.product_id, { ...i }]))
  for (const d of deltas) {
    if (!(d.product_id in priceMap)) continue
    if (d.qty <= 0) { byId.delete(d.product_id); continue }
    byId.set(d.product_id, { product_id: d.product_id, qty: d.qty, unit_price_snapshot: priceMap[d.product_id] })
  }
  const items = [...byId.values()]
  const total = items.reduce((s, i) => s + i.qty * i.unit_price_snapshot, 0)
  return { items, total }
}

/** Find the open draft order for a conversation, or create one. Tenant-scoped. */
export async function getOrCreateDraftOrder(
  supabase: AgentSupabase, tenantId: string, conversationId: string, customerId: string,
): Promise<{ id: string; ref_number: string } | null> {
  const { data: existing } = await supabase
    .from('orders')
    .select('id, ref_number')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .eq('status', 'draft')
    .maybeSingle()
  if (existing?.id) return { id: existing.id as string, ref_number: existing.ref_number as string }

  const { data: refNumber, error: refErr } = await supabase.rpc('next_order_ref', { p_tenant_id: tenantId })
  if (refErr || !refNumber) { console.error('[copilot] next_order_ref failed', refErr?.message); return null }

  const { data: tenant } = await supabase.from('tenants').select('base_currency').eq('id', tenantId).single()
  const currency = (tenant?.base_currency as string | null) ?? 'USD'

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      tenant_id: tenantId, ref_number: refNumber as string, customer_id: customerId,
      conversation_id: conversationId, status: 'draft', payment_amount: 0, currency,
    })
    .select('id, ref_number')
    .single()
  if (error || !order) { console.error('[copilot] draft order insert failed', error?.message); return null }
  return { id: order.id as string, ref_number: order.ref_number as string }
}

async function recompute(supabase: AgentSupabase, tenantId: string, orderId: string) {
  const { data: items } = await supabase
    .from('order_items').select('qty, unit_price_snapshot').eq('tenant_id', tenantId).eq('order_id', orderId)
  const total = (items ?? []).reduce((s, i) => s + (i.qty as number) * (i.unit_price_snapshot as number), 0)
  await supabase.from('orders').update({ payment_amount: total, payment_amount_base: total }).eq('id', orderId).eq('tenant_id', tenantId)
  return total
}

/** Merge qty deltas into the conversation's draft order. Tenant-scoped. */
export async function mergeDraftItems(
  supabase: AgentSupabase, tenantId: string, conversationId: string, customerId: string, deltas: ItemDelta[],
): Promise<{ orderId: string; total: number } | { error: string }> {
  const draft = await getOrCreateDraftOrder(supabase, tenantId, conversationId, customerId)
  if (!draft) return { error: 'Could not open a draft order' }

  const productIds = deltas.map(d => d.product_id)
  const { data: products } = await supabase
    .from('products').select('id, unit_price').eq('tenant_id', tenantId).in('id', productIds)
  const priceMap: Record<string, number> = Object.fromEntries((products ?? []).map(p => [p.id as string, p.unit_price as number]))

  const { data: existing } = await supabase
    .from('order_items').select('product_id, qty, unit_price_snapshot').eq('tenant_id', tenantId).eq('order_id', draft.id)
  const current: DraftItem[] = (existing ?? []).map(i => ({ product_id: i.product_id as string, qty: i.qty as number, unit_price_snapshot: i.unit_price_snapshot as number }))

  const { items } = applyItemDeltas(current, deltas, priceMap)

  await supabase.from('order_items').delete().eq('tenant_id', tenantId).eq('order_id', draft.id)
  if (items.length) {
    await supabase.from('order_items').insert(items.map(i => ({
      tenant_id: tenantId, order_id: draft.id, product_id: i.product_id, qty: i.qty, unit_price_snapshot: i.unit_price_snapshot,
    })))
  }
  const total = await recompute(supabase, tenantId, draft.id)
  return { orderId: draft.id, total }
}

export async function setShipping(
  supabase: AgentSupabase, tenantId: string, conversationId: string, customerId: string, shipping: Record<string, unknown>,
): Promise<{ orderId: string } | { error: string }> {
  const draft = await getOrCreateDraftOrder(supabase, tenantId, conversationId, customerId)
  if (!draft) return { error: 'Could not open a draft order' }
  await supabase.from('orders').update({ shipping_address: shipping as never }).eq('id', draft.id).eq('tenant_id', tenantId)
  return { orderId: draft.id }
}

export async function setPaymentAsset(
  supabase: AgentSupabase, tenantId: string, conversationId: string, customerId: string, paymentAsset: string,
): Promise<{ orderId: string } | { error: string }> {
  const draft = await getOrCreateDraftOrder(supabase, tenantId, conversationId, customerId)
  if (!draft) return { error: 'Could not open a draft order' }
  await supabase.from('orders').update({ payment_asset: paymentAsset }).eq('id', draft.id).eq('tenant_id', tenantId)
  return { orderId: draft.id }
}

export async function readDraftOrder(
  supabase: AgentSupabase, tenantId: string, conversationId: string,
): Promise<unknown> {
  const { data: order } = await supabase
    .from('orders')
    .select('id, ref_number, status, payment_amount, payment_asset, currency, shipping_address, order_items(product_id, qty, unit_price_snapshot, products(name))')
    .eq('tenant_id', tenantId).eq('conversation_id', conversationId).eq('status', 'draft').maybeSingle()
  return order ?? null
}

/** Flip the conversation's draft order to 'created' (enters the normal pipeline). */
export async function finalizeDraftOrder(
  supabase: AgentSupabase, tenantId: string, conversationId: string,
): Promise<{ orderId: string; refNumber: string } | { error: string }> {
  const { data: order } = await supabase
    .from('orders').select('id, ref_number, status').eq('tenant_id', tenantId).eq('conversation_id', conversationId).eq('status', 'draft').maybeSingle()
  if (!order) return { error: 'No draft order to finalize' }
  const { error } = await supabase.from('orders').update({ status: 'created' }).eq('id', order.id).eq('tenant_id', tenantId)
  if (error) return { error: error.message }
  await supabase.from('order_events').insert({
    tenant_id: tenantId, order_id: order.id, actor: 'agent', action: 'Order finalized by copilot',
  } as never)
  return { orderId: order.id as string, refNumber: order.ref_number as string }
}
