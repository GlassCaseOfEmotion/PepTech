export function buildAssignments(
  items: { id: string; productName: string; qty: number }[],
  batchMap: Map<string, string | null>,
  reasonMap?: Map<string, string>,
): { assignments: { item_id: string; batch_id: string; qty: number }[] } | { error: string } {
  const blocked: string[] = []
  const assignments: { item_id: string; batch_id: string; qty: number }[] = []
  for (const item of items) {
    const batchId = batchMap.get(item.id) ?? null
    if (!batchId) {
      const reason = reasonMap?.get(item.id)
      blocked.push(reason ? `${item.productName} (${reason})` : item.productName)
    } else {
      assignments.push({ item_id: item.id, batch_id: batchId, qty: item.qty })
    }
  }
  if (blocked.length > 0) return { error: `Cannot pack — ${blocked.join('; ')}` }
  return { assignments }
}
