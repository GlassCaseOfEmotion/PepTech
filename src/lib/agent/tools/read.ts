import type { AgentTool, AgentSupabase } from '../types'

const ORDER_SELECT = `
  id, ref_number, status, payment_asset, payment_amount, payment_address,
  created_at, updated_at,
  customers (id, display_name, trust_score, ltv),
  order_items (id, qty, unit_price_snapshot, products (sku, name))
`

export const queryCustomers: AgentTool = {
  name: 'query_customers',
  description: 'Search and filter customers. Returns a list with display name, trust score, LTV, tags, and primary channel. To find recently joined customers use created_after with an ISO date — do NOT use tag="new" for this purpose; tags are user-defined labels.',
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    properties: {
      name:          { type: 'string', description: 'Partial name match (case-insensitive)' },
      tag:           { type: 'string', description: 'Filter by a user-defined tag label e.g. "vip", "wholesale"' },
      min_ltv:       { type: 'number', description: 'Minimum lifetime value' },
      min_trust:     { type: 'number', description: 'Minimum trust score (0–100)' },
      created_after: { type: 'string', description: 'ISO date string — return only customers who joined after this date, e.g. "2026-05-01"' },
      limit:         { type: 'number', description: 'Max results (default 20)' },
    },
  },
  async execute(raw: Record<string, unknown>, supabase: AgentSupabase) {
    const input = raw as { name?: string; tag?: string; min_ltv?: number; min_trust?: number; created_after?: string; limit?: number }
    let q = supabase
      .from('customers')
      .select('id, display_name, trust_score, ltv, created_at, customer_tags(tag), customer_channels(channel_type, display_handle, is_primary)')
      .order('created_at', { ascending: false })
      .limit(input.limit ?? 20)

    if (input.name)          q = q.ilike('display_name', `%${input.name}%`)
    if (input.min_ltv  != null) q = q.gte('ltv', input.min_ltv)
    if (input.min_trust != null) q = q.gte('trust_score', input.min_trust)
    if (input.created_after)  q = q.gte('created_at', input.created_after)

    const { data, error } = await q
    if (error) throw new Error(error.message)

    let rows = data ?? []
    if (input.tag) rows = rows.filter(c => c.customer_tags.some((t: { tag: string }) => t.tag === input.tag))
    return rows.map(c => ({
      id: c.id,
      name: c.display_name,
      trust_score: c.trust_score,
      ltv: c.ltv,
      created_at: c.created_at,
      tags: c.customer_tags.map((t: { tag: string }) => t.tag),
      primary_channel: c.customer_channels.find((ch: { is_primary: boolean }) => ch.is_primary)?.display_handle ?? null,
    }))
  },
}

export const getCustomer: AgentTool = {
  name: 'get_customer',
  description: 'Get full profile for a specific customer including recent orders, notes, and channels.',
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    properties: {
      id:   { type: 'string', description: 'Customer UUID' },
      name: { type: 'string', description: 'Exact or partial name (used if id not provided)' },
    },
  },
  async execute(raw: Record<string, unknown>, supabase: AgentSupabase) {
    const input = raw as { id?: string; name?: string }
    let q = supabase
      .from('customers')
      .select('id, display_name, trust_score, ltv, created_at, customer_tags(tag), customer_channels(channel_type, display_handle, is_primary)')
    if (input.id)        q = (q as ReturnType<typeof q.eq>).eq('id', input.id).single() as never
    else if (input.name) q = (q as ReturnType<typeof q.ilike>).ilike('display_name', `%${input.name}%`).limit(1).single() as never
    else throw new Error('Provide id or name')

    const { data: customer, error } = await q as unknown as { data: { id: string; display_name: string; trust_score: number; ltv: number; created_at: string; customer_tags: { tag: string }[]; customer_channels: { channel_type: string; display_handle: string; is_primary: boolean }[] } | null; error: { message: string } | null }
    if (error || !customer) throw new Error(error?.message ?? 'Customer not found')

    const { data: orders } = await supabase
      .from('orders')
      .select('id, ref_number, status, payment_amount, payment_asset, created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(10)

    const { data: notes } = await supabase
      .from('notes')
      .select('id, content, created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(5)

    return { ...customer, recent_orders: orders ?? [], notes: notes ?? [] }
  },
}

export const queryOrders: AgentTool = {
  name: 'query_orders',
  description: 'Search orders by status, date range, or customer. Returns order summaries.',
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    properties: {
      status:      { type: 'string', description: 'Order status: new, paid, packing, shipped, delivered, cancelled' },
      customer_id: { type: 'string', description: 'Filter by customer UUID' },
      since:       { type: 'string', description: 'ISO date string, e.g. "2026-05-01"' },
      until:       { type: 'string', description: 'ISO date string' },
      limit:       { type: 'number', description: 'Max results (default 20)' },
    },
  },
  async execute(raw: Record<string, unknown>, supabase: AgentSupabase) {
    const input = raw as { status?: string; customer_id?: string; since?: string; until?: string; limit?: number }
    let q = supabase
      .from('orders')
      .select(ORDER_SELECT)
      .order('created_at', { ascending: false })
      .limit(input.limit ?? 20)

    if (input.status)      q = q.eq('status', input.status)
    if (input.customer_id) q = q.eq('customer_id', input.customer_id)
    if (input.since)       q = q.gte('created_at', input.since)
    if (input.until)       q = q.lte('created_at', input.until)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data ?? []
  },
}

export const getOrder: AgentTool = {
  name: 'get_order',
  description: 'Get full detail for a single order by ID or reference number (e.g. A-1012).',
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    properties: {
      id:         { type: 'string', description: 'Order UUID' },
      ref_number: { type: 'string', description: 'Order reference like A-1012' },
    },
  },
  async execute(raw: Record<string, unknown>, supabase: AgentSupabase) {
    const input = raw as { id?: string; ref_number?: string }
    let q = supabase.from('orders').select(ORDER_SELECT)
    if (input.id)             q = q.eq('id', input.id)
    else if (input.ref_number) q = q.eq('ref_number', input.ref_number)
    else throw new Error('Provide id or ref_number')

    const { data, error } = await q.single()
    if (error || !data) throw new Error(error?.message ?? 'Order not found')
    return data
  },
}

export const queryCatalog: AgentTool = {
  name: 'query_catalog',
  description: 'List products with stock levels and margins. Can filter to low-stock items or a specific family.',
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    properties: {
      family:    { type: 'string', description: 'Product family e.g. "GLP-1", "HEALING"' },
      low_stock: { type: 'boolean', description: 'If true, return only products with stock < 10' },
    },
  },
  async execute(raw: Record<string, unknown>, supabase: AgentSupabase) {
    const input = raw as { family?: string; low_stock?: boolean }
    const [{ data: products }, { data: batches }] = await Promise.all([
      supabase.from('products').select('id, sku, name, product_family, unit_price, cost_price, is_active').eq('is_active', true).order('name'),
      supabase.from('batches').select('id, product_id, batch_number, stock, expires_at'),
    ])

    const stockByProduct: Record<string, number> = {}
    for (const b of batches ?? []) {
      stockByProduct[b.product_id] = (stockByProduct[b.product_id] ?? 0) + b.stock
    }

    let rows = (products ?? []).map(p => ({
      ...p,
      total_stock: stockByProduct[p.id] ?? 0,
      margin_pct: p.cost_price && p.unit_price > 0
        ? Math.round(((p.unit_price - p.cost_price) / p.unit_price) * 100)
        : null,
    }))

    if (input.family)    rows = rows.filter(p => p.product_family === input.family)
    if (input.low_stock) rows = rows.filter(p => p.total_stock < 10)

    return rows
  },
}

export const getAnalytics: AgentTool = {
  name: 'get_analytics',
  description: 'Get business analytics: total revenue, order count, top products, top customers for a period.',
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    properties: {
      since: { type: 'string', description: 'ISO date string for start of period e.g. "2026-05-01"' },
      until: { type: 'string', description: 'ISO date string for end of period' },
    },
  },
  async execute(raw: Record<string, unknown>, supabase: AgentSupabase) {
    const input = raw as { since?: string; until?: string }
    let q = supabase
      .from('orders')
      .select('id, ref_number, status, payment_amount, payment_asset, created_at, customers(display_name), order_items(qty, unit_price_snapshot, products(name))')
      .not('status', 'in', '("cancelled")')

    if (input.since) q = q.gte('created_at', input.since)
    if (input.until) q = q.lte('created_at', input.until)

    const { data: orders, error } = await q
    if (error) throw new Error(error.message)

    const rows = orders ?? []
    const totalRevenue = rows.reduce((s, o) => s + (o.payment_amount ?? 0), 0)
    const byStatus: Record<string, number> = {}
    for (const o of rows) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1

    const unitsByProduct: Record<string, { name: string; units: number; revenue: number }> = {}
    for (const o of rows) {
      for (const item of (o.order_items as { qty: number; unit_price_snapshot: number; products: { name: string } | null }[]) ?? []) {
        const name = item.products?.name ?? 'Unknown'
        if (!unitsByProduct[name]) unitsByProduct[name] = { name, units: 0, revenue: 0 }
        unitsByProduct[name].units += item.qty
        unitsByProduct[name].revenue += item.qty * item.unit_price_snapshot
      }
    }
    const topProducts = Object.values(unitsByProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

    return {
      period: { since: input.since ?? 'all time', until: input.until ?? 'now' },
      total_revenue: totalRevenue,
      order_count: rows.length,
      orders_by_status: byStatus,
      top_products: topProducts,
    }
  },
}

export const getConversationMessages: AgentTool = {
  name: 'get_conversation_messages',
  description: 'Fetch recent messages from a conversation. Use this whenever the context includes a conversation ID — for drafting replies, summarising threads, or identifying outstanding requests.',
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    required: ['conversation_id'],
    properties: {
      conversation_id: { type: 'string', description: 'Conversation UUID from context' },
      limit: { type: 'number', description: 'Number of recent messages to fetch (default 30)' },
    },
  },
  async execute(raw: Record<string, unknown>, supabase: AgentSupabase) {
    const input = raw as { conversation_id: string; limit?: number }
    const { data, error } = await supabase
      .from('messages')
      .select('id, direction, content, sent_at, metadata')
      .eq('conversation_id', input.conversation_id)
      .order('sent_at', { ascending: false })
      .limit(input.limit ?? 30)
    if (error) throw new Error(error.message)
    return (data ?? []).reverse().map(m => ({
      direction: m.direction,
      content: m.content,
      sent_at: m.sent_at,
    }))
  },
}

export const READ_TOOLS: AgentTool[] = [
  queryCustomers, getCustomer, queryOrders, getOrder, queryCatalog, getAnalytics, getConversationMessages,
]
