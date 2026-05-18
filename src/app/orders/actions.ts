'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { buildAssignments } from './utils'
import { runAutomationsForEvent } from '@/lib/automations/engine'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id }
}

const STATUS_LABELS: Record<string, string> = {
  awaiting: 'Awaiting payment', confirming: 'Confirming',
  packing: 'Packing', shipped: 'Shipped', delivered: 'Delivered',
}

export async function createOrder(data: {
  customerId: string
  conversationId?: string
  paymentAsset: string
  paymentAmount: number
  paymentAddress?: string
  shippingAddress?: { ln1: string; ln2?: string; city: string; state: string; zip: string }
  notes?: string
  items: { productId: string; batchId?: string; qty: number; unitPriceSnapshot: number }[]
}): Promise<{ success: true; orderId: string; refNumber: string } | { error: string }> {
  if (data.items.length === 0) return { error: 'Order must have at least one item' }

  for (const it of data.items) {
    if (!it.productId) return { error: 'All items must have a product selected' }
    if (it.qty < 1) return { error: 'Quantity must be at least 1' }
    if (it.unitPriceSnapshot <= 0) return { error: 'Unit price must be greater than 0' }
  }

  try {
    const { supabase, tenantId } = await getTenantId()

    // Fetch tenant's base currency
    const { data: tenantRow } = await supabase
      .from('tenants').select('base_currency').eq('id', tenantId).single()
    const currency = tenantRow?.base_currency ?? 'USD'

    // For crypto payments with non-USD base currency, fetch and cache exchange rate
    const FIAT_ASSETS = new Set(['cash', 'bank_transfer', 'customer_chooses'])
    const isCrypto = !FIAT_ASSETS.has(data.paymentAsset)
    let exchangeRate: number | null = null

    if (isCrypto && currency !== 'USD') {
      const TTL_MS = 60 * 60 * 1000
      const { data: cached } = await supabase
        .from('exchange_rates')
        .select('rate, fetched_at')
        .eq('from_currency', data.paymentAsset)
        .eq('to_currency', currency)
        .single()

      if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
        exchangeRate = Number(cached.rate)
      } else {
        try {
          const { fetchAssetToBaseRate } = await import('@/lib/currency')
          exchangeRate = await fetchAssetToBaseRate(data.paymentAsset, currency)
          await supabase.from('exchange_rates').upsert(
            { from_currency: data.paymentAsset, to_currency: currency, rate: exchangeRate, fetched_at: new Date().toISOString() },
            { onConflict: 'from_currency,to_currency' }
          )
        } catch {
          // Non-fatal: order created without exchange_rate
        }
      }
    }

    // Generate per-tenant sequential ref number atomically
    const { data: refNumber, error: refError } = await supabase.rpc('next_order_ref', { p_tenant_id: tenantId })
    if (refError || !refNumber) return { error: refError?.message ?? 'Failed to generate order reference' }

    const { data: order, error: orderError } = await supabase.from('orders').insert({
      tenant_id: tenantId,
      ref_number: refNumber as string,
      customer_id: data.customerId,
      conversation_id: data.conversationId || null,
      payment_asset: data.paymentAsset,
      payment_amount: data.paymentAmount,
      payment_amount_base: data.paymentAmount,
      currency,
      exchange_rate: exchangeRate,
      payment_address: data.paymentAddress || null,
      shipping_address: data.shippingAddress || null,
      notes: data.notes || null,
    }).select('id, ref_number').single()

    if (orderError || !order) return { error: orderError?.message ?? 'Failed to create order' }

    const { error: itemsError } = await supabase.from('order_items').insert(
      data.items.map(it => ({
        tenant_id: tenantId,
        order_id: order.id,
        product_id: it.productId,
        batch_id: it.batchId || null,
        qty: it.qty,
        unit_price_snapshot: it.unitPriceSnapshot,
      }))
    )
    if (itemsError) {
      await supabase.from('orders').delete().eq('id', order.id)
      return { error: itemsError.message }
    }

    await supabase.from('order_events').insert({
      tenant_id: tenantId,
      order_id: order.id,
      actor: 'operator',
      action: data.conversationId ? 'Order drafted from chat' : 'Order created',
      note: data.conversationId ? `via Inbox · conv ${data.conversationId.slice(0, 8)}` : null,
    })

    revalidatePath('/orders')
    revalidatePath('/customers', 'layout')
    return { success: true, orderId: order.id, refNumber: order.ref_number }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

const ALLOWED_FROM: Record<string, string> = {
  awaiting: 'confirming',
  // confirming → packing is handled exclusively by packOrder
  packing: 'shipped',
  shipped: 'delivered',
}


export async function updateOrderStatus(orderId: string, status: string): Promise<{ success: true } | { error: string }> {
  const VALID_STATUSES = ['awaiting', 'confirming', 'packing', 'shipped', 'delivered']
  if (!VALID_STATUSES.includes(status)) return { error: `Invalid status: ${status}` }

  try {
    const { supabase, tenantId } = await getTenantId()

    // Enforce valid transition server-side — client guards are not enough
    const { data: current, error: fetchError } = await supabase
      .from('orders').select('status, customer_id').eq('id', orderId).eq('tenant_id', tenantId).single()
    if (fetchError || !current) return { error: 'Order not found' }
    if (ALLOWED_FROM[current.status] !== status) {
      return { error: `Cannot move from ${current.status} to ${status}` }
    }

    const { error: updateError } = await supabase.from('orders')
      .update({ status, ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}) })
      .eq('id', orderId).eq('tenant_id', tenantId)
    if (updateError) return { error: updateError.message }
    await supabase.from('order_events').insert({
      tenant_id: tenantId,
      order_id: orderId,
      actor: 'operator',
      action: `Moved to ${STATUS_LABELS[status] ?? status}`,
    })
    revalidatePath('/orders')
    revalidatePath(`/orders/${orderId}`)
    void runAutomationsForEvent(createServiceClient(), tenantId, 'order_state', {
      orderId,
      customerId: current.customer_id,
      toStatus: status,
      fromStatus: current.status,
    }).catch(console.error)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function packOrder(orderId: string): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('status, customer_id, order_items(id, product_id, qty, products(name))')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single()
    if (fetchError || !order) return { error: 'Order not found' }
    if (order.status !== 'confirming') return { error: 'Order must be in confirming status to pack' }

    const items = (order.order_items as { id: string; product_id: string; qty: number; products: { name: string } | null }[])

    // FIFO: for each item, find the oldest non-expired batch with sufficient stock
    const batchMap = new Map<string, string | null>()
    for (const item of items) {
      const { data: batch } = await supabase
        .from('batches')
        .select('id')
        .eq('product_id', item.product_id)
        .eq('tenant_id', tenantId)
        .gte('stock', item.qty)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .order('expires_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      batchMap.set(item.id, batch?.id ?? null)
    }

    const result = buildAssignments(
      items.map(i => ({ id: i.id, productName: i.products?.name ?? i.product_id, qty: i.qty })),
      batchMap,
    )
    if ('error' in result) return result

    const { error: rpcError } = await supabase.rpc('pack_order', {
      p_order_id: orderId,
      p_tenant_id: tenantId,
      p_assignments: result.assignments,
    })
    if (rpcError) return { error: rpcError.message }

    await supabase.from('order_events').insert({
      tenant_id: tenantId,
      order_id: orderId,
      actor: 'operator',
      action: 'Moved to Packing',
      note: `${result.assignments.length} batch${result.assignments.length !== 1 ? 'es' : ''} assigned`,
    })

    revalidatePath('/orders')
    revalidatePath(`/orders/${orderId}`)
    void runAutomationsForEvent(createServiceClient(), tenantId, 'order_state', {
      orderId,
      customerId: order.customer_id,
      toStatus: 'packing',
      fromStatus: 'confirming',
    }).catch(console.error)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateOrderShipping(orderId: string, data: {
  carrier?: string
  trackingNumber?: string
  shippingAddress?: { ln1: string; ln2?: string; city: string; state: string; zip: string }
}): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('orders').update({
      carrier: data.carrier ?? null,
      tracking_number: data.trackingNumber ?? null,
      shipping_address: data.shippingAddress ?? null,
    }).eq('id', orderId).eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath(`/orders/${orderId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function shipOrder(
  orderId: string,
  data: { carrier: string; trackingNumber?: string; trackingUrl?: string; estimatedDelivery?: string }
): Promise<{ success: true } | { error: string }> {
  if (!data.carrier.trim()) return { error: 'Carrier is required' }

  try {
    const { supabase, tenantId } = await getTenantId()

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'shipped',
        carrier: data.carrier,
        tracking_number: data.trackingNumber ?? null,
        tracking_url: data.trackingUrl ?? null,
        estimated_delivery: data.estimatedDelivery ?? null,
        shipped_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .eq('status', 'packing')
      .select('id, customer_id')

    if (updateError) return { error: updateError.message }
    if (!updated || updated.length === 0) return { error: 'Order not found or not in packing status' }

    await supabase.from('order_events').insert({
      tenant_id: tenantId,
      order_id: orderId,
      actor: 'operator',
      action: 'Moved to Shipped',
      note: `Carrier: ${data.carrier}${data.trackingNumber ? ', Tracking: ' + data.trackingNumber : ''}`,
    })

    revalidatePath('/orders')
    revalidatePath(`/orders/${orderId}`)
    revalidatePath('/')
    void runAutomationsForEvent(createServiceClient(), tenantId, 'order_state', {
      orderId,
      customerId: updated[0].customer_id,
      toStatus: 'shipped',
      fromStatus: 'packing',
    }).catch(console.error)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function saveOrderNotes(orderId: string, notes: string): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('orders')
      .update({ notes })
      .eq('id', orderId).eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath(`/orders/${orderId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function confirmPayment(
  orderId: string,
  data: { actualPaymentAsset?: string; txHash?: string },
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()

    const { data: current, error: fetchError } = await supabase
      .from('orders')
      .select('status, payment_asset, customer_id')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single()
    if (fetchError || !current) return { error: 'Order not found' }
    if (current.status !== 'awaiting') return { error: 'Order is not awaiting payment' }

    const update: { status: string; payment_asset?: string; tx_hash?: string } = { status: 'confirming' }
    if (data.actualPaymentAsset) update.payment_asset = data.actualPaymentAsset
    if (data.txHash?.trim()) update.tx_hash = data.txHash.trim()

    const { error: updateError } = await supabase
      .from('orders')
      .update(update)
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
    if (updateError) return { error: updateError.message }

    await supabase.from('order_events').insert({
      tenant_id: tenantId,
      order_id: orderId,
      actor: 'operator',
      action: 'Moved to Confirming',
      note: data.txHash?.trim() ? `TX: ${data.txHash.trim().slice(0, 24)}…` : null,
    })

    revalidatePath('/orders')
    revalidatePath(`/orders/${orderId}`)
    void runAutomationsForEvent(createServiceClient(), tenantId, 'order_state', {
      orderId,
      customerId: current.customer_id,
      toStatus: 'confirming',
      fromStatus: current.status,
    }).catch(console.error)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
