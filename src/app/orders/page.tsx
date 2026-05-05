export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { OrdersView } from '@/components/orders/OrdersView'
import { dbOrderToCard } from '@/types/orders'
import type { DbOrderRow } from '@/types/orders'

const ORDER_SELECT = `
  id, ref_number, customer_id, conversation_id, status,
  payment_asset, payment_amount, payment_address, tx_hash,
  shipping_address, carrier, tracking_number, notes,
  created_at, updated_at,
  customers (
    id, display_name, trust_score, ltv,
    customer_channels (channel_type, display_handle, is_primary)
  ),
  order_items (
    id, qty, unit_price_snapshot,
    products (sku, name),
    batches (batch_number, coa_path)
  )
`

export default async function OrdersPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .not('status', 'eq', 'delivered')
    .order('created_at', { ascending: false })
    .limit(100)

  const cards = ((orders ?? []) as unknown as DbOrderRow[]).map(dbOrderToCard)

  return (
    <Shell section="Orders">
      <OrdersView initialOrders={cards} />
    </Shell>
  )
}
