# Approval Queue Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the automation message approval backlog on three surfaces — sidebar badge, dashboard right rail, and inbox pinned section — so operators see pending approvals without navigating to the Automations page.

**Architecture:** One new `getQueuedRuns()` server action feeds all three surfaces. The count flows into both Shell (for non-dashboard pages) and DashboardLayout (for the dashboard) to power the Sidebar badge. The full list flows into DashboardRightRail and InboxView for inline approve/dismiss. All approve/dismiss calls reuse existing `approveAndSendQueuedRun` and `dismissQueuedRun` server actions.

**Tech Stack:** Next.js 15 App Router server components + client components, Supabase, `pt-*` CSS.

---

## File Map

| File | Change |
|------|--------|
| `src/types/automations.ts` | Add `QueuedRun` type |
| `src/app/automations/actions.ts` | Add `getQueuedRuns()` |
| `src/components/shell/Sidebar.tsx` | Accept `queuedCount` prop, render badge on Automations item |
| `src/components/shell/Shell.tsx` | Fetch queued count, pass to Sidebar |
| `src/components/shell/DashboardLayout.tsx` | Accept + pass `queuedRuns`; render count badge on Sidebar |
| `src/app/page.tsx` | Fetch `queuedRuns`, pass to DashboardLayout |
| `src/components/dashboard/DashboardView.tsx` | Add pending approvals section to `DashboardRightRail` |
| `src/app/inbox/page.tsx` | Fetch `queuedRuns`, pass to InboxView |
| `src/components/inbox/InboxView.tsx` | Add pinned pending approvals section to `ThreadColumn` |
| `styles/peptech.css` | Add `.pt-pending-*` CSS classes |

---

## Task 1 — QueuedRun type + getQueuedRuns() action

**Files:**
- Modify: `src/types/automations.ts`
- Modify: `src/app/automations/actions.ts`

- [ ] Add `QueuedRun` to `src/types/automations.ts`. Add after the existing `AutomationRun` type:

```typescript
export type QueuedRun = {
  id: string
  automationName: string
  contextLabel: string | null
  message: string
  conversationId: string | null
  createdAt: string
}
```

- [ ] Add `getQueuedRuns()` to `src/app/automations/actions.ts` after `getAutomations()`:

```typescript
export async function getQueuedRuns(): Promise<QueuedRun[]> {
  try {
    const { supabase } = await getTenantId()
    const { data, error } = await supabase
      .from('automation_runs')
      .select('id, context_label, action_payload, created_at, automations(name)')
      .eq('state', 'queued')
      .order('created_at', { ascending: true })
      .limit(20)
    if (error) return []
    return (data ?? []).map(r => {
      const payload = (r.action_payload ?? {}) as Record<string, unknown>
      const auto = r.automations as { name: string } | null
      return {
        id: r.id,
        automationName: auto?.name ?? 'Automation',
        contextLabel: r.context_label,
        message: (payload.message as string) ?? '',
        conversationId: (payload.conversationId as string) ?? null,
        createdAt: r.created_at,
      }
    })
  } catch {
    return []
  }
}
```

- [ ] Add `QueuedRun` to the import in `actions.ts` (it's used as the return type above):
```typescript
import type { AutoState, AutomationWithRuns, TriggerType, ActionType, Condition, Automation, QueuedRun } from '@/types/automations'
```

- [ ] Run: `cd "c:\Users\alana\OneDrive\Documents\Pep Tech" && npx tsc --noEmit`
  Expected: no errors

- [ ] Commit:
```
git add src/types/automations.ts src/app/automations/actions.ts
git commit -m "feat: add QueuedRun type and getQueuedRuns server action"
```

---

## Task 2 — Sidebar badge

**Files:**
- Modify: `src/components/shell/Sidebar.tsx` (lines 44-55, 190-215)
- Modify: `src/components/shell/Shell.tsx`
- Modify: `src/components/shell/DashboardLayout.tsx`

### 2a — Sidebar accepts queuedCount prop

- [ ] In `src/components/shell/Sidebar.tsx`, find the `export function Sidebar(...)` signature. Add `queuedCount = 0` to its props:

```typescript
export function Sidebar({ displayName, initialPinned, queuedCount = 0 }: {
  displayName: string
  initialPinned: DbConversation[]
  queuedCount?: number
}) {
```

- [ ] In the same file, find the `NAV_PRIMARY` array (the hardcoded const at the top, not inside the function). This is a module-level const so it can't use the prop directly. Instead, **inside the `Sidebar` function body**, replace the navigation render to inject the badge dynamically. Find the `NAV_PRIMARY.map(...)` block (around line 206-213) and change it to:

```tsx
{NAV_PRIMARY.map((n) => {
  const Icon = n.icon
  const on = isActive(n.href)
  const badge = n.href === '/automations' && queuedCount > 0 ? queuedCount : null
  return (
    <Link key={n.href} href={n.href} className={`pt-nav-item ${on ? 'is-on' : ''}`} {...(n.href === '/inbox' ? { 'data-tour': 'inbox-link' } : {})}>
      <Icon size={15} />
      <span className="pt-nav-label">{n.label}</span>
      {badge != null && <span className="pt-nav-badge">{badge}</span>}
    </Link>
  )
})}
```

### 2b — Shell.tsx fetches count and passes to Sidebar

- [ ] In `src/components/shell/Shell.tsx`, add the import for `getQueuedRuns` at the top:
```typescript
import { getQueuedRuns } from '@/app/automations/actions'
```

- [ ] In the same file, inside the async server component function, add the queued count fetch alongside existing fetches:
```typescript
const queuedRuns = await getQueuedRuns().catch(() => [])
const queuedCount = queuedRuns.length
```

- [ ] Update the `<Sidebar ...>` render in Shell.tsx to pass the count:
```tsx
<Sidebar displayName={displayName} initialPinned={pinnedConversations} queuedCount={queuedCount} />
```

### 2c — DashboardLayout.tsx also passes count to Sidebar

- [ ] In `src/components/shell/DashboardLayout.tsx`, add `queuedCount` to `DashboardLayoutProps`:
```typescript
interface DashboardLayoutProps {
  // ... existing props ...
  queuedCount: number
  queuedRuns: QueuedRun[]   // needed for Task 3 — add now
}
```

- [ ] Add the import for `QueuedRun`:
```typescript
import type { QueuedRun } from '@/types/automations'
```

- [ ] Update the function signature to destructure the new props:
```typescript
export function DashboardLayout({ displayName, connectedChannels, threads, initialPinned, stockProducts, stats, reorderSignals, baseCurrency, shipments, packingOrders, activityItems, onboardingStatus, queuedCount, queuedRuns }: DashboardLayoutProps) {
```

- [ ] Update `<Sidebar>` render inside DashboardLayout to pass the count:
```tsx
<Sidebar displayName={displayName} initialPinned={initialPinned} queuedCount={queuedCount} />
```

- [ ] Run: `npx tsc --noEmit` — will show errors about `queuedRuns` not being passed to `DashboardRightRail` yet; ignore until Task 3 is done, or add a temporary pass-through.

- [ ] Commit:
```
git add src/components/shell/Sidebar.tsx src/components/shell/Shell.tsx src/components/shell/DashboardLayout.tsx
git commit -m "feat: sidebar badge shows queued automation count"
```

---

## Task 3 — Dashboard right rail pending approvals

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/dashboard/DashboardView.tsx`
- Modify: `src/components/shell/DashboardLayout.tsx` (continued from Task 2)

### 3a — page.tsx fetches queued runs

- [ ] In `src/app/page.tsx`, add the import:
```typescript
import { getQueuedRuns } from '@/app/automations/actions'
import type { QueuedRun } from '@/types/automations'
```

- [ ] Inside the page's parallel data fetch (the `Promise.all` block or alongside it), add:
```typescript
const queuedRuns = await getQueuedRuns().catch((): QueuedRun[] => [])
```

- [ ] Pass `queuedRuns` and `queuedCount` to `<DashboardLayout>`:
```tsx
<DashboardLayout
  // ... all existing props ...
  queuedRuns={queuedRuns}
  queuedCount={queuedRuns.length}
/>
```

### 3b — DashboardLayout passes queuedRuns to DashboardRightRail

- [ ] In `src/components/shell/DashboardLayout.tsx`, update the `<DashboardRightRail>` render to pass `queuedRuns`:
```tsx
<DashboardRightRail
  focusThread={focusThread}
  baseCurrency={baseCurrency}
  pendingOrders={stats.pendingOrders}
  needsReplyThreads={threads.filter(t => t.status === 'needs_reply').slice(0, 3)}
  reordersDueSoon={reorderSignals.filter(r => r.daysRemaining <= 3)}
  packingOrders={packingOrders}
  activityItems={activityItems}
  queuedRuns={queuedRuns}
/>
```

### 3c — DashboardRightRail renders pending approvals section

- [ ] In `src/components/dashboard/DashboardView.tsx`, add the import for server actions and types at the top:
```typescript
import { approveAndSendQueuedRun, dismissQueuedRun } from '@/app/automations/actions'
import type { QueuedRun } from '@/types/automations'
```

- [ ] Add `queuedRuns: QueuedRun[]` to `DashboardRightRail`'s props type and destructure it:
```typescript
export function DashboardRightRail({
  focusThread, baseCurrency, pendingOrders, needsReplyThreads,
  reordersDueSoon, packingOrders, activityItems, queuedRuns,
}: {
  // ... existing prop types ...
  queuedRuns: QueuedRun[]
}) {
```

- [ ] `DashboardRightRail` is currently a server component (no `'use client'`). It needs local state for optimistic removal. Add `'use client'` at the top of `DashboardView.tsx` — **but wait**: `DashboardView` is already `'use client'` (line 1 says so). So `DashboardRightRail` is also a client component. Good — no change needed.

- [ ] Add local state for the pending list inside `DashboardRightRail` (after the existing `agendaItems` computation):
```typescript
const [pending, setPending] = useState<QueuedRun[]>(queuedRuns)

async function approve(id: string) {
  setPending(p => p.filter(r => r.id !== id))
  await approveAndSendQueuedRun(id)
}

async function dismiss(id: string) {
  setPending(p => p.filter(r => r.id !== id))
  await dismissQueuedRun(id)
}
```

- [ ] Add the pending approvals section as the **first** `pt-right-section`, before the existing Today section. Insert this JSX inside the `<aside className="pt-right">` before the Today section:

```tsx
{pending.length > 0 && (
  <div className="pt-right-section">
    <div className="pt-right-hd">
      <span>Pending approvals</span>
      <span className="pt-nav-badge">{pending.length}</span>
    </div>
    <div className="pt-pending-list">
      {pending.slice(0, 5).map(r => (
        <div key={r.id} className="pt-pending-row">
          <div className="pt-pending-meta">
            <span className="pt-pending-auto">{r.automationName}</span>
            <span className="pt-pending-sep">·</span>
            <span className="pt-pending-customer">{r.contextLabel ?? '—'}</span>
          </div>
          <div className="pt-pending-msg">{r.message}</div>
          <div className="pt-pending-actions">
            <button className="pt-btn pt-btn-primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => approve(r.id)}>
              Approve &amp; Send
            </button>
            <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => dismiss(r.id)}>
              Dismiss
            </button>
          </div>
        </div>
      ))}
      {pending.length > 5 && (
        <a href="/automations" className="pt-link" style={{ fontSize: 11, padding: '4px 0', display: 'block' }}>
          View all {pending.length} →
        </a>
      )}
    </div>
  </div>
)}
```

- [ ] Run: `npx tsc --noEmit` — expect clean

- [ ] Commit:
```
git add src/app/page.tsx src/components/dashboard/DashboardView.tsx src/components/shell/DashboardLayout.tsx
git commit -m "feat: pending approvals section in dashboard right rail"
```

---

## Task 4 — Inbox pinned section

**Files:**
- Modify: `src/app/inbox/page.tsx`
- Modify: `src/components/inbox/InboxView.tsx`

### 4a — inbox/page.tsx fetches queued runs

- [ ] In `src/app/inbox/page.tsx`, add the import:
```typescript
import { getQueuedRuns } from '@/app/automations/actions'
import type { QueuedRun } from '@/types/automations'
```

- [ ] Add queued runs fetch inside the existing `Promise.all` block, as an additional parallel fetch:
```typescript
const [
  { data: conversations },
  { data: quickReplies },
  { data: templates },
  { count: resolvedCount },
  { data: tenantRow },
  { count: channelCount },
  queuedRuns,  // ← add here
] = await Promise.all([
  // ... all existing queries unchanged ...
  getQueuedRuns().catch((): QueuedRun[] => []),  // ← add at the end
])
```

- [ ] Pass `queuedRuns` to `<InboxView>`:
```tsx
<InboxView
  // ... all existing props unchanged ...
  queuedRuns={queuedRuns}
/>
```

### 4b — InboxView accepts and renders queued runs

- [ ] In `src/components/inbox/InboxView.tsx`, add the imports at the top:
```typescript
import { approveAndSendQueuedRun, dismissQueuedRun } from '@/app/automations/actions'
import type { QueuedRun } from '@/types/automations'
```

- [ ] Find the `InboxView` component's props interface/type and the function that calls `<ThreadColumn>`. Add `queuedRuns: QueuedRun[]` to the InboxView props and pass it down to ThreadColumn. Search for where `<ThreadColumn` is rendered — add the prop there:
```tsx
<ThreadColumn
  threads={threads}
  activeId={activeId}
  onSelect={handleSelect}
  filter={filter}
  setFilter={setFilter}
  hasChannels={hasChannels}
  queuedRuns={queuedRuns}   // ← add
/>
```

- [ ] Update `ThreadColumn`'s function signature to accept `queuedRuns`:
```typescript
function ThreadColumn({ threads, activeId, onSelect, filter, setFilter, hasChannels, queuedRuns }: {
  threads: InboxThread[]
  activeId: string
  onSelect: (id: string) => void
  filter: string
  setFilter: (f: string) => void
  hasChannels: boolean
  queuedRuns: QueuedRun[]
}) {
```

- [ ] Add local state for optimistic removal inside `ThreadColumn` (after the existing `counts` / `filters` computation):
```typescript
const [pending, setPending] = useState<QueuedRun[]>(queuedRuns)

async function approve(id: string) {
  setPending(p => p.filter(r => r.id !== id))
  await approveAndSendQueuedRun(id)
}

async function dismiss(id: string) {
  setPending(p => p.filter(r => r.id !== id))
  await dismissQueuedRun(id)
}
```

- [ ] Inside `ThreadColumn`'s return, add the pinned approvals section **after** the `<div className="pt-ix-list-hd">` block and **before** the filter pills. Find the filter pills section (the `<div>` containing `.pt-ix-filters`) and insert the pending section immediately before it:

```tsx
{pending.length > 0 && (
  <div className="pt-pending-section">
    <div className="pt-pending-section-hd">
      <span>Pending approvals</span>
      <span className="pt-nav-badge">{pending.length}</span>
    </div>
    {pending.map(r => (
      <div key={r.id} className="pt-pending-row">
        <div className="pt-pending-meta">
          <span className="pt-pending-customer">{r.contextLabel ?? '—'}</span>
          <span className="pt-pending-sep">·</span>
          <span className="pt-pending-auto">{r.automationName}</span>
        </div>
        <div className="pt-pending-msg">{r.message}</div>
        <div className="pt-pending-actions">
          <button className="pt-btn pt-btn-primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => approve(r.id)}>
            Send
          </button>
          <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => dismiss(r.id)}>
            ✕
          </button>
        </div>
      </div>
    ))}
  </div>
)}
```

- [ ] Run: `npx tsc --noEmit` — expect clean

- [ ] Commit:
```
git add src/app/inbox/page.tsx src/components/inbox/InboxView.tsx
git commit -m "feat: pending approvals pinned section in inbox thread list"
```

---

## Task 5 — CSS

**File:** `styles/peptech.css` (append to end)

- [ ] Append the following to `styles/peptech.css`:

```css
/* ─── Pending approvals (dashboard right rail + inbox) ────────────────────── */

/* Inbox pinned section wrapper */
.pt-pending-section {
  border-bottom: 0.5px solid var(--pt-line);
  background: oklch(from var(--pt-accent) l c h / 0.04);
  padding: 10px 14px 6px;
}
.pt-pending-section-hd {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--pt-fg-4);
  margin-bottom: 8px;
}

/* Shared row (both surfaces) */
.pt-pending-list { display: flex; flex-direction: column; gap: 10px; }
.pt-pending-row {
  display: flex; flex-direction: column; gap: 4px;
  padding: 8px 0;
  border-bottom: 0.5px solid var(--pt-line-soft);
}
.pt-pending-row:last-child { border-bottom: none; }
.pt-pending-meta {
  display: flex; align-items: center; gap: 5px;
  font-size: 10.5px; color: var(--pt-fg-4);
}
.pt-pending-sep { color: var(--pt-fg-4); }
.pt-pending-customer { font-weight: 500; color: var(--pt-fg-3); }
.pt-pending-auto { font-size: 10px; color: var(--pt-fg-4); }
.pt-pending-msg {
  font-size: 12px; color: var(--pt-fg-2); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.pt-pending-actions {
  display: flex; gap: 6px; align-items: center;
  margin-top: 2px;
}
```

- [ ] Run: `npx tsc --noEmit` — expect clean

- [ ] Run: `npm run test:run` — all tests should pass

- [ ] Commit:
```
git add styles/peptech.css
git commit -m "feat: pending approvals CSS for dashboard and inbox surfaces"
```

- [ ] Push: `git push origin master`

---

## Verification

1. **Sidebar badge:** Navigate to any non-Automations page (Inbox, Catalog, etc.) — badge appears on Automations nav item showing queued count. Disappears when queue is empty.
2. **Dashboard right rail:** Go to Dashboard — "Pending approvals" section appears above "Today" when queue is non-empty. Click "Approve & Send" — row disappears instantly, message is sent. Click "Dismiss" — row disappears, run is skipped.
3. **"View all" link:** If more than 5 items queued, "View all X →" link appears and routes to /automations.
4. **Inbox pinned section:** Go to Inbox — pending section appears above filter pills. Approve/Dismiss work with same optimistic behaviour.
5. **Empty state:** With no queued runs, none of the three surfaces show any pending UI — dashboard and inbox look exactly as before.
6. **TypeScript:** `npx tsc --noEmit` passes with zero errors throughout.
