export interface OrderForAffinity {
  order_items: { product_id: string }[] | null
}

export interface CoProduct {
  productId: string
  count: number
}

/** Co-occurrence cross-sell: for each product, the top-5 other products that
 * appear in the same order, counted across the supplied orders. Lifted
 * verbatim from the catalog page so the copilot drafting pass can reuse it. */
export function computeCoProductAffinity(
  orders: OrderForAffinity[],
): Record<string, CoProduct[]> {
  const coFreq: Record<string, Record<string, number>> = {}
  for (const order of orders ?? []) {
    const ids = ((order.order_items ?? []) as { product_id: string }[]).map(i => i.product_id)
    for (const pid of ids) {
      for (const other of ids) {
        if (pid === other) continue
        if (!coFreq[pid]) coFreq[pid] = {}
        coFreq[pid][other] = (coFreq[pid][other] ?? 0) + 1
      }
    }
  }
  const byProductId: Record<string, CoProduct[]> = {}
  for (const [pid, freq] of Object.entries(coFreq)) {
    byProductId[pid] = Object.entries(freq)
      .map(([productId, count]) => ({ productId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }
  return byProductId
}
