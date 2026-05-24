# Orders List View Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Board/List segment-control toggle to the Orders page so tenants can switch between the existing Kanban view and a new tabular view. Selection persists in `localStorage`.

**Architecture:** Extract the existing Kanban into `OrdersBoard.tsx` (pure refactor). Build `OrdersList.tsx` as a new sibling component rendering the same `OrderCard[]` data as a table with `# · Date · Customer · Items · Pay · Amount · Status · Action` columns. `OrdersView.tsx` keeps the page-level state (header, search, modals, toast, empty state) and conditionally renders the active view. View choice persists via `localStorage` (`pt:orders-view`), read in `useEffect` to avoid SSR/CSR mismatch.

**Tech Stack:** Next.js 15 App Router · TypeScript · Vitest + React Testing Library · existing `pt-*` CSS design system in `styles/orders.css` and `styles/peptech.css`.

**Spec:** [docs/superpowers/specs/2026-05-24-orders-list-view-design.md](../specs/2026-05-24-orders-list-view-design.md)

---

## File map

**New files:**
- `src/components/orders/OrdersBoard.tsx` — extracted Kanban presentation.
- `src/components/orders/OrdersList.tsx` — new tabular presentation.
- `src/components/orders/__tests__/OrdersList.test.tsx` — component tests for the list view.

**Modified files:**
- `src/components/orders/OrdersView.tsx` — wrapper that owns page-level state and the view toggle.
- `styles/orders.css` — `.pt-or-list*` table styles.

**Tests untouched but verified green at each task:**
- Existing tests in `src/components/orders/`, `src/app/orders/__tests__/`, `src/lib/__tests__/`.

---

## Conventions used in this plan

- **Tests** are vitest. Run with `npm run test:run` (one-shot) or `npm run test:run -- <path>` (file-scoped).
- **OrderCard** shape (from `src/types/orders.ts`):
  ```ts
  type OrderCard = {
    id: string
    refNumber: string
    customerId: string
    customerName: string
    channel: 'wa' | 'tg' | 'em'
    handle: string
    status: OrderStatus  // 'created' | 'awaiting' | 'confirming' | 'packing' | 'shipped' | 'delivered'
    paymentAsset: string | null
    paymentAmount: number
    currency: string
    conversationId: string | null
    items: { name: string; qty: number }[]
    minsAgo: number
    createdAt: string
  }
  ```
- **Shared CSS classes already in `styles/orders.css` / `peptech.css`** that we'll reuse: `pt-or-dot-{status}` (status colors), `pt-or-advance` (advance button), `pt-segctl` + `is-on` (segment control), `pt-pay-asset[data-asset]` (payment badge), `pt-cu-item-chip` (item chip), `mono` (monospace utility).
- **Commit messages** follow conventional commits (`feat:`, `refactor:`, `style:`, `test:`).
- **No DB changes, no migrations, no server actions modified.** Everything in this plan is client-side rendering.

---

## Task 1: Extract the Kanban into `OrdersBoard.tsx`

Pure refactor. Behaviour unchanged. Existing tests must still pass.

**Files:**
- Create: `src/components/orders/OrdersBoard.tsx`
- Modify: `src/components/orders/OrdersView.tsx`

- [ ] **Step 1: Read the current `OrdersView.tsx` and identify the Kanban-specific code**

The Kanban-specific code is:
- The `<OrderCardUI>` component (lines ~47-101 — the article element with drag handlers and advance button).
- The `<div className="pt-or-board">…</div>` wrapper (lines ~210-268) that renders the 6 columns and their cards.
- The drag state: `dragId`, `dragOverCol`, drag handlers.
- The `COLUMNS` constant (lines 14-21), `NEXT_STATUS`, `NEXT_LABEL`, `CH_ICONS`, `fmtAge`, `initials` helpers — these are Kanban-internal. Move with the component.

The empty-state block, header, toast, modal mounting, and the `tryMove`/`showToast`/`flash` callbacks stay in `OrdersView`.

- [ ] **Step 2: Create `src/components/orders/OrdersBoard.tsx`**

Create the file with the extracted Kanban. Signature:

```tsx
'use client'

import { useState } from 'react'
import { Icons } from '@/lib/icons'
import { EmptyState } from '@/components/ui/EmptyState'
import { PAYMENT_BADGE } from '@/types/payments'
import type { OrderCard, OrderStatus } from '@/types/orders'
import { formatAmount } from '@/lib/currency'

const COLUMNS: { id: OrderStatus; label: string; caption: string }[] = [
  { id: 'created',    label: 'Created',           caption: 'Payment method not set yet' },
  { id: 'awaiting',   label: 'Awaiting payment',  caption: 'Invoice sent · waiting for tx' },
  { id: 'confirming', label: 'Confirming',        caption: 'Tx seen · waiting for confirms' },
  { id: 'packing',    label: 'Packing',           caption: 'Paid · ready to ship' },
  { id: 'shipped',    label: 'Shipped',           caption: 'In transit' },
  { id: 'delivered',  label: 'Delivered',         caption: 'Closed' },
]

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirming: 'packing',
  packing: 'shipped',
  shipped: 'delivered',
}

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  confirming: 'Confirm payment →',
  packing: 'Mark packed →',
  shipped: 'Mark delivered →',
}

function fmtAge(minsAgo: number) {
  if (minsAgo < 60) return `${minsAgo}m`
  if (minsAgo < 1440) return `${Math.floor(minsAgo / 60)}h`
  return `${Math.floor(minsAgo / 1440)}d`
}

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0] ?? '?']).join('')
}

function OrderCardUI({ order: o, pulse, onDragStart, onDragEnd, onAdvance, isDragging, onClick }: {
  order: OrderCard
  pulse?: string
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onAdvance: (id: string, status: OrderStatus) => void
  isDragging: boolean
  onClick: () => void
}) {
  const ChIcon = CH_ICONS[o.channel]
  const nextStatus = NEXT_STATUS[o.status]

  return (
    <article
      className={`pt-or-card pt-or-card-${o.status} ${pulse ? `pt-or-pulse-${pulse}` : ''} ${isDragging ? 'is-dragging' : ''}`}
      draggable
      onDragStart={e => { onDragStart(e, o.id); e.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <header className="pt-or-card-hd">
        <span className="pt-or-card-id mono">#{o.refNumber}</span>
        <span className="pt-or-card-age mono">{fmtAge(o.minsAgo)}</span>
      </header>
      <div className="pt-or-card-cust">
        <div className="pt-or-card-av" data-channel={o.channel}>
          <span>{initials(o.customerName)}</span>
          <i className={`pt-thread-ch pt-ch-${o.channel}`}>{ChIcon && <ChIcon size={8} />}</i>
        </div>
        <div className="pt-or-card-name">{o.customerName}</div>
      </div>
      <div className="pt-or-card-items">
        {o.items.slice(0, 2).map((it, i) => (
          <span key={i} className="pt-cu-item-chip">{it.name}{it.qty > 1 ? ` ×${it.qty}` : ''}</span>
        ))}
        {o.items.length > 2 && <span className="pt-cu-item-more">+{o.items.length - 2} more</span>}
      </div>
      <div className="pt-or-card-pay">
        <span className="pt-pay-asset" data-asset={PAYMENT_BADGE[o.paymentAsset ?? '']?.key ?? 'other'}>
          {PAYMENT_BADGE[o.paymentAsset ?? '']?.label ?? o.paymentAsset ?? '—'}
        </span>
        <span className="pt-or-card-amt mono">{formatAmount(o.paymentAmount, o.currency)}</span>
      </div>
      {nextStatus && (
        <button
          className="pt-or-advance"
          onClick={e => { e.stopPropagation(); onAdvance(o.id, nextStatus) }}
        >
          {NEXT_LABEL[o.status]}
        </button>
      )}
    </article>
  )
}

interface OrdersBoardProps {
  orders: OrderCard[]
  pulse: Record<string, string>
  onAdvance: (id: string, status: OrderStatus) => void
  onOpen: (id: string) => void
}

export function OrdersBoard({ orders, pulse, onAdvance, onOpen }: OrdersBoardProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  return (
    <div className="pt-or-board">
      {COLUMNS.map(col => {
        const colOrders = orders.filter(o => o.status === col.id)
        const isOver = dragOverCol === col.id && dragId
        return (
          <div
            key={col.id}
            className={`pt-or-col ${isOver ? 'is-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.id) }}
            onDragLeave={e => { if (e.currentTarget === e.target) setDragOverCol(null) }}
            onDrop={e => {
              e.preventDefault()
              if (dragId) onAdvance(dragId, col.id as OrderStatus)
              setDragId(null)
              setDragOverCol(null)
            }}
          >
            <div className="pt-or-col-hd" data-col={col.id}>
              <div className="pt-or-col-titlewrap">
                <span className={`pt-or-col-dot pt-or-dot-${col.id}`} />
                <span className="pt-or-col-title">{col.label}</span>
                <span className="pt-or-col-count mono">{colOrders.length}</span>
              </div>
              <div className="pt-or-col-cap">{col.caption}</div>
            </div>
            <div className="pt-or-col-body">
              {colOrders.map(o => (
                <OrderCardUI
                  key={o.id}
                  order={o}
                  pulse={pulse[o.id]}
                  onDragStart={(_e, id) => setDragId(id)}
                  onDragEnd={() => { setDragId(null); setDragOverCol(null) }}
                  onAdvance={onAdvance}
                  isDragging={dragId === o.id}
                  onClick={() => onOpen(o.id)}
                />
              ))}
              {colOrders.length === 0 && (
                <div className="pt-or-col-empty">
                  <EmptyState
                    size="sm"
                    icon={
                      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="26" height="26" rx="4" strokeDasharray="3 2.5" opacity="0.5"/>
                        <line x1="9" y1="11" x2="23" y2="11" opacity="0.3"/>
                        <line x1="9" y1="16" x2="18" y2="16" opacity="0.22"/>
                        <line x1="9" y1="21" x2="20" y2="21" opacity="0.15"/>
                      </svg>
                    }
                    title="Empty"
                  />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Replace the Kanban code in `OrdersView.tsx` with `<OrdersBoard>`**

In `src/components/orders/OrdersView.tsx`:

1. Remove the `COLUMNS`, `CH_ICONS`, `NEXT_STATUS`, `NEXT_LABEL`, `fmtAge`, `initials` constants/functions and the `OrderCardUI` component (lines ~14-101).
2. Remove the `dragId`, `dragOverCol` state from `OrdersView` (now owned by `OrdersBoard`).
3. Remove the `<div className="pt-or-board">…</div>` block.
4. In its place, render `<OrdersBoard orders={orders} pulse={pulse} onAdvance={tryMove} onOpen={(id) => router.push(`/orders/${id}`)} />`.
5. Add `import { OrdersBoard } from './OrdersBoard'` at the top.
6. Remove the now-unused `OrderCard` import (it's used inside `OrdersBoard` instead). Keep `OrderStatus` since `tryMove` still has the type signature.

The rest of `OrdersView` (header, search, modals, toast, empty state branch, `tryMove`, `showToast`, `flash`) stays intact.

- [ ] **Step 4: Run tests**

Run:
```bash
npm run test:run
```

Expected: same baseline as before (the schema/storage/cancel pre-existing failures). No new failures.

Also run a quick typecheck:
```bash
npx tsc --noEmit
```

Expected: clean (or only the previously-known errors if any).

- [ ] **Step 5: Commit**

```bash
git add src/components/orders/OrdersBoard.tsx src/components/orders/OrdersView.tsx
git commit -m "refactor: extract OrdersBoard from OrdersView"
```

---

## Task 2: Build `OrdersList` component (standalone with tests)

Build the new list view in isolation. Not wired into `OrdersView` yet — that comes in Task 3. This task is TDD-shaped.

**Files:**
- Create: `src/components/orders/OrdersList.tsx`
- Create: `src/components/orders/__tests__/OrdersList.test.tsx`

- [ ] **Step 1: Write the failing test file**

Create `src/components/orders/__tests__/OrdersList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OrdersList } from '../OrdersList'
import type { OrderCard } from '@/types/orders'

const baseOrder: OrderCard = {
  id: 'o1',
  refNumber: '1001',
  customerId: 'c1',
  customerName: 'Test Customer',
  channel: 'wa',
  handle: '+1234567890',
  status: 'confirming',
  paymentAsset: 'usdt_trc20',
  paymentAmount: 150,
  currency: 'USD',
  conversationId: null,
  items: [{ name: 'BPC-157 5mg', qty: 2 }],
  minsAgo: 30,
  createdAt: '2026-05-24T10:00:00Z',
}

describe('OrdersList', () => {
  it('renders one row per order', () => {
    render(
      <OrdersList
        orders={[
          { ...baseOrder, id: 'a', refNumber: '1001', customerName: 'Alice' },
          { ...baseOrder, id: 'b', refNumber: '1002', customerName: 'Bob' },
        ]}
        onAdvance={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('#1001')).toBeInTheDocument()
    expect(screen.getByText('#1002')).toBeInTheDocument()
  })

  it('calls onOpen when a row is clicked', () => {
    const onOpen = vi.fn()
    render(
      <OrdersList orders={[{ ...baseOrder, id: 'o42' }]} onAdvance={vi.fn()} onOpen={onOpen} />
    )
    fireEvent.click(screen.getByText('Test Customer'))
    expect(onOpen).toHaveBeenCalledWith('o42')
  })

  it('renders an Advance button when the order has a next status', () => {
    const onAdvance = vi.fn()
    render(
      <OrdersList
        orders={[{ ...baseOrder, id: 'o1', status: 'confirming' }]}
        onAdvance={onAdvance}
        onOpen={vi.fn()}
      />
    )
    const btn = screen.getByRole('button', { name: /confirm payment/i })
    fireEvent.click(btn)
    expect(onAdvance).toHaveBeenCalledWith('o1', 'packing')
  })

  it('does not render an Advance button for terminal statuses', () => {
    render(
      <OrdersList
        orders={[{ ...baseOrder, id: 'o1', status: 'delivered' }]}
        onAdvance={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /mark.*deliver|confirm/i })).not.toBeInTheDocument()
  })

  it('does not trigger onOpen when the advance button is clicked', () => {
    const onOpen = vi.fn()
    const onAdvance = vi.fn()
    render(
      <OrdersList
        orders={[{ ...baseOrder, id: 'o1', status: 'packing' }]}
        onAdvance={onAdvance}
        onOpen={onOpen}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /mark packed/i }))
    expect(onAdvance).toHaveBeenCalledWith('o1', 'shipped')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('renders an empty tbody when no orders are passed', () => {
    render(<OrdersList orders={[]} onAdvance={vi.fn()} onOpen={vi.fn()} />)
    // header still renders
    expect(screen.getByText('#')).toBeInTheDocument()
    // no rows
    expect(screen.queryByText('Test Customer')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm run test:run -- src/components/orders/__tests__/OrdersList.test.tsx
```

Expected: FAIL with `Cannot find module '../OrdersList'`.

- [ ] **Step 3: Implement `OrdersList`**

Create `src/components/orders/OrdersList.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { PAYMENT_BADGE } from '@/types/payments'
import type { OrderCard, OrderStatus } from '@/types/orders'
import { formatAmount } from '@/lib/currency'

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

const STATUS_LABEL: Record<OrderStatus, string> = {
  created:    'Created',
  awaiting:   'Awaiting payment',
  confirming: 'Confirming',
  packing:    'Packing',
  shipped:    'Shipped',
  delivered:  'Delivered',
}

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirming: 'packing',
  packing: 'shipped',
  shipped: 'delivered',
}

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  confirming: 'Confirm payment →',
  packing: 'Mark packed →',
  shipped: 'Mark delivered →',
}

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0] ?? '?']).join('')
}

function fmtAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

interface Props {
  orders: OrderCard[]
  onAdvance: (id: string, status: OrderStatus) => void
  onOpen: (id: string) => void
}

export function OrdersList({ orders, onAdvance, onOpen }: Props) {
  return (
    <table className="pt-or-list">
      <thead>
        <tr>
          <th>#</th>
          <th>Date</th>
          <th>Customer</th>
          <th>Items</th>
          <th>Pay</th>
          <th className="r">Amount</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {orders.map(o => {
          const ChIcon = CH_ICONS[o.channel]
          const nextStatus = NEXT_STATUS[o.status]
          return (
            <tr
              key={o.id}
              className="pt-or-list-row"
              onClick={() => onOpen(o.id)}
              style={{ cursor: 'pointer' }}
            >
              <td className="mono">
                <Link
                  href={`/orders/${o.id}`}
                  className="pt-link"
                  onClick={e => e.stopPropagation()}
                >
                  #{o.refNumber}
                </Link>
              </td>
              <td>{fmtAge(o.createdAt)}</td>
              <td>
                <span className="pt-or-list-cust">
                  <span className="pt-or-list-av" data-channel={o.channel}>
                    {initials(o.customerName)}
                  </span>
                  <span>{o.customerName}</span>
                  {ChIcon && <ChIcon size={12} />}
                </span>
              </td>
              <td>
                {o.items.slice(0, 2).map((it, i) => (
                  <span key={i} className="pt-cu-item-chip">
                    {it.name}{it.qty > 1 ? ` ×${it.qty}` : ''}
                  </span>
                ))}
                {o.items.length > 2 && (
                  <span className="pt-cu-item-more">+{o.items.length - 2} more</span>
                )}
              </td>
              <td>
                <span
                  className="pt-pay-asset"
                  data-asset={PAYMENT_BADGE[o.paymentAsset ?? '']?.key ?? 'other'}
                >
                  {PAYMENT_BADGE[o.paymentAsset ?? '']?.label ?? o.paymentAsset ?? '—'}
                </span>
              </td>
              <td className="r mono">{formatAmount(o.paymentAmount, o.currency)}</td>
              <td>
                <span className="pt-or-list-status">
                  <span className={`pt-or-col-dot pt-or-dot-${o.status}`} />
                  {STATUS_LABEL[o.status]}
                </span>
              </td>
              <td>
                {nextStatus && (
                  <button
                    className="pt-or-advance"
                    onClick={e => { e.stopPropagation(); onAdvance(o.id, nextStatus) }}
                  >
                    {NEXT_LABEL[o.status]}
                  </button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm run test:run -- src/components/orders/__tests__/OrdersList.test.tsx
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/orders/OrdersList.tsx src/components/orders/__tests__/OrdersList.test.tsx
git commit -m "feat: add OrdersList tabular view component"
```

---

## Task 3: Wire view toggle into `OrdersView`

Add the segment control to the header and the localStorage-persisted view state. Conditionally render `<OrdersBoard>` or `<OrdersList>`.

**Files:**
- Modify: `src/components/orders/OrdersView.tsx`

- [ ] **Step 1: Add the view state and localStorage sync**

In `src/components/orders/OrdersView.tsx`, add at the top of the component body (alongside the other `useState` calls):

```tsx
const [view, setView] = useState<'board' | 'list'>('board')

useEffect(() => {
  const stored = localStorage.getItem('pt:orders-view')
  if (stored === 'list' || stored === 'board') setView(stored)
}, [])

function switchView(next: 'board' | 'list') {
  setView(next)
  localStorage.setItem('pt:orders-view', next)
}
```

If `useEffect` isn't already imported at the top of the file, add it: `import { useState, useEffect } from 'react'`.

- [ ] **Step 2: Add the segment control to the header**

Find the `<div className="pt-or-hd-actions">` block. Add the segment control as the first child (before the search and the "New order" button):

```tsx
<div className="pt-or-hd-actions">
  <div className="pt-segctl" role="tablist" aria-label="View mode">
    <button
      type="button"
      role="tab"
      aria-selected={view === 'board'}
      className={view === 'board' ? 'is-on' : undefined}
      onClick={() => switchView('board')}
    >
      Board
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={view === 'list'}
      className={view === 'list' ? 'is-on' : undefined}
      onClick={() => switchView('list')}
    >
      List
    </button>
  </div>
  <div className="pt-or-search">
    {/* …existing search… */}
  </div>
  {/* …existing New order button… */}
</div>
```

- [ ] **Step 3: Import `OrdersList`**

Add to the top of `src/components/orders/OrdersView.tsx`:

```ts
import { OrdersList } from './OrdersList'
```

- [ ] **Step 4: Conditionally render the active view**

Find where `<OrdersBoard …>` was rendered (added in Task 1). Replace with:

```tsx
{view === 'board' ? (
  <OrdersBoard
    orders={orders}
    pulse={pulse}
    onAdvance={tryMove}
    onOpen={(id) => router.push(`/orders/${id}`)}
  />
) : (
  <OrdersList
    orders={orders}
    onAdvance={tryMove}
    onOpen={(id) => router.push(`/orders/${id}`)}
  />
)}
```

This block goes inside the `orders.length === 0 ? <empty-state> : (…)` ternary — both views share the empty-state branch from `OrdersView`.

- [ ] **Step 5: Run tests**

Run:
```bash
npm run test:run
npx tsc --noEmit
```

Expected: no new failures, no new TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/orders/OrdersView.tsx
git commit -m "feat: add Board/List view toggle to OrdersView with localStorage persistence"
```

---

## Task 4: Add list-view CSS

The table renders but is unstyled. Add `.pt-or-list*` rules to `styles/orders.css` so it matches the visual weight of other tables in the site (e.g., the order-history table on the customer detail page, the contacts list tables).

**Files:**
- Modify: `styles/orders.css`

- [ ] **Step 1: Open `styles/orders.css` and find an appropriate place to add the new rules**

The existing file has `pt-or-board`, `pt-or-card`, `pt-or-col`, etc. Add the new `.pt-or-list*` rules near the bottom of the file, after the existing `.pt-or-advance` block.

- [ ] **Step 2: Add table styles**

Append to `styles/orders.css`:

```css
/* Orders list view ─────────────────────────────────── */

.pt-or-list {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  background: var(--pt-surface);
  border: 0.5px solid var(--pt-line);
  border-radius: 8px;
  overflow: hidden;
}

.pt-or-list thead {
  background: oklch(from var(--pt-fg) l c h / 0.03);
}

.pt-or-list th {
  text-align: left;
  font-weight: 500;
  font-size: 11px;
  color: var(--pt-fg-3);
  padding: 8px 12px;
  border-bottom: 0.5px solid var(--pt-line);
}

.pt-or-list th.r,
.pt-or-list td.r {
  text-align: right;
}

.pt-or-list-row td {
  padding: 10px 12px;
  border-bottom: 0.5px solid var(--pt-line);
  vertical-align: middle;
  color: var(--pt-fg);
}

.pt-or-list-row:last-child td {
  border-bottom: none;
}

.pt-or-list-row:hover {
  background: oklch(from var(--pt-fg) l c h / 0.03);
}

.pt-or-list-cust {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pt-or-list-av {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--pt-surface-2);
  font-size: 9px;
  font-weight: 500;
  color: var(--pt-fg-2);
  flex-shrink: 0;
}

.pt-or-list-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.pt-or-list .pt-or-col-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}

/* Action column: keep the button compact in a row */
.pt-or-list .pt-or-advance {
  padding: 4px 8px;
  font-size: 11px;
}
```

(Adjust the spacing/colors if they look off when you run it — match neighboring tables in the project. If `--pt-surface-2` doesn't exist, use whichever neutral background variable the customers table uses.)

- [ ] **Step 3: Commit**

```bash
git add styles/orders.css
git commit -m "style: add table styles for OrdersList view"
```

---

## Task 5: End-to-end verification

- [ ] **Step 1: Full test suite**

Run:
```bash
npm run test:run
```

Expected: same baseline as the project's known pre-existing failures. The new OrdersList tests (6) should pass. The existing OrdersView-related tests (if any) should still pass.

- [ ] **Step 2: TypeScript check**

Run:
```bash
npx tsc --noEmit
```

Expected: clean (no new errors).

- [ ] **Step 3: Build check**

Run:
```bash
npm run build 2>&1 | tail -30
```

Expected: build completes (or only fails on the pre-existing Vercel-only Google Fonts SSL issue if running locally). No TS / module / syntax errors caused by this feature.

- [ ] **Step 4: Manual smoke walk** (if dev server runs)

```bash
npm run dev
```

Open `/orders`. Confirm:
1. Default view is Board (Kanban).
2. Click "List" in the segment control → switches to the table.
3. Refresh the page → still on List (persisted).
4. Click a row → navigates to `/orders/[id]`.
5. Click the "#1234" link in the row → navigates to the same detail page (the row click shouldn't double-fire).
6. Click an "Advance →" button on a row → status updates inline, toast appears, button disappears or label changes.
7. Click "Board" → back to Kanban, drag-and-drop still works.
8. Refresh → still on Board.

If the dev server doesn't run (Google Fonts SSL issue), do a code-level sanity walk instead: read the diff and confirm each piece.

- [ ] **Step 5: No fixes needed unless verification surfaced issues**

If the smoke walk surfaced UX issues (column alignment, spacing, status color contrast), fix and commit as small `style:` or `fix:` commits. Otherwise no commit for Task 5.

---

## Notes for the engineer

- **No DB changes, no server actions, no migrations.** All client-side.
- **`fmtAge` exists in two places** (the original `fmtAge` in the Kanban that takes minutes, and the new `fmtAge` in `OrdersList` that takes an ISO date). These differ on purpose — Kanban shows minutes/hours/days because cards display short-lived state; the list view shows longer-form date-style ages because rows scan more like history. Don't try to unify them in this plan; a shared helper is a follow-up that should also touch the contacts tables (the deferred "shared `fmtAge`" follow-up).
- **`pt-segctl` is `<button>`-based, not `<input type="radio">`.** ARIA labels (`role="tablist"`, `role="tab"`, `aria-selected`) make it accessible. Tab navigation works natively for buttons; arrow-key navigation is not implemented (consistent with the rest of the project).
- **The "search" input is intentionally inert in both views.** Wiring it is a separate spec.
- **Empty state is shared.** When `orders.length === 0`, neither view renders — the `OrdersView`-level empty state shows instead.
