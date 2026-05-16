# Command Palette + Compose Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the two dead sidebar buttons — search becomes a unified ⌘K command palette (customers/orders/conversations + AI entry point), compose opens a modal to initiate a new outbound message.

**Architecture:** Six tasks, all independent except Task 3 (ComposeModal) which depends on Task 1 (server action). Custom DOM events (`pt:palette:open`, `pt:compose:open`, `pt:agent:open`) decouple the sidebar buttons from the modal components — no prop drilling through the server-rendered Shell. CommandPalette queries Supabase client directly (RLS-scoped). ComposeModal calls a server action to find/create a conversation, then calls `/api/send` with the returned `conversationId`.

**Tech Stack:** Next.js 15 App Router, Supabase JS client, React `useImperativeHandle`, native HTML5 custom events.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/app/inbox/actions.ts` | **Create** — `createOrFindConversation` server action |
| `src/components/shell/CommandPalette.tsx` | **Create** — unified ⌘K overlay |
| `src/components/shell/ComposeModal.tsx` | **Create** — new message compose modal |
| `src/components/shell/AgentPalette.tsx` | **Modify** — remove ⌘K listener, add `pt:agent:open` event listener |
| `src/components/shell/Sidebar.tsx` | **Modify** — wire search + compose buttons |
| `src/components/shell/Shell.tsx` | **Modify** — mount CommandPalette + ComposeModal |

---

## Task 1: `createOrFindConversation` server action

**Files:**
- Create: `src/app/inbox/actions.ts`

This action finds an existing open conversation for a customer+channel, or creates one. It returns the `conversationId` so the client can then call `/api/send`. No channel credentials needed here — the actual send goes through the existing `/api/send` route.

- [ ] **Step 1: Create the file**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createOrFindConversation(
  customerId: string,
  channelType: string,
): Promise<{ conversationId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Get the customer's channel identifier for this channel type
  const { data: ch } = await supabase
    .from('customer_channels')
    .select('display_handle')
    .eq('customer_id', customerId)
    .eq('channel_type', channelType)
    .single()

  if (!ch) return { error: `Customer has no ${channelType} channel` }

  // Reuse an existing open conversation if one exists
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('customer_id', customerId)
    .eq('channel_type', channelType)
    .not('status', 'in', '("resolved","archived")')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) return { conversationId: existing.id }

  // Create a new conversation
  const { data: userRow } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!userRow) return { error: 'User not found' }

  const { data: conv, error } = await supabase
    .from('conversations')
    .insert({
      tenant_id: userRow.tenant_id,
      customer_id: customerId,
      channel_type: channelType,
      channel_identifier: ch.display_handle,
      status: 'new',
    })
    .select('id')
    .single()

  if (error || !conv) return { error: error?.message ?? 'Failed to create conversation' }

  revalidatePath('/inbox')
  revalidatePath('/')
  return { conversationId: conv.id }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add src/app/inbox/actions.ts
git commit -m "feat: createOrFindConversation server action for compose modal"
```

---

## Task 2: Modify AgentPalette — remove ⌘K, add event listener

**Files:**
- Modify: `src/components/shell/AgentPalette.tsx`

Remove the ⌘K global listener (lines 109–119). Add a `pt:agent:open` custom event listener so CommandPalette can open it. The palette otherwise works identically.

- [ ] **Step 1: Replace the keyboard listener**

Find this block (around lines 109–119):

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setOpen(o => !o)
    }
    if (e.key === 'Escape') setOpen(false)
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```

Replace with:

```typescript
useEffect(() => {
  const openHandler = () => setOpen(true)
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
  }
  window.addEventListener('pt:agent:open', openHandler)
  window.addEventListener('keydown', keyHandler)
  return () => {
    window.removeEventListener('pt:agent:open', openHandler)
    window.removeEventListener('keydown', keyHandler)
  }
}, [])
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Verify AgentPalette still opens**

Start dev server (`npm run dev`). Press ⌘K — palette should NOT open (it no longer owns that shortcut). Go to Shell.tsx step later to confirm the new ⌘K flow works end-to-end.

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/AgentPalette.tsx
git commit -m "feat: AgentPalette listens for pt:agent:open event instead of Cmd+K"
```

---

## Task 3: CommandPalette component

**Files:**
- Create: `src/components/shell/CommandPalette.tsx`

Unified ⌘K overlay. Searches customers, orders, and conversations in parallel (debounced). "Open AI assistant" row always at the bottom dispatches `pt:agent:open`.

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icons } from '@/lib/icons'

type Result =
  | { kind: 'customer'; id: string; name: string; handle: string; channel: string }
  | { kind: 'order'; id: string; refNumber: string; customerName: string; status: string }
  | { kind: 'conversation'; id: string; customerName: string; snippet: string | null }
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
  const supabase = createClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Open via ⌘K or custom event
  useEffect(() => {
    const openHandler = () => { setOpen(true); setQuery('') }
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); if (!open) setQuery('') }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pt:palette:open', openHandler)
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('pt:palette:open', openHandler)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [open])

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

    const [{ data: customers }, { data: orders }, { data: matchCusts }] = await Promise.all([
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
        .from('customers')
        .select('id')
        .ilike('display_name', `%${q}%`)
        .limit(5),
    ])

    const custIds = (matchCusts ?? []).map(c => c.id)
    const { data: convs } = custIds.length > 0
      ? await supabase
          .from('conversations')
          .select('id, last_message_snippet, customers(display_name)')
          .in('customer_id', custIds)
          .in('status', ['new', 'needs_reply', 'in_progress', 'snoozed'])
          .limit(3)
      : { data: [] }

    const next: Result[] = []

    for (const c of customers ?? []) {
      const channels = c.customer_channels as { channel_type: string; display_handle: string; is_primary: boolean }[]
      const primary = channels.find(ch => ch.is_primary) ?? channels[0]
      next.push({ kind: 'customer', id: c.id, name: c.display_name, handle: primary?.display_handle ?? '', channel: primary?.channel_type ?? '' })
    }

    for (const o of orders ?? []) {
      const cust = o.customers as { display_name: string } | null
      next.push({ kind: 'order', id: o.id, refNumber: o.ref_number, customerName: cust?.display_name ?? '—', status: o.status })
    }

    for (const cv of convs ?? []) {
      const cust = cv.customers as { display_name: string } | null
      next.push({ kind: 'conversation', id: cv.id, customerName: cust?.display_name ?? '—', snippet: cv.last_message_snippet })
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
      if (query.trim() && results[highlighted]) navigate(results[highlighted])
    }
  }

  if (!open) return null

  const CH_LABEL: Record<string, string> = { whatsapp: 'WA', telegram: 'TG', email: 'EM' }
  const STATUS_LABEL: Record<string, string> = { awaiting: 'Awaiting', confirming: 'Confirming', packing: 'Packing', shipped: 'Shipped', delivered: 'Delivered' }

  const customerResults = results.filter(r => r.kind === 'customer') as Extract<Result, { kind: 'customer' }>[]
  const orderResults    = results.filter(r => r.kind === 'order')    as Extract<Result, { kind: 'order' }>[]
  const convResults     = results.filter(r => r.kind === 'conversation') as Extract<Result, { kind: 'conversation' }>[]

  // Flat indices for keyboard highlight
  const custStart = 0
  const orderStart = customerResults.length
  const convStart = orderStart + orderResults.length
  const aiIdx = convStart + convResults.length

  return (
    <div className="pt-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="pt-cmd" onClick={e => e.stopPropagation()}>
        <div className="pt-cmd-input-row">
          <Icons.search size={14} />
          <input
            ref={inputRef}
            className="pt-cmd-input"
            placeholder="Search customers, orders, conversations…"
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

              {customerResults.length === 0 && orderResults.length === 0 && convResults.length === 0 && results.length <= 1 && (
                <div className="pt-cmd-empty">No results for &ldquo;{query}&rdquo;</div>
              )}
            </>
          )}
        </div>

        <div className={`pt-cmd-row pt-cmd-ai ${aiIdx === highlighted ? 'is-on' : ''}`}
          onClick={() => navigate({ kind: 'ai' })}
          onMouseEnter={() => setHighlighted(aiIdx)}>
          <span style={{ fontSize: 14 }}>✨</span>
          <span className="pt-cmd-row-label">Open AI assistant →</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add CSS for the command palette**

In `styles/peptech.css`, find the modal section and add after `.pt-modal-ft`:

```css
/* ─── Command palette ────────────────────────────────────────────────────── */
.pt-cmd {
  width: 560px; max-width: 92vw;
  background: var(--pt-bg-side);
  border: 0.5px solid var(--pt-line);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  overflow: hidden;
  display: flex; flex-direction: column;
  max-height: 70vh;
}
.pt-cmd-input-row {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 16px;
  border-bottom: 0.5px solid var(--pt-line);
}
.pt-cmd-input {
  flex: 1; background: none; border: none; outline: none;
  font-size: 14px; color: var(--pt-fg); font-family: var(--pt-font);
}
.pt-cmd-input::placeholder { color: var(--pt-fg-4); }
.pt-cmd-esc {
  font-size: 10px; color: var(--pt-fg-4);
  padding: 2px 5px; border: 0.5px solid var(--pt-line);
  border-radius: 3px; font-family: var(--pt-mono);
}
.pt-cmd-body { overflow-y: auto; flex: 1; padding: 6px 0; }
.pt-cmd-group-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--pt-fg-4); padding: 6px 16px 4px; font-weight: 500;
}
.pt-cmd-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; cursor: pointer; transition: background 80ms;
}
.pt-cmd-row.is-on { background: oklch(from var(--pt-fg) l c h / 0.06); }
.pt-cmd-av {
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--pt-surface-2); display: flex; align-items: center;
  justify-content: center; font-size: 10px; font-weight: 600;
  flex-shrink: 0; color: var(--pt-fg-2);
}
.pt-cmd-row-icon { width: 26px; display: flex; align-items: center; justify-content: center; color: var(--pt-fg-3); flex-shrink: 0; }
.pt-cmd-row-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pt-cmd-row-label { font-size: 13px; font-weight: 500; color: var(--pt-fg); }
.pt-cmd-row-sub { font-size: 11px; color: var(--pt-fg-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-cmd-enter { font-size: 11px; color: var(--pt-fg-4); flex-shrink: 0; }
.pt-cmd-empty { padding: 20px 16px; font-size: 13px; color: var(--pt-fg-4); text-align: center; }
.pt-cmd-ai {
  border-top: 0.5px solid var(--pt-line);
  padding: 10px 16px; font-size: 13px; color: var(--pt-fg-3);
  cursor: pointer;
}
.pt-cmd-ai.is-on { background: oklch(from var(--pt-fg) l c h / 0.06); }
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/CommandPalette.tsx styles/peptech.css
git commit -m "feat: CommandPalette — unified Cmd+K overlay with customer/order/conversation search"
```

---

## Task 4: ComposeModal component

**Files:**
- Create: `src/components/shell/ComposeModal.tsx`

Depends on Task 1 (`createOrFindConversation`).

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState, useEffect, useRef, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icons } from '@/lib/icons'
import { createOrFindConversation } from '@/app/inbox/actions'

type CustomerHit = {
  id: string
  display_name: string
  customer_channels: { channel_type: string; display_handle: string; is_primary: boolean }[]
}

const CH_NAMES: Record<string, string> = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'Email' }
const CH_ICONS: Record<string, string> = { whatsapp: '📱', telegram: '✈️', email: '✉️' }

export function ComposeModal() {
  const [open, setOpen] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customers, setCustomers] = useState<CustomerHit[]>([])
  const [selected, setSelected] = useState<CustomerHit | null>(null)
  const [channelType, setChannelType] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Open via sidebar button or C key
  useEffect(() => {
    const openHandler = () => { setOpen(true) }
    const keyHandler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (e.key === 'c' && tag !== 'INPUT' && tag !== 'TEXTAREA' && !e.metaKey && !e.ctrlKey) {
        setOpen(true)
      }
      if (e.key === 'Escape') { setOpen(false); reset() }
    }
    window.addEventListener('pt:compose:open', openHandler)
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('pt:compose:open', openHandler)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const reset = () => {
    setCustomerQuery(''); setCustomers([]); setSelected(null)
    setChannelType(''); setMessage(''); setError(null)
  }

  const close = () => { setOpen(false); reset() }

  // Customer search
  const searchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) { setCustomers([]); return }
    const { data } = await supabase
      .from('customers')
      .select('id, display_name, customer_channels(channel_type, display_handle, is_primary)')
      .ilike('display_name', `%${q}%`)
      .limit(8)
    setCustomers((data ?? []) as CustomerHit[])
  }, [supabase])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchCustomers(customerQuery), 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [customerQuery, searchCustomers])

  const selectCustomer = (c: CustomerHit) => {
    setSelected(c)
    setCustomers([])
    setCustomerQuery('')
    const primary = c.customer_channels.find(ch => ch.is_primary) ?? c.customer_channels[0]
    setChannelType(primary?.channel_type ?? '')
  }

  const send = () => {
    if (!selected || !channelType || !message.trim()) { setError('Please fill in all fields'); return }
    setError(null)
    startTransition(async () => {
      const result = await createOrFindConversation(selected.id, channelType)
      if ('error' in result) { setError(result.error); return }

      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: result.conversationId, content: message.trim() }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        setError(body.error ?? 'Failed to send')
        return
      }

      close()
      router.push(`/inbox?conversation=${result.conversationId}`)
    })
  }

  if (!open) return null

  return (
    <div className="pt-modal-backdrop" onClick={close}>
      <div className="pt-modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div className="pt-modal-hd">
          <h3>New message</h3>
          <button className="pt-iconbtn" onClick={close}><Icons.x size={14} /></button>
        </div>

        <div className="pt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* To field */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>To</div>
            {selected ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px 4px 7px', borderRadius: 20, background: 'oklch(from var(--pt-accent) l c h / 0.15)', border: '0.5px solid oklch(from var(--pt-accent) l c h / 0.4)', fontSize: 13 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--pt-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>
                    {selected.display_name.slice(0, 2).toUpperCase()}
                  </div>
                  <span>{selected.display_name}</span>
                  <button onClick={() => { setSelected(null); setChannelType('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pt-fg-4)', fontSize: 13, padding: 0 }}>✕</button>
                </div>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  className="pt-input"
                  placeholder="Search customers…"
                  value={customerQuery}
                  onChange={e => setCustomerQuery(e.target.value)}
                />
                {customers.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--pt-bg-side)', border: '0.5px solid var(--pt-line)', borderRadius: 6, marginTop: 2, overflow: 'hidden' }}>
                    {customers.map(c => {
                      const primary = c.customer_channels.find(ch => ch.is_primary) ?? c.customer_channels[0]
                      return (
                        <div key={c.id}
                          style={{ padding: '9px 12px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}
                          onMouseDown={e => { e.preventDefault(); selectCustomer(c) }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'oklch(from var(--pt-fg) l c h / 0.06)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                        >
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--pt-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                            {c.display_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{c.display_name}</div>
                            {primary && <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', fontFamily: 'var(--pt-mono)' }}>{primary.display_handle} · {CH_NAMES[primary.channel_type] ?? primary.channel_type}</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Channel selector (shown when customer selected and has multiple channels) */}
          {selected && selected.customer_channels.length > 1 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Via</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {selected.customer_channels.map(ch => (
                  <button key={ch.channel_type}
                    className={`pt-btn ${channelType === ch.channel_type ? 'pt-btn-primary' : 'pt-btn-ghost'}`}
                    style={{ fontSize: 12 }}
                    onClick={() => setChannelType(ch.channel_type)}
                  >
                    {CH_ICONS[ch.channel_type]} {CH_NAMES[ch.channel_type] ?? ch.channel_type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Message</div>
            <textarea
              className="pt-od-notes"
              placeholder="Write your message…"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={4}
              disabled={!selected}
            />
            <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', textAlign: 'right', marginTop: 3 }}>Enter to send · Shift+Enter for new line</div>
          </div>

          {error && <p style={{ fontSize: 12, color: 'var(--pt-danger)', margin: 0 }}>{error}</p>}
        </div>

        <div className="pt-modal-ft">
          <button className="pt-btn pt-btn-ghost" onClick={close} disabled={pending}>Cancel</button>
          <button className="pt-btn pt-btn-primary" onClick={send} disabled={pending || !selected || !message.trim()}>
            {pending ? 'Sending…' : `Send via ${CH_NAMES[channelType] ?? channelType || '…'} →`}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/ComposeModal.tsx
git commit -m "feat: ComposeModal — new outbound message with customer search and channel select"
```

---

## Task 5: Wire Sidebar buttons

**Files:**
- Modify: `src/components/shell/Sidebar.tsx`

Add `onClick` handlers to both buttons that dispatch the custom events.

- [ ] **Step 1: Wire the compose button**

Find the compose button (around line 192):
```tsx
<button className="pt-compose">
  <Icons.plus size={13} />
  <span>New message</span>
  <kbd>C</kbd>
</button>
```

Replace with:
```tsx
<button className="pt-compose" onClick={() => window.dispatchEvent(new CustomEvent('pt:compose:open'))}>
  <Icons.plus size={13} />
  <span>New message</span>
  <kbd>C</kbd>
</button>
```

- [ ] **Step 2: Wire the search button**

Find the search button (around line 198):
```tsx
<button className="pt-search">
  <Icons.search size={13} />
  <span>Search…</span>
  <kbd>⌘K</kbd>
</button>
```

Replace with:
```tsx
<button className="pt-search" onClick={() => window.dispatchEvent(new CustomEvent('pt:palette:open'))}>
  <Icons.search size={13} />
  <span>Search…</span>
  <kbd>⌘K</kbd>
</button>
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/Sidebar.tsx
git commit -m "feat: wire sidebar search and compose buttons to custom events"
```

---

## Task 6: Mount CommandPalette and ComposeModal in Shell

**Files:**
- Modify: `src/components/shell/Shell.tsx`

Shell.tsx is a server component that already renders `AgentPalette` and `GlobalNotifications`. Add the two new client components alongside them.

- [ ] **Step 1: Add imports**

At the top of Shell.tsx, add:
```typescript
import { CommandPalette } from './CommandPalette'
import { ComposeModal } from './ComposeModal'
```

- [ ] **Step 2: Mount in JSX**

In the Shell JSX, add `CommandPalette` and `ComposeModal` alongside `AgentPalette` and `GlobalNotifications`:

```tsx
<GlobalNotifications />
<AgentPalette />
<CommandPalette />
<ComposeModal />
```

- [ ] **Step 3: TypeScript check + test run**

```bash
npx tsc --noEmit
npm run test:run
```

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/Shell.tsx
git commit -m "feat: mount CommandPalette and ComposeModal in Shell"
```

---

## Verification

1. **⌘K opens the palette** — not the AI chat. Esc closes it. Backdrop click closes it.
2. **Sidebar search button** opens the palette.
3. **Typing a customer name** shows results under "Customers". Clicking navigates to `/customers/:id`.
4. **Typing an order ref** (e.g. "A-1005") shows results under "Orders". Clicking navigates to `/orders/:id`.
5. **Conversation results** appear for matching customer names. Clicking navigates to `/inbox?conversation=:id`.
6. **"Open AI assistant →"** row at the bottom opens the existing AI chat.
7. **No search query** shows recent items from localStorage.
8. **Arrow keys** navigate results; Enter navigates to the highlighted item.
9. **Pressing C** (when not in an input) opens the compose modal.
10. **Sidebar "New message" button** opens the compose modal.
11. **Selecting a customer** in compose shows their primary channel auto-selected. Multiple channels → toggle tabs appear.
12. **Send** creates or reuses a conversation and navigates to `/inbox?conversation=:id`.
13. **`npm run test:run`** — all previously passing tests still pass.
