import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/shell/DashboardLayout'
import { dbConversationToThread, type DbConversation } from '@/types/inbox'
import { dbProductToDisplay, type DbProduct, type DbBatch } from '@/types/catalog'
import type { DashboardStats } from '@/types/dashboard'
import { computeReorderSignals } from '@/lib/reorder-signals'
import type { ProductProtocol, CustomerProtocolOverride } from '@/types/protocols'
import type { ShipmentRow } from '@/types/orders'

const PINNED_SELECT = `
  id, status, unread_count, last_message_at, last_message_snippet,
  channel_type, channel_identifier, is_pinned,
  customers (
    id, display_name, trust_score, ltv,
    customer_tags (tag),
    customer_channels (channel_type, display_handle, is_primary)
  )
`

const CONV_SELECT = `
  id, status, unread_count, last_message_at, last_message_snippet,
  channel_type, channel_identifier,
  customers (
    id, display_name, trust_score, ltv,
    customer_tags (tag),
    customer_channels (channel_type, display_handle, is_primary)
  )
`

export default async function Home() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const now = Date.now()
  const d90 = new Date(now - 90 * 86400_000).toISOString()

  const d180 = new Date(now - 180 * 86400_000).toISOString()

  const [
    { data: userRow },
    { data: channels },
    { data: conversations },
    { data: pinnedConversations },
    { data: products },
    { data: batches },
    { data: revenueRows },
    { data: pendingRaw },
    { data: tenantRow },
    { data: reorderOrdersRaw },
    { data: reorderProtocols },
    { data: reorderOverrides },
    { data: shipmentsRaw },
  ] = await Promise.all([
    supabase.from('users').select('display_name, tenant_id').eq('id', user.id).single(),
    supabase.from('tenant_channels').select('channel_type').eq('is_active', true),
    supabase
      .from('conversations')
      .select(CONV_SELECT)
      .in('status', ['new', 'needs_reply', 'in_progress', 'snoozed'])
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50),
    supabase
      .from('conversations')
      .select(PINNED_SELECT)
      .eq('is_pinned', true)
      .order('last_message_at', { ascending: false, nullsFirst: false }),
    supabase.from('products').select('*').eq('is_active', true).order('name'),
    supabase.from('batches').select('*').order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('created_at, payment_amount_base, payment_amount')
      .neq('status', 'cancelled')
      .gte('created_at', d90),
    supabase
      .from('orders')
      .select('id, ref_number, payment_amount_base, payment_amount, payment_asset, status, created_at, customers(display_name)')
      .in('status', ['awaiting', 'confirming'])
      .neq('payment_asset', 'Cash')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('tenants').select('base_currency').single(),
    supabase
      .from('orders')
      .select('customer_id, status, created_at, delivered_at, customers(id, display_name), order_items(product_id, qty, products(id, name))')
      .in('status', ['delivered', 'shipped'])
      .gte('created_at', d180)
      .order('created_at', { ascending: false }),
    supabase.from('product_protocols').select('*'),
    supabase.from('customer_protocol_overrides').select('customer_id, product_id, draw_volume_ml, frequency, notes, id, tenant_id, created_at, updated_at'),
    supabase
      .from('orders')
      .select('id, ref_number, status, carrier, tracking_number, tracking_url, estimated_delivery, delivered_at, customers(display_name)')
      .in('status', ['shipped', 'delivered'])
      .order('updated_at', { ascending: false })
      .limit(6),
  ])

  // ── Revenue stats ────────────────────────────────────────────────────────
  const cutoff7d  = now - 7  * 86400_000
  const cutoff14d = now - 14 * 86400_000
  const dayMap = new Map<string, number>()
  let revenue7d = 0, revenuePrev7d = 0

  for (const row of revenueRows ?? []) {
    const key = (row.created_at as string).slice(0, 10)
    const amt = Number((row as { payment_amount_base?: number | null }).payment_amount_base ?? row.payment_amount)
    dayMap.set(key, (dayMap.get(key) ?? 0) + amt)
    const t = new Date(row.created_at as string).getTime()
    if (t >= cutoff7d)        revenue7d      += amt
    else if (t >= cutoff14d)  revenuePrev7d  += amt
  }

  const revenue90dDaily = Array.from({ length: 90 }, (_, i) => {
    const d = new Date(now - (89 - i) * 86400_000)
    const key   = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return { d: label, v: dayMap.get(key) ?? 0 }
  })

  // ── Pending orders ───────────────────────────────────────────────────────
  const pendingOrders = (pendingRaw ?? []).map(o => {
    const cust = o.customers as { display_name: string } | null
    return {
      id:           o.id as string,
      refNumber:    o.ref_number as string,
      customerName: cust?.display_name ?? 'Unknown',
      amount:       Number((o as { payment_amount_base?: number | null }).payment_amount_base ?? o.payment_amount),
      asset:        o.payment_asset as string,
      status:       o.status as 'awaiting' | 'confirming',
      minsAgo:      Math.floor((now - new Date(o.created_at as string).getTime()) / 60000),
    }
  })
  const pendingTotal = pendingOrders.reduce((s, o) => s + o.amount, 0)

  const stats: DashboardStats = { revenue7d, revenuePrev7d, revenue90dDaily, pendingOrders, pendingTotal }
  const baseCurrency = (tenantRow?.base_currency as string | null) ?? 'USD'

  // ── Reorder signals ──────────────────────────────────────────────────────
  const reorderOrders = (reorderOrdersRaw ?? []).map(o => ({
    customer_id: o.customer_id as string,
    customerName: (o.customers as { display_name: string } | null)?.display_name ?? 'Unknown',
    status: o.status as string,
    created_at: o.created_at as string,
    delivered_at: (o as { delivered_at?: string | null }).delivered_at ?? null,
    items: ((o.order_items ?? []) as { product_id: string; qty: number; products: { name: string } | null }[])
      .map(i => ({ product_id: i.product_id, productName: i.products?.name ?? '', qty: i.qty })),
  }))
  const reorderSignals = computeReorderSignals(
    reorderOrders,
    (reorderProtocols ?? []) as ProductProtocol[],
    (reorderOverrides ?? []) as CustomerProtocolOverride[],
  )

  // ── Shipments ────────────────────────────────────────────────────────────
  type ShipmentRaw = {
    id: string
    ref_number: string
    status: string
    carrier: string | null
    tracking_number: string | null
    tracking_url: string | null
    estimated_delivery: string | null
    delivered_at: string | null
    customers: { display_name: string } | null
  }

  const shipments: ShipmentRow[] = ((shipmentsRaw ?? []) as ShipmentRaw[]).map(o => ({
    id: o.id,
    refNumber: o.ref_number,
    to: o.customers?.display_name ?? '—',
    carrier: o.carrier,
    trackingNumber: o.tracking_number,
    trackingUrl: o.tracking_url,
    status: o.status as 'shipped' | 'delivered',
    estimatedDelivery: o.estimated_delivery,
    deliveredAt: o.delivered_at,
  }))

  // ── Other props ──────────────────────────────────────────────────────────
  const displayName      = userRow?.display_name ?? user.email?.split('@')[0] ?? 'User'
  const connectedChannels = (channels ?? []).map(c => c.channel_type)
  const threads          = (conversations ?? []).map(c => dbConversationToThread(c as unknown as DbConversation))

  const batchesByProduct: Record<string, DbBatch[]> = {}
  for (const b of (batches ?? []) as DbBatch[]) {
    if (!batchesByProduct[b.product_id]) batchesByProduct[b.product_id] = []
    batchesByProduct[b.product_id].push(b)
  }
  const stockProducts = (products ?? [] as DbProduct[]).map(p =>
    dbProductToDisplay(p as DbProduct, batchesByProduct[p.id] ?? [])
  )

  return (
    <DashboardLayout
      displayName={displayName}
      connectedChannels={connectedChannels}
      threads={threads}
      initialPinned={(pinnedConversations ?? []) as DbConversation[]}
      stockProducts={stockProducts}
      stats={stats}
      reorderSignals={reorderSignals}
      baseCurrency={baseCurrency}
      shipments={shipments}
    />
  )
}
