'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icons } from '@/lib/icons'

type Result =
  | { kind: 'customer'; id: string; name: string; handle: string; channel: string }
  | { kind: 'order'; id: string; refNumber: string; customerName: string; status: string }
  | { kind: 'conversation'; id: string; customerName: string; snippet: string | null }
  | { kind: 'catalog'; id: string; sku: string; name: string }
  | { kind: 'ai' }

const RECENT_KEY = 'pt:recent'
const MAX_RECENT = 5

type RecentItem = { label: string; href: string }

function readRecent(): RecentItem[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] }
}

function writeRecent(item: RecentItem) {
  const items = readRecent().filter(r => r.href !== item.href)
  localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...items].slice(0, MAX_RECENT)))
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [highlighted, setHighlighted] = useState(0)
  const [recent, setRecent] = useState<RecentItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Open via ⌘K or custom event
  useEffect(() => {
    const openHandler = () => { setOpen(true); setQuery('') }
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => { if (!o) setQuery(''); return !o })
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pt:palette:open', openHandler)
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('pt:palette:open', openHandler)
      window.removeEventListener('keydown', keyHandler)
    }
  }, []) // empty dep — functional updaters need no closure over state

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setRecent(readRecent())
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setResults([])
      setHighlighted(0)
    }
  }, [open])

  // Search
  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }

    const [{ data: customers }, { data: ordersByRef }, { data: products }] = await Promise.all([
      supabase
        .from('customers')
        .select('id, display_name, customer_channels(channel_type, display_handle, is_primary)')
        .ilike('display_name', `%${q}%`)
        .limit(4),
      supabase
        .from('orders')
        .select('id, ref_number, status, customers(display_name)')
        .ilike('ref_number', `%${q}%`)
        .limit(3),
      supabase
        .from('products')
        .select('id, sku, name')
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .eq('is_active', true)
        .limit(3),
    ])

    const custIds = (customers ?? []).map(c => c.id)
    const [{ data: convs }, { data: ordersByCust }] = await Promise.all([
      custIds.length > 0
        ? supabase
            .from('conversations')
            .select('id, last_message_snippet, customers(display_name)')
            .in('customer_id', custIds)
            .in('status', ['new', 'needs_reply', 'in_progress', 'snoozed'])
            .limit(3)
        : Promise.resolve({ data: [] }),
      custIds.length > 0
        ? supabase
            .from('orders')
            .select('id, ref_number, status, customers(display_name)')
            .in('customer_id', custIds)
            .limit(3)
        : Promise.resolve({ data: [] }),
    ])

    // Merge order results, deduplicate by id
    const seenOrderIds = new Set<string>()
    const allOrders = [...(ordersByRef ?? []), ...(ordersByCust ?? [])].filter(o => {
      if (seenOrderIds.has(o.id)) return false
      seenOrderIds.add(o.id)
      return true
    }).slice(0, 4)

    const next: Result[] = []

    for (const c of customers ?? []) {
      const channels = c.customer_channels as { channel_type: string; display_handle: string; is_primary: boolean }[]
      const primary = channels.find(ch => ch.is_primary) ?? channels[0]
      next.push({ kind: 'customer', id: c.id, name: c.display_name, handle: primary?.display_handle ?? '', channel: primary?.channel_type ?? '' })
    }

    for (const o of allOrders) {
      const cust = o.customers as { display_name: string } | null
      next.push({ kind: 'order', id: o.id, refNumber: o.ref_number, customerName: cust?.display_name ?? '—', status: o.status })
    }

    for (const cv of convs ?? []) {
      const cust = cv.customers as { display_name: string } | null
      next.push({ kind: 'conversation', id: cv.id, customerName: cust?.display_name ?? '—', snippet: cv.last_message_snippet })
    }

    for (const p of products ?? []) {
      next.push({ kind: 'catalog', id: p.id, sku: p.sku, name: p.name })
    }

    next.push({ kind: 'ai' })
    setResults(next)
    setHighlighted(0)
  }, [supabase])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  const navigate = useCallback((r: Result) => {
    if (r.kind === 'ai') {
      window.dispatchEvent(new CustomEvent('pt:agent:open'))
      setOpen(false)
      return
    }
    let href = ''
    let label = ''
    if (r.kind === 'customer')      { href = `/customers/${r.id}`;                   label = r.name }
    if (r.kind === 'order')         { href = `/orders/${r.id}`;                       label = `#${r.refNumber}` }
    if (r.kind === 'conversation')  { href = `/inbox?conversation=${r.id}`;           label = r.customerName }
    if (r.kind === 'catalog')       { href = `/catalog`;                               label = r.name }
    if (!href) return
    writeRecent({ label, href })
    router.push(href)
    setOpen(false)
  }, [router])

  // Keyboard navigation
  const keyDown = (e: React.KeyboardEvent) => {
    const total = query.trim() ? results.length : recent.length + 1 // +1 for AI row
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, total - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    if (e.key === 'Enter') {
      if (query.trim()) {
        if (results[highlighted]) navigate(results[highlighted])
      } else {
        // Empty state: navigate highlighted recent item or AI row
        const aiRowIdx = recent.length
        if (highlighted === aiRowIdx) {
          navigate({ kind: 'ai' })
        } else if (recent[highlighted]) {
          const r = recent[highlighted]
          writeRecent(r)
          router.push(r.href)
          setOpen(false)
        }
      }
    }
  }

  if (!open) return null

  const CH_LABEL: Record<string, string> = { whatsapp: 'WA', telegram: 'TG', email: 'EM' }
  const STATUS_LABEL: Record<string, string> = { awaiting: 'Awaiting', confirming: 'Confirming', packing: 'Packing', shipped: 'Shipped', delivered: 'Delivered' }

  const customerResults = results.filter(r => r.kind === 'customer') as Extract<Result, { kind: 'customer' }>[]
  const orderResults    = results.filter(r => r.kind === 'order')    as Extract<Result, { kind: 'order' }>[]
  const convResults     = results.filter(r => r.kind === 'conversation') as Extract<Result, { kind: 'conversation' }>[]
  const catalogResults  = results.filter(r => r.kind === 'catalog')  as Extract<Result, { kind: 'catalog' }>[]

  // Flat indices for keyboard highlight
  const custStart    = 0
  const orderStart   = customerResults.length
  const convStart    = orderStart + orderResults.length
  const catalogStart = convStart + convResults.length
  const aiIdx        = catalogStart + catalogResults.length

  const aiHighlightIdx = query.trim() ? aiIdx : recent.length

  return (
    <div className="pt-modal-backdrop" style={{ alignItems: 'flex-start', paddingTop: '15vh' }} onClick={() => setOpen(false)}>
      <div className="pt-cmd" onClick={e => e.stopPropagation()}>
        <div className="pt-cmd-input-row">
          <Icons.search size={14} />
          <input
            ref={inputRef}
            className="pt-cmd-input"
            placeholder="Search customers, orders, conversations, catalog…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={keyDown}
          />
          <kbd className="pt-cmd-esc">Esc</kbd>
        </div>

        <div className="pt-cmd-body">
          {!query.trim() && recent.length > 0 && (
            <>
              <div className="pt-cmd-group-label">Recent</div>
              {recent.map((r, i) => (
                <div key={r.href} className={`pt-cmd-row ${i === highlighted ? 'is-on' : ''}`}
                  onClick={() => { writeRecent(r); router.push(r.href); setOpen(false) }}
                  onMouseEnter={() => setHighlighted(i)}>
                  <span className="pt-cmd-row-label">{r.label}</span>
                </div>
              ))}
            </>
          )}

          {query.trim() && (
            <>
              {customerResults.length > 0 && (
                <>
                  <div className="pt-cmd-group-label">Customers</div>
                  {customerResults.map((r, i) => (
                    <div key={r.id} className={`pt-cmd-row ${custStart + i === highlighted ? 'is-on' : ''}`}
                      onClick={() => navigate(r)} onMouseEnter={() => setHighlighted(custStart + i)}>
                      <div className="pt-cmd-av">{r.name.slice(0, 2).toUpperCase()}</div>
                      <div className="pt-cmd-row-mid">
                        <span className="pt-cmd-row-label">{r.name}</span>
                        <span className="pt-cmd-row-sub mono">{r.handle} · {CH_LABEL[r.channel] ?? r.channel}</span>
                      </div>
                      <span className="pt-cmd-enter">↵</span>
                    </div>
                  ))}
                </>
              )}

              {orderResults.length > 0 && (
                <>
                  <div className="pt-cmd-group-label">Orders</div>
                  {orderResults.map((r, i) => (
                    <div key={r.id} className={`pt-cmd-row ${orderStart + i === highlighted ? 'is-on' : ''}`}
                      onClick={() => navigate(r)} onMouseEnter={() => setHighlighted(orderStart + i)}>
                      <span className="pt-cmd-row-icon"><Icons.doc size={12} /></span>
                      <div className="pt-cmd-row-mid">
                        <span className="pt-cmd-row-label mono">#{r.refNumber}</span>
                        <span className="pt-cmd-row-sub">{r.customerName} · {STATUS_LABEL[r.status] ?? r.status}</span>
                      </div>
                      <span className="pt-cmd-enter">↵</span>
                    </div>
                  ))}
                </>
              )}

              {convResults.length > 0 && (
                <>
                  <div className="pt-cmd-group-label">Conversations</div>
                  {convResults.map((r, i) => (
                    <div key={r.id} className={`pt-cmd-row ${convStart + i === highlighted ? 'is-on' : ''}`}
                      onClick={() => navigate(r)} onMouseEnter={() => setHighlighted(convStart + i)}>
                      <span className="pt-cmd-row-icon"><Icons.send size={12} /></span>
                      <div className="pt-cmd-row-mid">
                        <span className="pt-cmd-row-label">{r.customerName}</span>
                        {r.snippet && <span className="pt-cmd-row-sub" style={{ fontStyle: 'italic' }}>&ldquo;{r.snippet.slice(0, 60)}&rdquo;</span>}
                      </div>
                      <span className="pt-cmd-enter">↵</span>
                    </div>
                  ))}
                </>
              )}

              {catalogResults.length > 0 && (
                <>
                  <div className="pt-cmd-group-label">Catalog</div>
                  {catalogResults.map((r, i) => (
                    <div key={r.id} className={`pt-cmd-row ${catalogStart + i === highlighted ? 'is-on' : ''}`}
                      onClick={() => navigate(r)} onMouseEnter={() => setHighlighted(catalogStart + i)}>
                      <span className="pt-cmd-row-icon"><Icons.box size={12} /></span>
                      <div className="pt-cmd-row-mid">
                        <span className="pt-cmd-row-label">{r.name}</span>
                        <span className="pt-cmd-row-sub mono">{r.sku}</span>
                      </div>
                      <span className="pt-cmd-enter">↵</span>
                    </div>
                  ))}
                </>
              )}

              {customerResults.length === 0 && orderResults.length === 0 && convResults.length === 0 && catalogResults.length === 0 && results.length <= 1 && (
                <div className="pt-cmd-empty">No results for &ldquo;{query}&rdquo;</div>
              )}
            </>
          )}
        </div>

        <div className={`pt-cmd-row pt-cmd-ai ${aiHighlightIdx === highlighted ? 'is-on' : ''}`}
          onClick={() => navigate({ kind: 'ai' })}
          onMouseEnter={() => setHighlighted(aiHighlightIdx)}>
          <span style={{ fontSize: 14 }}>✨</span>
          <span className="pt-cmd-row-label">Open AI assistant →</span>
        </div>
      </div>
    </div>
  )
}
