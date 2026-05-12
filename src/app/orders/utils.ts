export function buildAssignments(
  items: { id: string; productName: string; qty: number }[],
  batchMap: Map<string, string | null>,
): { assignments: { item_id: string; batch_id: string; qty: number }[] } | { error: string } {
  const insufficient: string[] = []
  const assignments: { item_id: string; batch_id: string; qty: number }[] = []
  for (const item of items) {
    const batchId = batchMap.get(item.id) ?? null
    if (!batchId) {
      insufficient.push(item.productName)
    } else {
      assignments.push({ item_id: item.id, batch_id: batchId, qty: item.qty })
    }
  }
  if (insufficient.length > 0) return { error: `Insufficient stock: ${insufficient.join(', ')}` }
  return { assignments }
}
