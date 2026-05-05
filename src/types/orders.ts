export type OrderStatus = 'awaiting' | 'confirming' | 'packing' | 'shipped' | 'delivered'

export type ShippingAddress = {
  ln1: string
  ln2?: string
  city: string
  state: string
  zip: string
  masked?: boolean
}

export type DbOrderRow = {
  id: string
  ref_number: string
  customer_id: string
  conversation_id: string | null
  status: OrderStatus
  payment_asset: string
  payment_amount: number
  payment_address: string | null
  tx_hash: string | null
  shipping_address: ShippingAddress | null
  carrier: string | null
  tracking_number: string | null
  notes: string | null
  created_at: string
  updated_at: string
  customers: {
    id: string
    display_name: string
    trust_score: number
    ltv: number
    customer_channels: { channel_type: string; display_handle: string; is_primary: boolean }[]
  } | null
  order_items: {
    id: string
    qty: number
    unit_price_snapshot: number
    products: { sku: string; name: string } | null
    batches: { batch_number: string; coa_path: string | null } | null
  }[]
}

export type DbOrderEvent = {
  id: string
  order_id: string
  actor: 'operator' | 'system'
  action: string
  note: string | null
  created_at: string
}

export type OrderCard = {
  id: string
  refNumber: string
  customerId: string
  customerName: string
  channel: 'wa' | 'tg' | 'em'
  handle: string
  status: OrderStatus
  paymentAsset: string
  paymentAmount: number
  conversationId: string | null
  itemsSummary: string
  itemCount: number
  minsAgo: number
  createdAt: string
}

const CH_MAP: Record<string, 'wa' | 'tg' | 'em'> = {
  whatsapp: 'wa', telegram: 'tg', email: 'em',
}

export function dbOrderToCard(o: DbOrderRow): OrderCard {
  const primaryChannel = o.customers?.customer_channels?.find(c => c.is_primary)
    ?? o.customers?.customer_channels?.[0]
  const channel = CH_MAP[primaryChannel?.channel_type ?? 'whatsapp'] ?? 'wa'
  const minsAgo = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000)
  const itemsSummary = o.order_items
    .map(it => `${it.products?.name ?? 'Unknown'} ×${it.qty}`)
    .join(', ')

  return {
    id: o.id,
    refNumber: o.ref_number,
    customerId: o.customers?.id ?? '',
    customerName: o.customers?.display_name ?? 'Unknown',
    channel,
    handle: primaryChannel?.display_handle ?? '',
    status: o.status,
    paymentAsset: o.payment_asset,
    paymentAmount: o.payment_amount,
    conversationId: o.conversation_id,
    itemsSummary,
    itemCount: o.order_items.length,
    minsAgo,
    createdAt: o.created_at,
  }
}
