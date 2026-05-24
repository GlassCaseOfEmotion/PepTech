# Peptech — Orders List View Toggle Design Spec
**Date:** 2026-05-24
**Status:** Approved (design phase)

---

## Overview

The Orders page currently has one view: a horizontal 6-column Kanban board (`created → awaiting → confirming → packing → shipped → delivered`) with drag-and-drop status transitions and inline "Advance →" buttons. The Kanban works well for triaging in-flight work but is verbose for scanning a long list, comparing amounts across orders, or hunting for a specific reference number.

This spec introduces a **List view** as a toggleable alternative. A segment control in the page header switches between Board (default) and List. Selection persists in `localStorage` so it survives refreshes and navigation. Both views render the same `OrderCard[]` data and share the same advance/click callbacks.

---

## Scope

### In scope

- Segment-control toggle in the page header: `Board` / `List`.
- Selection persists via `localStorage` (key `pt:orders-view`).
- Hydration-safe: SSR/CSR mismatch avoided by starting in `'board'` then reading `localStorage` in `useEffect`.
- New `OrdersList.tsx` component: tabular layout with `# · Date · Customer · Items · Pay · Amount · Status · Action` columns.
- Extract existing Kanban into `OrdersBoard.tsx` to keep `OrdersView` clean.
- Inline "Advance →" button preserved in the list view (where `NEXT_STATUS[o.status]` exists).
- Row click navigates to `/orders/${id}` (same as Kanban card click).
- Shared empty state — both views render the same `<EmptyState>` when `orders.length === 0`.

### Out of scope (deferred)

- Wiring up the search input (currently inert in both views — separate task).
- Column sorting in the list view (default newest-first matches the server query).
- Status filter chips on the list (Kanban already segregates by status).
- Drag-to-reorder rows.
- Bulk actions (select multiple, batch advance).
- Saved per-tenant or per-user preferences server-side.

---

## Architecture

### File decomposition

| File | Purpose |
|---|---|
| `src/components/orders/OrdersView.tsx` | Page-level wrapper. Owns view-mode toggle, search state, modal state, toast state, header, and empty-state branch. Delegates rendering to the active view. |
| `src/components/orders/OrdersBoard.tsx` | **New (extracted)** — Kanban presentation. Receives `orders`, `dragId`, `dragOverCol`, `pulse`, and callbacks for advance/drag/click. Contains the existing `<OrderCardUI>` and the `<div className="pt-or-board">` markup. |
| `src/components/orders/OrdersList.tsx` | **New** — Table presentation. Receives `orders` and callbacks for advance/click. Pure stateless component. |

### Shared callback shape

Both `OrdersBoard` and `OrdersList` receive the same callbacks from `OrdersView`:

```ts
interface SharedProps {
  orders: OrderCard[]
  onAdvance: (id: string, status: OrderStatus) => void  // server-action wrapper with toast/pulse
  onOpen: (id: string) => void                          // router.push(`/orders/${id}`)
}
```

`OrdersBoard` extends this with drag-and-drop state and handlers.

### View toggle behaviour

Inside `OrdersView`:

```ts
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

First render is always `'board'` — this matches SSR. After hydration the `useEffect` reads localStorage and updates if needed. This avoids the hydration mismatch error that would occur if we read localStorage during initial render.

---

## UI Details

### Segment control

Lives in the header's right-hand action group, immediately to the left of the `New order` button:

```tsx
<div className="pt-segctl">
  <button className={view === 'board' ? 'is-on' : undefined} onClick={() => switchView('board')}>
    Board
  </button>
  <button className={view === 'list' ? 'is-on' : undefined} onClick={() => switchView('list')}>
    List
  </button>
</div>
```

The `pt-segctl` class already exists in `styles/peptech.css` (line ~557) with active-state styling on `button.is-on`.

### List view table

```tsx
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
      <th />  {/* action column */}
    </tr>
  </thead>
  <tbody>
    {orders.map(o => (
      <tr key={o.id} onClick={() => onOpen(o.id)} className="pt-or-list-row">
        ...
      </tr>
    ))}
  </tbody>
</table>
```

| Column | Content | Notes |
|---|---|---|
| `#` | `<Link href="/orders/{id}">#{refNumber}</Link>` | mono font; `stopPropagation` on click so it doesn't double-trigger the row navigation |
| `Date` | Relative age (`today`, `2d ago`, `1w ago`) | Same `fmtAge`-style helper as the customers/contacts tables |
| `Customer` | Avatar (initials) + name + small channel icon | Compact version of the Kanban card's customer block |
| `Items` | First two `<span class="pt-cu-item-chip">` chips + `+N more` if applicable | Reuse the existing chip class from `OrderCardUI` |
| `Pay` | `<span class="pt-pay-asset" data-asset={...}>{label}</span>` | Same `PAYMENT_BADGE` lookup as Kanban |
| `Amount` | `formatAmount(amount, currency)` right-aligned, mono | |
| `Status` | `<span class="pt-or-dot-{status}">●</span> {label}` | Reuses existing dot color and the `COLUMNS` array's `label` |
| `Action` | If `NEXT_STATUS[o.status]` exists: `<button class="pt-or-advance" onClick={stopPropagation + onAdvance}>...</button>` else empty | Same component as Kanban's advance button |

### Row interactions

- Hover: subtle background tint (use existing list-row pattern from `CustomersTable`).
- Click anywhere on the row except a button/link: navigate to `/orders/${id}`.
- Button clicks (advance, ref-number link): `e.stopPropagation()` to prevent row click.

### CSS additions

Add `pt-or-list` table rules to `styles/orders.css` (or wherever `pt-or-*` rules live). Pattern after `CustomersTable`'s table styling so visual weight matches across the site:
- Same row height, padding, border treatment.
- Inherit font-size from the page-level convention.
- Mono columns (`#`, `Amount`): apply `mono` class on those `<td>` elements.

If `styles/orders.css` doesn't exist, the existing `pt-or-*` rules will be in `styles/peptech.css` or another file — search before adding.

---

## Data Model

No DB or type changes. Both views consume `OrderCard[]`, the existing shape produced by `dbOrderToCard` and passed as `initialOrders` to `OrdersView`.

---

## Out-of-scope: search input

The existing `<input placeholder="Search by # or customer…">` in the header is currently inert. This spec preserves that — neither view filters by the search input value. Wiring up search is a separate spec that should cover behaviour in both views consistently (filter the underlying `orders` array, then re-render).

---

## Open Questions / Risks

- **Mobile layout for the list view.** The table has 8 columns. On a narrow viewport some columns (e.g., Pay, Items) may need to collapse or hide. Out of scope for this spec but worth flagging during implementation — at minimum, the table should scroll horizontally rather than break.
- **localStorage availability.** Read inside `useEffect` is safe (client-only). No private/incognito-mode handling needed — falling back to the default `'board'` is fine.
- **Pulse / toast feedback.** The Kanban's `pulse` highlight on the card after an advance doesn't translate to a row in the table. The list view will rely on the existing toast for feedback. This is acceptable — toast is the universal action confirmation pattern.

---

## Success Criteria

- A tenant landing on `/orders` sees the Board view by default (matches today's behaviour).
- Clicking "List" in the segment control swaps to the table; the choice persists across refresh and navigation away/back.
- Both views render the same orders, use the same advance flow, navigate to the same detail page, and share the same toast / modal / empty-state behaviour.
- No new TS errors, no new test failures.
