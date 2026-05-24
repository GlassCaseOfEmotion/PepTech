import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { ContactsListView } from '@/components/contacts/ContactsListView'
import { computeSupply } from '@/types/protocols'
import type { ProductProtocol, SupplyStatus, CustomerProtocolOverride } from '@/types/protocols'

export default async function ContactsPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: customers }, { data: recentOrders }, { data: protocols }, { data: allOverrides }, { data: tenantRow }, { count: channelCount }, { data: conversations }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, display_name, trust_score, ltv, lifecycle_stage, acquisition_source, acquisition_source_note, referred_by_customer_id, converted_at, created_at, customer_channels(channel_type, display_handle, is_primary), customer_tags(tag)')
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('customer_id, status, created_at, delivered_at, order_items(product_id, qty)')
      .order('created_at', { ascending: false }),
    supabase.from('product_protocols').select('*'),
    supabase.from('customer_protocol_overrides').select('customer_id, product_id, draw_volume_ml, frequency, notes, id, tenant_id, created_at, updated_at'),
    supabase.from('tenants').select('base_currency').single(),
    supabase.from('tenant_channels').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase
      .from('conversations')
      .select('customer_id, channel_type, last_message_at')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(500),
  ])

  const baseCurrency = (tenantRow?.base_currency as string | null) ?? 'USD'

  const protocolMap = Object.fromEntries(
    ((protocols ?? []) as ProductProtocol[]).map(p => [p.product_id, p])
  )

  const overrideMap = Object.fromEntries(
    ((allOverrides ?? []) as CustomerProtocolOverride[]).map(o => [`${o.customer_id}:${o.product_id}`, o])
  )

  // Compute worst-case supply status per customer
  const supplyStatuses: Record<string, SupplyStatus | null> = {}

  // Group orders by customer, find latest per product
  const ordersByCustomer: Record<string, typeof recentOrders> = {}
  for (const order of recentOrders ?? []) {
    if (!ordersByCustomer[order.customer_id]) ordersByCustomer[order.customer_id] = []
    ordersByCustomer[order.customer_id]!.push(order)
  }

  // Order stats per customer (recentOrders already sorted desc by created_at)
  const orderStats: Record<string, { count: number; lastOrderAt: string | null }> = {}
  for (const [customerId, orders] of Object.entries(ordersByCustomer)) {
    orderStats[customerId] = {
      count: orders!.length,
      lastOrderAt: orders![0]?.created_at ?? null,
    }
  }

  const priorityOf = (s: SupplyStatus) => s === 'critical' ? 2 : s === 'low' ? 1 : 0

  for (const customer of customers ?? []) {
    const customerOrders = ordersByCustomer[customer.id] ?? []
    const seenProducts = new Set<string>()
    let worst: SupplyStatus | null = null

    for (const order of customerOrders) {
      const items = order.order_items as { product_id: string; qty: number }[]
      for (const item of items ?? []) {
        if (!item.product_id || seenProducts.has(item.product_id)) continue
        seenProducts.add(item.product_id)
        const protocol = protocolMap[item.product_id]
        if (!protocol) continue
        const o = order as { status?: string; created_at: string; delivered_at?: string | null }
        const deliveredAt = o.delivered_at ?? (o.status === 'delivered' ? o.created_at : null)
        if (!deliveredAt) continue  // clock starts at delivery — skip undelivered orders
        const cycle = computeSupply({
          productId: item.product_id,
          productName: '',
          unitsOrdered: item.qty,
          orderDate: deliveredAt,
          protocol,
          override: overrideMap[`${customer.id}:${item.product_id}`] ?? null,
        })
        if (worst === null || priorityOf(cycle.status) > priorityOf(worst)) {
          worst = cycle.status
        }
        if (worst === 'critical') break
      }
      if (worst === 'critical') break
    }

    supplyStatuses[customer.id] = worst
  }

  // Reduce conversations — first occurrence per customer_id wins (rows sorted desc)
  const recentConvByCustomer: Record<string, { channelType: string; lastMessageAt: string | null }> = {}
  for (const row of conversations ?? []) {
    if (!recentConvByCustomer[row.customer_id]) {
      recentConvByCustomer[row.customer_id] = {
        channelType: row.channel_type,
        lastMessageAt: row.last_message_at,
      }
    }
  }

  return (
    <Shell section="Contacts">
      <ContactsListView
        customers={customers ?? []}
        supplyStatuses={supplyStatuses}
        orderStats={orderStats}
        baseCurrency={baseCurrency}
        hasChannels={(channelCount ?? 0) > 0}
        recentConvByCustomer={recentConvByCustomer}
      />
    </Shell>
  )
}
