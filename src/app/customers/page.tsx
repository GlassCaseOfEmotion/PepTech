import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CustomersListView } from '@/components/customers/CustomersListView'
import { computeSupply } from '@/types/protocols'
import type { ProductProtocol, SupplyStatus } from '@/types/protocols'

export default async function CustomersPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: customers }, { data: recentOrders }, { data: protocols }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, display_name, trust_score, ltv, customer_channels(channel_type, display_handle, is_primary), customer_tags(tag)')
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('customer_id, created_at, order_items(product_id, qty)')
      .order('created_at', { ascending: false }),
    supabase.from('product_protocols').select('*'),
  ])

  const protocolMap = Object.fromEntries(
    ((protocols ?? []) as ProductProtocol[]).map(p => [p.product_id, p])
  )

  // Compute worst-case supply status per customer
  const supplyStatuses: Record<string, SupplyStatus | null> = {}

  // Group orders by customer, find latest per product
  const ordersByCustomer: Record<string, typeof recentOrders> = {}
  for (const order of recentOrders ?? []) {
    if (!ordersByCustomer[order.customer_id]) ordersByCustomer[order.customer_id] = []
    ordersByCustomer[order.customer_id]!.push(order)
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
        const cycle = computeSupply({
          productId: item.product_id,
          productName: '',
          unitsOrdered: item.qty,
          orderDate: order.created_at,
          protocol,
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

  return (
    <Shell section="Customers">
      <CustomersListView customers={customers ?? []} supplyStatuses={supplyStatuses} />
    </Shell>
  )
}
