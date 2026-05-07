import type { AgentTool, AgentSupabase } from '../types'

const ALLOWED_FROM: Record<string, string> = {
  awaiting: 'confirming',
  confirming: 'packing',
  packing: 'shipped',
  shipped: 'delivered',
}

export const createOrder: AgentTool = {
  name: 'create_order',
  description: 'Create a new order for a customer with specified line items and payment asset.',
  requiresConfirmation: true,
  inputSchema: {
    type: 'object',
    required: ['customer_id', 'items', 'payment_asset'],
    properties: {
      customer_id:   { type: 'string', description: 'Customer UUID' },
      payment_asset: { type: 'string', description: 'e.g. USDT, BTC, XMR' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['product_id', 'qty'],
          properties: {
            product_id: { type: 'string' },
            qty:        { type: 'number' },
          },
        },
      },
    },
  },
  summarise(raw: Record<string, unknown>) {
    const items = raw.items as unknown[]
    return `Create order for ${items?.length ?? '?'} item(s) · ${raw.payment_asset}`
  },
  async execute(raw: Record<string, unknown>, supabase: AgentSupabase, tenantId: string) {
    const input = raw as { customer_id: string; items: { product_id: string; qty: number }[]; payment_asset: string }

    const productIds = input.items.map(i => i.product_id)
    const { data: products, error: prodErr } = await supabase
      .from('products').select('id, name, unit_price').in('id', productIds)
    if (prodErr || !products) throw new Error(prodErr?.message ?? 'Could not fetch products')

    const priceMap = Object.fromEntries(products.map(p => [p.id, p]))
    const paymentAmount = input.items.reduce((s, i) => s + i.qty * (priceMap[i.product_id]?.unit_price ?? 0), 0)

    const { data: refNumber, error: refErr } = await supabase.rpc('next_order_ref', { p_tenant_id: tenantId })
    if (refErr || !refNumber) throw new Error('Failed to generate order reference')

    const { data: order, error: orderErr } = await supabase.from('orders').insert({
      tenant_id: tenantId,
      ref_number: refNumber as string,
      customer_id: input.customer_id,
      payment_asset: input.payment_asset,
      payment_amount: paymentAmount,
    }).select('id, ref_number').single()
    if (orderErr || !order) throw new Error(orderErr?.message ?? 'Failed to create order')

    const { error: itemsErr } = await supabase.from('order_items').insert(
      input.items.map(i => ({
        tenant_id: tenantId,
        order_id: order.id,
        product_id: i.product_id,
        qty: i.qty,
        unit_price_snapshot: priceMap[i.product_id]?.unit_price ?? 0,
      }))
    )
    if (itemsErr) {
      await supabase.from('orders').delete().eq('id', order.id)
      throw new Error(itemsErr.message)
    }

    await supabase.from('order_events').insert({
      tenant_id: tenantId, order_id: order.id, actor: 'agent', action: 'Order created by agent',
    })

    return { orderId: order.id, refNumber: order.ref_number, paymentAmount }
  },
}

export const updateOrderStatus: AgentTool = {
  name: 'update_order_status',
  description: 'Advance an order to the next status. Valid transitions: awaiting→confirming→packing→shipped→delivered.',
  requiresConfirmation: true,
  inputSchema: {
    type: 'object',
    required: ['order_id', 'status'],
    properties: {
      order_id: { type: 'string', description: 'Order UUID or ref number like A-1012' },
      status:   { type: 'string', description: 'New status: confirming, packing, shipped, delivered' },
    },
  },
  summarise(raw: Record<string, unknown>) {
    return `Move order ${raw.order_id} → ${raw.status}`
  },
  async execute(raw: Record<string, unknown>, supabase: AgentSupabase, tenantId: string) {
    const input = raw as { order_id: string; status: string }
    const VALID = ['awaiting', 'confirming', 'packing', 'shipped', 'delivered']
    if (!VALID.includes(input.status)) throw new Error(`Invalid status: ${input.status}`)

    const { data: current } = await supabase
      .from('orders').select('id, status').eq('id', input.order_id).eq('tenant_id', tenantId).single()
    if (!current) throw new Error('Order not found')
    if (ALLOWED_FROM[current.status] !== input.status) {
      throw new Error(`Cannot move from ${current.status} → ${input.status}`)
    }

    const { error } = await supabase.from('orders').update({ status: input.status }).eq('id', current.id)
    if (error) throw new Error(error.message)

    await supabase.from('order_events').insert({
      tenant_id: tenantId, order_id: current.id,
      actor: 'agent', action: `Status → ${input.status}`,
    })

    return { orderId: current.id, newStatus: input.status }
  },
}

export const generateInvoice: AgentTool = {
  name: 'generate_invoice',
  description: 'Generate a PDF invoice for an order and store it. Returns the invoice number.',
  requiresConfirmation: true,
  inputSchema: {
    type: 'object',
    required: ['order_id'],
    properties: {
      order_id: { type: 'string', description: 'Order UUID' },
    },
  },
  summarise(raw: Record<string, unknown>) {
    return `Generate invoice for order ${raw.order_id}`
  },
  async execute(raw: Record<string, unknown>) {
    const input = raw as { order_id: string }
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/invoices/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: input.order_id }),
    })
    if (!res.ok) {
      const { error } = await res.json() as { error: string }
      throw new Error(error ?? 'Invoice generation failed')
    }
    return await res.json()
  },
}

export const WRITE_TOOLS: AgentTool[] = [createOrder, updateOrderStatus, generateInvoice]
