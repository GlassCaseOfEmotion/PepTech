# Mobile Responsive Sub-project 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shell, inbox, dashboard, and customer detail views responsive at ≤768px via a bottom tab bar, stacked inbox panels, curated dashboard cards, and a tabbed customer detail layout.

**Architecture:** Single `max-width: 768px` breakpoint. New `BottomNav` client component replaces the sidebar on mobile. CSS media queries added to existing style files. Customer detail body extracted into a client component to enable mobile tab state. No new pages or routes.

**Tech Stack:** Next.js 15 App Router, React, CSS media queries, `usePathname`, `useSearchParams`, `useState`

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/components/shell/BottomNav.tsx` | **Create** — bottom tab bar + "More" slide-up sheet |
| `src/components/customers/CustomerDetailBody.tsx` | **Create** — client component with mobile tab state, wraps all customer detail cards |
| `styles/peptech.css` | Add mobile shell CSS (pt-root, sidebar hide, bottom nav, top bar strip, dashboard cards) |
| `styles/inbox.css` | Add mobile inbox panel stack + has-conversation toggle CSS |
| `styles/customer.css` | Add mobile hero, tab bar, section show/hide CSS |
| `src/components/shell/TopBar.tsx` | Add `pt-topbar-right-toggle` class to right-rail toggle button |
| `src/components/shell/Shell.tsx` | Render `<BottomNav>`, compute `unreadCount` |
| `src/components/shell/DashboardLayout.tsx` | Render `<BottomNav>`, pass `unreadCount` |
| `src/components/inbox/InboxView.tsx` | Add `has-conversation` class to `.pt-inbox` wrapper based on selected conversation |
| `src/components/dashboard/DashboardView.tsx` | Add `pt-dash-card-inbox`, `pt-dash-card-stock`, `pt-dash-card-shipments`, `pt-revenue-spark` class names |
| `src/app/customers/[customerId]/page.tsx` | Extract body into `<CustomerDetailBody>`, pass data as props |

---

## Task 1: BottomNav component

**Files:**
- Create: `src/components/shell/BottomNav.tsx`
- Create: `src/components/shell/__tests__/BottomNav.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/shell/__tests__/BottomNav.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomNav } from '../BottomNav'

vi.mock('next/navigation', () => ({
  usePathname: () => '/inbox',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className, onClick }: any) => (
    <a href={href} className={className} onClick={onClick}>{children}</a>
  ),
}))

describe('BottomNav', () => {
  it('renders 5 tabs', () => {
    render(<BottomNav unreadCount={0} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    expect(screen.getByText('Customers')).toBeInTheDocument()
    expect(screen.getByText('Orders')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
  })

  it('shows unread badge when unreadCount > 0', () => {
    render(<BottomNav unreadCount={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('does not show badge when unreadCount is 0', () => {
    render(<BottomNav unreadCount={0} />)
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument()
  })

  it('marks inbox tab active when on /inbox', () => {
    render(<BottomNav unreadCount={0} />)
    const inboxLink = screen.getByText('Inbox').closest('a')
    expect(inboxLink?.className).toContain('is-on')
  })

  it('opens More sheet on click', async () => {
    render(<BottomNav unreadCount={0} />)
    await userEvent.click(screen.getByText('More'))
    expect(screen.getByText('Catalog')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd "c:\Users\alana\OneDrive\Documents\Pep Tech"
npm run test:run -- BottomNav
```
Expected: FAIL — "Cannot find module '../BottomNav'"

- [ ] **Step 3: Create the component**

Create `src/components/shell/BottomNav.tsx`:

```typescript
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icons } from '@/lib/icons'

interface BottomNavProps {
  unreadCount: number
}

const TABS = [
  { label: 'Dashboard', href: '/',          icon: Icons.spark  },
  { label: 'Inbox',     href: '/inbox',      icon: Icons.inbox  },
  { label: 'Customers', href: '/customers',  icon: Icons.users  },
  { label: 'Orders',    href: '/orders',     icon: Icons.box    },
]

const MORE_ITEMS = [
  { label: 'Catalog',     href: '/catalog',           icon: Icons.flask },
  { label: 'Broadcasts',  href: '/broadcasts',         icon: Icons.send  },
  { label: 'Automations', href: '/automations',        icon: Icons.zap   },
  { label: 'Vault',       href: '/vault',              icon: Icons.vault },
  { label: 'Settings',    href: '/settings/channels',  icon: Icons.gear  },
]

export function BottomNav({ unreadCount }: BottomNavProps) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
      {moreOpen && (
        <div className="pt-bn-more-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="pt-bn-more-sheet" onClick={e => e.stopPropagation()}>
            <div className="pt-bn-more-handle" />
            {MORE_ITEMS.map(item => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="pt-bn-more-item"
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
      <nav className="pt-bottom-nav">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = isActive(tab.href)
          const isInbox = tab.href === '/inbox'
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`pt-bn-tab${active ? ' is-on' : ''}`}
            >
              <span className="pt-bn-icon">
                <Icon size={22} />
                {isInbox && unreadCount > 0 && (
                  <span className="pt-bn-badge" data-testid="unread-badge">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
              <span className="pt-bn-label">{tab.label}</span>
            </Link>
          )
        })}
        <button
          className={`pt-bn-tab${moreOpen ? ' is-on' : ''}`}
          onClick={() => setMoreOpen(o => !o)}
        >
          <span className="pt-bn-icon"><Icons.more size={22} /></span>
          <span className="pt-bn-label">More</span>
        </button>
      </nav>
    </>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- BottomNav
```
Expected: 5 tests pass

- [ ] **Step 5: Add bottom nav CSS to `styles/peptech.css`**

Append to the end of `styles/peptech.css`:

```css
/* ─── Bottom nav (mobile only) ──────────────────────────────────────────── */
.pt-bottom-nav { display: none; }

@media (max-width: 768px) {
  .pt-bottom-nav {
    display: flex;
    position: fixed;
    bottom: 0; left: 0; right: 0;
    height: 56px;
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--pt-surface);
    border-top: 0.5px solid var(--pt-line);
    z-index: 300;
    align-items: stretch;
    justify-content: space-around;
  }
  .pt-bn-tab {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 3px; flex: 1;
    text-decoration: none;
    color: var(--pt-fg-4);
    background: none; border: none; cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    padding: 0;
  }
  .pt-bn-tab.is-on { color: var(--pt-accent); }
  .pt-bn-icon { position: relative; line-height: 0; }
  .pt-bn-badge {
    position: absolute; top: -4px; right: -8px;
    background: var(--pt-accent); color: #fff;
    border-radius: 10px; font-size: 9px; font-weight: 600;
    min-width: 16px; height: 16px;
    display: flex; align-items: center; justify-content: center;
    padding: 0 3px; line-height: 1;
  }
  .pt-bn-label { font-size: 10px; line-height: 1; }

  /* More sheet */
  .pt-bn-more-backdrop {
    position: fixed; inset: 0; z-index: 299;
    background: oklch(from var(--pt-bg) l c h / 0.65);
    display: flex; align-items: flex-end;
  }
  .pt-bn-more-sheet {
    width: 100%;
    background: var(--pt-surface);
    border-top: 0.5px solid var(--pt-line);
    border-radius: 16px 16px 0 0;
    padding-bottom: calc(56px + env(safe-area-inset-bottom));
  }
  .pt-bn-more-handle {
    width: 36px; height: 4px; border-radius: 2px;
    background: var(--pt-line); margin: 10px auto 4px;
  }
  .pt-bn-more-item {
    display: flex; align-items: center; gap: 16px;
    padding: 16px 24px;
    text-decoration: none; color: var(--pt-fg);
    font-size: 15px;
    border-bottom: 0.5px solid var(--pt-line-soft);
  }
  .pt-bn-more-item:last-child { border-bottom: none; }
}
```

- [ ] **Step 6: TypeScript check**

```bash
cd "c:\Users\alana\OneDrive\Documents\Pep Tech" && npx tsc --noEmit
```
Expected: 0 new errors

- [ ] **Step 7: Commit**

```bash
git add src/components/shell/BottomNav.tsx src/components/shell/__tests__/BottomNav.test.tsx styles/peptech.css
git commit -m "feat: BottomNav component with unread badge and More sheet"
```

---

## Task 2: Shell wiring + mobile foundation CSS

**Files:**
- Modify: `src/components/shell/TopBar.tsx`
- Modify: `src/components/shell/Shell.tsx`
- Modify: `src/components/shell/DashboardLayout.tsx`
- Modify: `styles/peptech.css`

- [ ] **Step 1: Add `pt-topbar-right-toggle` class to TopBar**

In `src/components/shell/TopBar.tsx`, find the right-rail toggle button and add the class:

```typescript
// Before:
className={`pt-iconbtn ${rightOpen ? 'is-on' : ''}`}
// After:
className={`pt-iconbtn pt-topbar-right-toggle ${rightOpen ? 'is-on' : ''}`}
```

- [ ] **Step 2: Add BottomNav to Shell**

In `src/components/shell/Shell.tsx`, add the import and render `<BottomNav>`.

The `unreadCount` is derived from the already-fetched `pinnedConversations` — count threads where `unread_count > 0`. In the server component, compute this and pass it as a prop to `BottomNav`:

```typescript
// Add import at top:
import { BottomNav } from './BottomNav'

// Inside the Shell component, after building pinnedConversations:
const unreadCount = (pinned ?? []).filter(
  (c: { unread_count: number }) => c.unread_count > 0
).length

// In the JSX, add after <AgentPalette />:
<BottomNav unreadCount={unreadCount} />
```

- [ ] **Step 3: Add BottomNav to DashboardLayout**

In `src/components/shell/DashboardLayout.tsx`:

```typescript
// Add import at top:
import { BottomNav } from './BottomNav'

// In DashboardLayoutProps, add:
// (no new prop needed — compute from existing threads prop)

// Inside the component body, before the return:
const unreadCount = threads.filter(t => t.unread > 0).length

// In the JSX, add after <AgentPalette />:
<BottomNav unreadCount={unreadCount} />
```

- [ ] **Step 4: Add mobile shell CSS to `styles/peptech.css`**

Append inside the existing `@media (max-width: 768px)` block (or add a new one right after the bottom nav block added in Task 1):

```css
@media (max-width: 768px) {
  /* Root grid — single column, bottom nav handled by fixed positioning */
  .pt-root,
  .pt-root.no-right,
  .pt-root.is-inbox {
    grid-template-columns: 1fr !important;
  }

  /* Hide desktop-only shell elements */
  .pt-sidebar { display: none !important; }
  .pt-right   { display: none !important; }
  .pt-top-mid { display: none; }
  .pt-topbar-right-toggle { display: none; }

  /* Push page content above fixed bottom nav */
  .pt-main { padding-bottom: calc(56px + env(safe-area-inset-bottom)); }

  /* Top bar tighter on mobile */
  .pt-top { padding: 0 12px; }
}
```

- [ ] **Step 5: TypeScript check + tests**

```bash
npx tsc --noEmit && npm run test:run
```
Expected: 0 TS errors, all previously passing tests still pass

- [ ] **Step 6: Manual smoke test**

Open `http://localhost:3000` in a browser, resize to 375px wide. Verify:
- Sidebar disappears
- Bottom nav appears with 5 tabs
- Tapping "More" opens the slide-up sheet

- [ ] **Step 7: Commit**

```bash
git add src/components/shell/TopBar.tsx src/components/shell/Shell.tsx src/components/shell/DashboardLayout.tsx styles/peptech.css
git commit -m "feat: wire BottomNav into Shell and DashboardLayout, mobile shell CSS"
```

---

## Task 3: Inbox mobile layout

**Files:**
- Modify: `styles/inbox.css`
- Modify: `src/components/inbox/InboxView.tsx`

- [ ] **Step 1: Add mobile CSS to `styles/inbox.css`**

Append to `styles/inbox.css`:

```css
/* ─── Mobile inbox layout (≤768px) ─────────────────────────────────────── */
@media (max-width: 768px) {
  .pt-inbox {
    grid-template-columns: 1fr !important;
    height: calc(100vh - 48px);
  }

  /* Default: show thread list, hide conversation and rail */
  .pt-ix-conv { display: none !important; }
  .pt-ix-rail { display: none !important; }

  /* When a conversation is selected: hide list, show conversation */
  .pt-inbox.has-conversation .pt-ix-list { display: none !important; }
  .pt-inbox.has-conversation .pt-ix-conv { display: flex !important; }

  /* Thread list fills full width */
  .pt-ix-list { width: 100% !important; border-right: none !important; }

  /* Conversation fills full width */
  .pt-ix-conv { width: 100% !important; }

  /* Customer details bottom sheet — peek bar always visible */
  .pt-ix-mobile-sheet-peek {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: var(--pt-surface);
    border-top: 0.5px solid var(--pt-line);
    cursor: pointer;
  }
  .pt-ix-mobile-sheet-expanded .pt-ix-mobile-sheet-peek {
    border-bottom: 0.5px solid var(--pt-line);
  }
  .pt-ix-mobile-sheet-body {
    display: none;
    padding: 12px 14px;
    background: var(--pt-surface);
  }
  .pt-ix-mobile-sheet-expanded .pt-ix-mobile-sheet-body { display: block; }

  .pt-ix-mobile-sheet-name { font-size: 13px; font-weight: 600; color: var(--pt-fg); flex: 1; }
  .pt-ix-mobile-sheet-meta { font-size: 12px; color: var(--pt-fg-3); }
  .pt-ix-mobile-sheet-chevron { font-size: 12px; color: var(--pt-fg-4); transition: transform 0.2s; }
  .pt-ix-mobile-sheet-expanded .pt-ix-mobile-sheet-chevron { transform: rotate(180deg); }

  .pt-ix-mobile-detail-row {
    display: flex; justify-content: space-between;
    padding: 5px 0; border-bottom: 0.5px solid var(--pt-line-soft);
    font-size: 12px;
  }
  .pt-ix-mobile-detail-row:last-child { border-bottom: none; }
  .pt-ix-mobile-detail-key { color: var(--pt-fg-3); }
  .pt-ix-mobile-detail-val { color: var(--pt-fg); font-weight: 500; }
}

/* On desktop, ensure mobile-only elements are hidden */
@media (min-width: 769px) {
  .pt-ix-mobile-sheet-peek,
  .pt-ix-mobile-sheet-body { display: none !important; }
}
```

- [ ] **Step 2: Add `has-conversation` class toggle to InboxView**

Open `src/components/inbox/InboxView.tsx`. Find the main component function (the one exported as `InboxView`) and the `.pt-inbox` wrapper div.

Add `useSearchParams` to read the selected conversation from the URL, and toggle the class:

```typescript
// Add to imports at top of file:
import { useSearchParams } from 'next/navigation'

// Inside the InboxView component, near the top of the function body:
const searchParams = useSearchParams()
const selectedConvId = searchParams.get('conversation')

// Find the .pt-inbox wrapper div and update its className:
// Before (example):
<div className="pt-inbox">
// After:
<div className={`pt-inbox${selectedConvId ? ' has-conversation' : ''}`}>
```

Note: `InboxView.tsx` is already a `'use client'` component, so `useSearchParams` works without a Suspense boundary.

- [ ] **Step 3: Add mobile sheet to conversation view**

In `InboxView.tsx`, find where the conversation panel is rendered (the `.pt-ix-conv` section). After the message list and before the composer, add the mobile customer details sheet. This requires a `useState` for the expanded state.

Add to the component that renders the conversation view (find the component responsible for the conversation pane — it likely receives `thread` or `conversation` as a prop):

```typescript
// Add to imports:
// useState is likely already imported

// In the conversation component, add state:
const [sheetExpanded, setSheetExpanded] = useState(false)

// Add the sheet JSX after the message list, before the composer:
<div className={`pt-ix-mobile-sheet${sheetExpanded ? ' pt-ix-mobile-sheet-expanded' : ''}`}>
  <div
    className="pt-ix-mobile-sheet-peek"
    onClick={() => setSheetExpanded(o => !o)}
  >
    <span className="pt-ix-mobile-sheet-name">{thread.name}</span>
    <span className="pt-ix-mobile-sheet-meta">
      LTV {formatAmountCompact(thread.ltv, baseCurrency)} · Trust {thread.trust}
    </span>
    <span className="pt-ix-mobile-sheet-chevron">▾</span>
  </div>
  <div className="pt-ix-mobile-sheet-body">
    <div className="pt-ix-mobile-detail-row">
      <span className="pt-ix-mobile-detail-key">LTV</span>
      <span className="pt-ix-mobile-detail-val">{formatAmount(thread.ltv, baseCurrency)}</span>
    </div>
    <div className="pt-ix-mobile-detail-row">
      <span className="pt-ix-mobile-detail-key">Trust</span>
      <span className="pt-ix-mobile-detail-val">{thread.trust} / 100</span>
    </div>
    <div className="pt-ix-mobile-detail-row">
      <span className="pt-ix-mobile-detail-key">Tags</span>
      <span className="pt-ix-mobile-detail-val">
        {thread.tags.length > 0 ? thread.tags.join(', ') : '—'}
      </span>
    </div>
  </div>
</div>
```

`formatAmount` and `formatAmountCompact` are already imported from `@/lib/currency` in InboxView. `baseCurrency` is already a prop on InboxView.

- [ ] **Step 4: TypeScript check + tests**

```bash
npx tsc --noEmit && npm run test:run
```
Expected: 0 new TS errors, all previously passing tests still pass

- [ ] **Step 5: Manual test**

At 375px width, open `/inbox`:
- Thread list fills screen
- Tap a thread → conversation fills screen, thread list disappears
- Customer sheet peek visible at bottom of conversation
- Tap peek bar → sheet expands showing LTV/Trust/Tags

- [ ] **Step 6: Commit**

```bash
git add styles/inbox.css src/components/inbox/InboxView.tsx
git commit -m "feat: mobile inbox panel stack with customer details bottom sheet"
```

---

## Task 4: Dashboard mobile layout

**Files:**
- Modify: `src/components/dashboard/DashboardView.tsx`
- Modify: `styles/peptech.css`

- [ ] **Step 1: Add class names to dashboard cards in DashboardView.tsx**

In `src/components/dashboard/DashboardView.tsx`, find the `<DashCard>` usage for InboxCard, StockCard, ShipmentsCard, and the Revenue sparkline.

The `DashCard` component wraps each card. It likely accepts a `className` prop or renders a wrapper div. Check how `DashCard` is defined — if it accepts `className`, add it. If not, wrap the card in a `<div>`.

**Option A — if DashCard accepts className:**
```typescript
// InboxCard render:
<InboxCard threads={threads} className="pt-dash-card-inbox" />

// StockCard render:
<StockCard products={stockProducts} className="pt-dash-card-stock" />

// ShipmentsCard render:
<ShipmentsCard shipments={MOCK_SHIPMENTS} className="pt-dash-card-shipments" />
```

**Option B — wrap with a div (use this if DashCard doesn't accept className):**
```tsx
<div className="pt-dash-card-inbox"><InboxCard threads={threads} /></div>
<div className="pt-dash-card-stock"><StockCard products={stockProducts} /></div>
<div className="pt-dash-card-shipments"><ShipmentsCard shipments={MOCK_SHIPMENTS} /></div>
```

For the revenue sparkline, find the sparkline chart element inside `RevenueCard` and add `className="pt-revenue-spark"` to its wrapper div.

- [ ] **Step 2: Add dashboard mobile CSS to `styles/peptech.css`**

Append inside the `@media (max-width: 768px)` block:

```css
@media (max-width: 768px) {
  /* Dashboard KPIs: 2×2 grid */
  .pt-kpis { grid-template-columns: 1fr 1fr !important; }

  /* Card grid: single column, no min-height constraint */
  .pt-grid {
    grid-template-columns: 1fr !important;
    grid-auto-rows: auto !important;
  }

  /* Span-2 cards become single column on mobile */
  .pt-span-2 { grid-column: span 1 !important; }

  /* Hide non-essential cards */
  .pt-dash-card-inbox,
  .pt-dash-card-stock,
  .pt-dash-card-shipments { display: none !important; }

  /* Hide revenue sparkline — show headline number only */
  .pt-revenue-spark { display: none !important; }
}
```

- [ ] **Step 3: TypeScript check + tests**

```bash
npx tsc --noEmit && npm run test:run
```
Expected: 0 new errors

- [ ] **Step 4: Manual test**

At 375px width, open `/`:
- KPI strip shows 2×2 grid
- Inbox card absent
- Reorder signals, Payments, Revenue cards visible and stacked

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/DashboardView.tsx styles/peptech.css
git commit -m "feat: mobile dashboard layout — 2x2 KPIs, curated card set"
```

---

## Task 5: Customer detail mobile layout

**Files:**
- Create: `src/components/customers/CustomerDetailBody.tsx`
- Modify: `src/app/customers/[customerId]/page.tsx`
- Modify: `styles/customer.css`

- [ ] **Step 1: Create the `CustomerDetailBody` client component**

Create `src/components/customers/CustomerDetailBody.tsx`. This component receives all the card data as props and handles the mobile tab state:

```typescript
'use client'

import { useState } from 'react'
import { formatAmount } from '@/lib/currency'

type Tab = 'cycles' | 'activity' | 'orders' | 'notes'

interface CustomerDetailBodyProps {
  children: {
    cycles: React.ReactNode
    activity: React.ReactNode
    orders: React.ReactNode
    notes: React.ReactNode
    // Desktop-only sections (trust, details) — hidden on mobile
    trust?: React.ReactNode
    details?: React.ReactNode
  }
}

export function CustomerDetailBody({ children }: CustomerDetailBodyProps) {
  const [tab, setTab] = useState<Tab>('cycles')

  const TABS: { id: Tab; label: string }[] = [
    { id: 'cycles',   label: 'Cycles'   },
    { id: 'activity', label: 'Activity' },
    { id: 'orders',   label: 'Orders'   },
    { id: 'notes',    label: 'Notes'    },
  ]

  return (
    <>
      {/* Mobile tab bar — hidden on desktop via CSS */}
      <div className="pt-cd-tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`pt-cd-tab${tab === t.id ? ' is-on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Desktop: 2-column grid. Mobile: only active tab visible */}
      {/* pt-cu-grid is the existing class for the 2-col card layout in customer.css */}
      <div className="pt-cu-grid">
        <div className="pt-cu-col">
          <div className={`pt-cd-section${tab === 'orders' ? ' is-active' : ''}`} data-section="orders">
            {children.orders}
          </div>
          <div className={`pt-cd-section${tab === 'cycles' ? ' is-active' : ''}`} data-section="cycles">
            {children.cycles}
          </div>
          <div className={`pt-cd-section${tab === 'notes' ? ' is-active' : ''}`} data-section="notes">
            {children.notes}
          </div>
        </div>
        <div className="pt-cu-col">
          {children.trust && (
            <div className="pt-cd-section pt-cd-desktop-only" data-section="trust">
              {children.trust}
            </div>
          )}
          {children.details && (
            <div className="pt-cd-section pt-cd-desktop-only" data-section="details">
              {children.details}
            </div>
          )}
          <div className={`pt-cd-section${tab === 'activity' ? ' is-active' : ''}`} data-section="activity">
            {children.activity}
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Update `page.tsx` to use `CustomerDetailBody`**

In `src/app/customers/[customerId]/page.tsx`:

Add the import:
```typescript
import { CustomerDetailBody } from '@/components/customers/CustomerDetailBody'
```

Find the section of the JSX that renders the two-column body (the cards below the header). Replace the direct column rendering with `<CustomerDetailBody>`:

```tsx
<CustomerDetailBody>
  {{
    cycles:   <ActiveCyclesCard ... />,        // move existing JSX here
    activity: {/* activity card JSX */},        // move existing JSX here
    orders:   {/* orders card JSX */},          // move existing JSX here
    notes:    <CustomerNoteCard ... />,         // move existing JSX here
    trust:    {/* trust score card JSX */},     // move existing JSX here
    details:  {/* details card JSX */},         // move existing JSX here
  }}
</CustomerDetailBody>
```

The existing card components (`ActiveCyclesCard`, `CustomerNoteCard`, etc.) and their props stay exactly the same — they just move inside the `CustomerDetailBody` prop object.

- [ ] **Step 3: Add mobile hero stats to the customer header**

In `src/app/customers/[customerId]/page.tsx`, find the `.pt-cu-hd` section. After the existing handle/name line, add a mobile-only stat strip and action row:

```tsx
{/* Mobile hero stats — hidden on desktop via CSS */}
<div className="pt-cu-hd-mobile-stats">
  <div className="pt-cu-hd-stat">
    <strong>{formatAmount(customer.ltv, baseCurrency)}</strong>
    <span>LTV</span>
  </div>
  <div className="pt-cu-hd-stat">
    <strong>{orders?.length ?? 0}</strong>
    <span>Orders</span>
  </div>
  <div className="pt-cu-hd-stat">
    <strong>{orders?.[0] ? new Date(orders[0].created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</strong>
    <span>Last order</span>
  </div>
</div>
```

Also add the trust score pill to the header (visible on mobile, can also show on desktop):
```tsx
{/* Trust pill — shown top-right of header */}
<div className="pt-cu-hd-trust-pill">
  <div className="pt-cu-hd-trust-num">{customer.trust_score}</div>
  <div className="pt-cu-hd-trust-lbl">Trust</div>
</div>
```

This pill goes inside `.pt-cu-hd-id`, as a sibling to the name/handle divs, positioned `position: absolute; right: 0` on mobile.

- [ ] **Step 4: Add mobile CSS to `styles/customer.css`**

Append to `styles/customer.css`:

```css
/* ─── Mobile customer detail (≤768px) ──────────────────────────────────── */

/* Mobile hero stats strip */
.pt-cu-hd-mobile-stats {
  display: none; /* hidden on desktop */
}
.pt-cu-hd-trust-pill {
  display: none; /* hidden on desktop — trust shown in desktop trust card */
}

/* Tab bar — hidden on desktop */
.pt-cd-tab-bar { display: none; }

@media (max-width: 768px) {
  /* Show mobile hero stats */
  .pt-cu-hd-mobile-stats {
    display: flex;
    gap: 0;
    margin-top: 8px;
    border-top: 0.5px solid var(--pt-line-soft);
    padding-top: 8px;
  }
  .pt-cu-hd-stat {
    flex: 1; text-align: center;
    border-right: 0.5px solid var(--pt-line-soft);
  }
  .pt-cu-hd-stat:last-child { border-right: none; }
  .pt-cu-hd-stat strong {
    display: block;
    font-size: 13px; font-weight: 700; color: var(--pt-fg);
  }
  .pt-cu-hd-stat span {
    font-size: 10px; color: var(--pt-fg-4);
    text-transform: uppercase; letter-spacing: 0.04em;
  }

  /* Trust pill */
  .pt-cu-hd-trust-pill {
    display: block;
    background: var(--pt-bg-2);
    border: 0.5px solid var(--pt-line);
    border-radius: 8px;
    padding: 4px 8px;
    text-align: center;
    flex-shrink: 0;
  }
  .pt-cu-hd-trust-num {
    font-size: 15px; font-weight: 700; color: var(--pt-accent); line-height: 1.1;
  }
  .pt-cu-hd-trust-lbl {
    font-size: 9px; color: var(--pt-fg-4);
    text-transform: uppercase; letter-spacing: 0.04em;
  }

  /* Header: make room for trust pill on the right */
  .pt-cu-hd-id { position: relative; padding-right: 60px; }

  /* Tab bar */
  .pt-cd-tab-bar {
    display: flex;
    border-bottom: 0.5px solid var(--pt-line);
    background: var(--pt-surface);
    position: sticky; top: 48px; z-index: 10;
  }
  .pt-cd-tab {
    flex: 1; padding: 10px 4px;
    font-size: 12px; color: var(--pt-fg-4);
    background: none; border: none; cursor: pointer;
    border-bottom: 2px solid transparent;
    -webkit-tap-highlight-color: transparent;
  }
  .pt-cd-tab.is-on {
    color: var(--pt-accent);
    border-bottom-color: var(--pt-accent);
    font-weight: 500;
  }

  /* Body layout: single column on mobile */
  /* pt-cu-grid is the existing 2-col card grid (customer.css:83) */
  .pt-cu-grid {
    display: block !important;
  }
  .pt-cu-col { width: 100% !important; }

  /* Hide desktop-only sections (trust card, details card) */
  .pt-cd-desktop-only { display: none !important; }

  /* Show only active tab section; hide all others */
  .pt-cd-section { display: none; }
  .pt-cd-section.is-active { display: block; }
}

@media (min-width: 769px) {
  /* On desktop: all sections visible regardless of is-active */
  .pt-cd-section { display: block !important; }
  .pt-cd-tab-bar { display: none !important; }
  .pt-cu-hd-mobile-stats { display: none !important; }
  .pt-cu-hd-trust-pill { display: none !important; }
}
```

- [ ] **Step 5: TypeScript check + tests**

```bash
npx tsc --noEmit && npm run test:run
```
Expected: 0 new TS errors, all previously passing tests still pass

- [ ] **Step 6: Manual test**

At 375px width, open a customer detail page:
- Hero shows name, trust pill top-right, stat strip (LTV/Orders/Last order)
- "Cycles" tab is default and active
- Tapping other tabs switches content
- Desktop tabs (Trust, Details) are hidden
- At 1280px: all cards visible, tabs hidden, original layout intact

- [ ] **Step 7: Commit**

```bash
git add src/components/customers/CustomerDetailBody.tsx src/app/customers/[customerId]/page.tsx styles/customer.css
git commit -m "feat: mobile customer detail — hero stats, section tabs, Cycles first"
```

---

## Final Verification

Run the full test suite:
```bash
npm run test:run
```
Expected: all previously passing tests still pass, BottomNav tests added.

Manual end-to-end at 375px width:
1. `/` — 2×2 KPIs, Reorders + Payments + Revenue stacked, no Inbox card
2. Bottom nav shows Dashboard/Inbox/Customers/Orders/More tabs
3. `/inbox` — thread list full width, tap thread → conversation full width with peek sheet
4. Customer detail — hero with trust pill, Cycles tab default, Activity/Orders/Notes tabs work
5. Resize to 1280px — sidebar returns, bottom nav gone, all desktop layouts intact
6. `npx tsc --noEmit` — 0 errors

Push:
```bash
git push
```
