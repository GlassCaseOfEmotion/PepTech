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

function buildCsv(links: {
  nowpayments_id: string
  memo: string | null
  orders: { ref_number: string; customers: { display_name: string } | null } | null
  amount_base: number | null
  amount_usd: number
  base_currency: string | null
  status: string
  paid_token: string | null
  sent_via: string | null
  created_at: string
  expires_at: string | null
}[], currency: string): string {
  const header = ['ID','Customer','Order','Memo','Amount','Currency','Status','Paid with','Sent via','Created','Expires']
  const rows = links.map(l => [
    l.nowpayments_id,
    l.orders?.customers?.display_name ?? '',
    l.orders?.ref_number ?? '',
    l.memo ?? '',
    String(l.amount_base ?? l.amount_usd),
    l.base_currency ?? currency,
    l.status,
    l.paid_token ?? '',
    l.sent_via ?? '',
    l.created_at,
    l.expires_at ?? '',
  ])
  return [header, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

describe('buildCsv', () => {
  it('produces a header row + one data row', () => {
    const csv = buildCsv([{
      nowpayments_id: 'NP-123',
      memo: 'test order',
      orders: { ref_number: 'A-1001', customers: { display_name: 'Alan' } },
      amount_base: 100,
      amount_usd: 100,
      base_currency: 'USDT',
      status: 'waiting',
      paid_token: null,
      sent_via: 'whatsapp',
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      expires_at: null,
    }], 'USD')
    const rows = csv.split('\n')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('"ID"')
    expect(rows[1]).toContain('"Alan"')
    expect(rows[1]).toContain('"A-1001"')
  })
  it('escapes double quotes in values', () => {
    const csv = buildCsv([{
      nowpayments_id: 'NP-123',
      memo: 'say "hello"',
      orders: null,
      amount_base: null,
      amount_usd: 50,
      base_currency: null,
      status: 'waiting',
      paid_token: null,
      sent_via: null,
      created_at: new Date().toISOString(),
      expires_at: null,
    }], 'USD')
    expect(csv).toContain('"say ""hello"""')
  })
})
