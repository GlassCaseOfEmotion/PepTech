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
    if (itemsError) return { error: itemsError.message }

    await supabase.from('order_events').insert({
      tenant_id: tenantId,
      order_id: order.id,
      actor: 'operator',
      action: data.conversationId ? 'Order drafted from chat' : 'Order created',
      note: data.conversationId ? `via Inbox · conv ${data.conversationId.slice(0, 8)}` : null,
    })

    revalidatePath('/orders')
    return { success: true, orderId: order.id, refNumber: order.ref_number }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateOrderStatus(orderId: string, status: string): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    await supabase.from('orders')
      .update({ status })
      .eq('id', orderId).eq('tenant_id', tenantId)
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
    await supabase.from('orders').update({
      carrier: data.carrier ?? null,
      tracking_number: data.trackingNumber ?? null,
      shipping_address: data.shippingAddress ?? null,
    }).eq('id', orderId).eq('tenant_id', tenantId)
    revalidatePath(`/orders/${orderId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function saveOrderNotes(orderId: string, notes: string): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    await supabase.from('orders')
      .update({ notes })
      .eq('id', orderId).eq('tenant_id', tenantId)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
