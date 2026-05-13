export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { OrderDetailView } from '@/components/orders/OrderDetailView'
import type { DbOrderRow, DbOrderEvent } from '@/types/orders'
import type { TenantPaymentConfig } from '@/types/payments'

const ORDER_SELECT = `
  id, ref_number, customer_id, conversation_id, status,
  payment_asset, payment_amount, currency, exchange_rate, payment_address, tx_hash,
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

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: order }, { data: events }, { data: paymentConfigs }] = await Promise.all([
    supabase.from('orders').select(ORDER_SELECT).eq('id', orderId).single(),
    supabase.from('order_events').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
    supabase.from('tenant_payment_configs').select('*').eq('is_active', true),
  ])

  if (!order) notFound()

  // Fetch last 3 messages from linked conversation if present
  let chatExcerpt: { id: string; direction: string; content: string; sent_at: string }[] = []
  const orderRow = order as unknown as DbOrderRow
  if (orderRow.conversation_id) {
    const { data: messages } = await supabase
      .from('messages')
      .select('id, direction, content, sent_at')
      .eq('conversation_id', orderRow.conversation_id)
      .order('sent_at', { ascending: false })
      .limit(3)
    chatExcerpt = (messages ?? []).reverse()
  }

  return (
    <Shell section="Orders">
      <OrderDetailView
        order={orderRow}
        events={(events ?? []) as DbOrderEvent[]}
        chatExcerpt={chatExcerpt}
        paymentConfigs={(paymentConfigs ?? []) as TenantPaymentConfig[]}
      />
    </Shell>
  )
}
