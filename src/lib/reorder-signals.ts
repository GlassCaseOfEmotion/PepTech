import { computeSupply } from '@/types/protocols'
import type { ProductProtocol, CustomerProtocolOverride } from '@/types/protocols'

export type ReorderSignal = {
  customerId: string
  who: string
  productId: string
  product: string
  dueIn: string
  daysRemaining: number
  cycle: string
  conf: number
}

interface RawOrder {
  customer_id: string
  customerName: string
  status: string
  created_at: string
  delivered_at: string | null
  items: { product_id: string; productName: string; qty: number }[]
}

export function computeReorderSignals(
  orders: RawOrder[],
  protocols: ProductProtocol[],
  overrides: CustomerProtocolOverride[],
  limit = 5,
): ReorderSignal[] {
  const protocolMap = Object.fromEntries(protocols.map(p => [p.product_id, p]))
  const overrideMap = Object.fromEntries(
    overrides.map(o => [`${o.customer_id}:${o.product_id}`, o])
  )

  // orders sorted created_at DESC — seenPairs ensures we use only the most
  // recent delivered order per customer+product combination
  const seenPairs = new Set<string>()
  const signals: ReorderSignal[] = []

  for (const order of orders) {
    const deliveredAt =
      order.delivered_at ?? (order.status === 'delivered' ? order.created_at : null)
    if (!deliveredAt) continue

    for (const item of order.items) {
      const pairKey = `${order.customer_id}:${item.product_id}`
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)

      const protocol = protocolMap[item.product_id]
      if (!protocol) continue

      const cycle = computeSupply({
        productId: item.product_id,
        productName: item.productName,
        unitsOrdered: item.qty,
        orderDate: deliveredAt,
        protocol,
        override: overrideMap[pairKey] ?? null,
      })

      if (cycle.status === 'ok') continue

      const daysRem = Math.ceil(cycle.daysRemaining)
      const dueIn = daysRem <= 0 ? 'now' : daysRem === 1 ? '1 day' : `${daysRem} days`

      const totalWeeks = cycle.cycleLengthWeeks ?? Math.ceil(cycle.totalDays / 7)
      const weeksElapsed = Math.floor(
        (cycle.totalDays - Math.max(0, cycle.daysRemaining)) / 7
      )
      const currentWeek = Math.min(weeksElapsed + 1, totalWeeks)

      // conf = fraction of supply consumed — higher = more overdue
      const conf = Math.round(Math.min(1, Math.max(0.5, 1 - cycle.pctRemaining)) * 100) / 100

      signals.push({
        customerId: order.customer_id,
        who: order.customerName,
        productId: item.product_id,
        product: item.productName,
        dueIn,
        daysRemaining: daysRem,
        cycle: `wk ${currentWeek}/${totalWeeks}`,
        conf,
      })
    }
  }

  return signals.sort((a, b) => a.daysRemaining - b.daysRemaining).slice(0, limit)
}
