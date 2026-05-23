import { describe, it, expect } from 'vitest'

// Extracted filter logic — same as what will be in PaymentsView
function applyFilters(
  links: { memo: string | null; orders: { ref_number: string; customers: { display_name: string } | null } | null; created_at: string }[],
  search: string,
  dateFilterMs: number
) {
  const q = search.trim().toLowerCase()
  const cutoff = dateFilterMs === Infinity ? 0 : Date.now() - dateFilterMs
  return links.filter(l => {
    if (q) {
      const customer = l.orders?.customers?.display_name?.toLowerCase() ?? ''
      const orderRef = l.orders?.ref_number?.toLowerCase() ?? ''
      const memo = l.memo?.toLowerCase() ?? ''
      if (!customer.includes(q) && !orderRef.includes(q) && !memo.includes(q)) return false
    }
    if (dateFilterMs !== Infinity && new Date(l.created_at).getTime() < cutoff) return false
    return true
  })
}

const links = [
  { memo: 'test order', orders: { ref_number: 'A-1001', customers: { display_name: 'Alan' } }, created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
  { memo: null, orders: { ref_number: 'A-1002', customers: { display_name: 'Bob' } }, created_at: new Date(Date.now() - 40 * 86400000).toISOString() },
]

describe('applyFilters', () => {
  it('returns all links when search is empty and date is all', () => {
    expect(applyFilters(links, '', Infinity)).toHaveLength(2)
  })
  it('filters by customer name', () => {
    expect(applyFilters(links, 'alan', Infinity)).toHaveLength(1)
    expect(applyFilters(links, 'alan', Infinity)[0].orders?.ref_number).toBe('A-1001')
  })
  it('filters by order ref', () => {
    expect(applyFilters(links, 'A-1002', Infinity)).toHaveLength(1)
  })
  it('filters by memo', () => {
    expect(applyFilters(links, 'test', Infinity)).toHaveLength(1)
  })
  it('filters by date — excludes links older than cutoff', () => {
    expect(applyFilters(links, '', 30 * 86400000)).toHaveLength(1)
  })
  it('returns empty when no match', () => {
    expect(applyFilters(links, 'zzz', Infinity)).toHaveLength(0)
  })
})
