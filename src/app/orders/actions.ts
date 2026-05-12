'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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
  confirming: 'packing',
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
      .from('orders').select('status').eq('id', orderId).eq('tenant_id', tenantId).single()
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
      .select('status, payment_asset')
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
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
