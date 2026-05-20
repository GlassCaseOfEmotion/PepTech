# Approval Queue Visibility — Design Spec

**Date:** 2026-05-20  
**Status:** Approved

---

## Problem

Automation runs with `state = 'queued'` (messages waiting for operator approval before sending) are only visible deep inside the Automations page — you have to navigate there, select a specific automation, and scroll to the "Pending review" section. Operators miss the backlog or have to actively check for it. The goal is to surface pending approvals everywhere the operator already looks.

---

## Solution Overview

Three surfaces, one shared data source:

1. **Sidebar badge** on the Automations nav item — always-visible count
2. **Right rail section** on the Dashboard — inline approve/dismiss above "Today"
3. **Pinned section** at the top of the Inbox conversation list — inline approve/dismiss

All three use the same queued runs data fetched once at the Shell/page level and passed down. Approve & Dismiss use existing server actions (`approveAndSendQueuedRun`, `dismissQueuedRun` in `src/app/automations/actions.ts`) — no new server logic needed.

---

## Data Layer

### New server function: `getQueuedRuns()`

**Location:** `src/app/automations/actions.ts` (add alongside existing actions)

```typescript
export async function getQueuedRuns(): Promise<QueuedRun[]>

type QueuedRun = {
  id: string
  automationName: string   // from joined automations.name
  contextLabel: string | null   // customer name (context_label)
  message: string          // from action_payload.message
  conversationId: string | null  // from action_payload.conversationId
  createdAt: string
}
```

Query: `automation_runs` where `state = 'queued'`, joined to `automations` for the name, ordered by `created_at` asc (oldest first — process in order). Scoped to tenant via RLS.

### Fetching strategy

Fetched **server-side at page load** in the Shell server component (`src/components/shell/Shell.tsx`). The result flows as props to:
- `Sidebar` → count only (`.length`)
- `DashboardRightRail` → full list (capped at 5, with "View all" link if more)
- `InboxView` → full list (all items shown)

Refreshes on every page navigation — no real-time subscription needed (agreed).

---

## Surface 1: Sidebar Badge

**File:** `src/components/shell/Sidebar.tsx`

The `NAV_PRIMARY` array has a `badge: null` field on every item. The `Automations` entry gets `badge: queuedCount` passed from Shell, which renders as `<span className="pt-nav-badge">{badge}</span>` (infrastructure already exists, unused).

- Appears only when count > 0
- Disappears when queue is empty
- No new CSS needed — `pt-nav-badge` class already exists

**Shell change:** Add `getQueuedRuns()` call to `src/components/shell/Shell.tsx`, pass `queuedCount` to `Sidebar`.

---

## Surface 2: Dashboard Right Rail

**File:** `src/components/dashboard/DashboardView.tsx` — `DashboardRightRail` component

A new `pt-right-section` added **above the existing "Today" section**. Only renders when `queuedRuns.length > 0`.

### Layout

```
┌─ Pending approvals (3) ──────────────────┐
│ Post-delivery check-in                    │
│ Alan B. · "Hey! Just checking in to…"    │
│ [Approve & Send]  [Dismiss]        2h ago │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│ First-contact welcome                     │
│ Maria L. · "Welcome! Happy to help…"     │
│ [Approve & Send]  [Dismiss]        4h ago │
└───────────────────────────────────────────┘

┌─ Today ──────────────────────────────────┐
│ · Confirm USDT from Alan B.       $240   │
│   Reply to Maria L.  "Hey when…"         │
└───────────────────────────────────────────┘
```

- Shows first 5 runs; if more, footer shows "View all X → Automations"
- Each row: automation name (muted, small), customer name · message preview (truncated ~60 chars), timestamp (relative), Approve & Send + Dismiss buttons
- **Optimistic UI:** clicking either button removes the row immediately, then calls server action
- `DashboardRightRail` becomes a client component (`'use client'`) to handle local state for optimistic removal

**Props change:** Add `queuedRuns: QueuedRun[]` to `DashboardRightRail` props.

---

## Surface 3: Inbox Pinned Section

**File:** `src/components/inbox/InboxView.tsx`

A pinned section rendered at the top of `ThreadColumn`, **above the filter pills and thread list**. Only renders when `queuedRuns.length > 0`.

### Layout

```
┌─ Pending approvals ──────────────────────┐
│ 💬 Alan B.                               │
│    Post-delivery check-in                 │
│    "Hey! Just checking in to make sure…" │
│                          [Send]  [✕]  2h │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│ 💬 Maria L.                              │
│    First-contact welcome                  │
│    "Welcome! Happy to help you get…"     │
│                          [Send]  [✕]  4h │
└───────────────────────────────────────────┘

[All 12]  [Needs reply 4]  [New 2]  [Snoozed]
──────────────────────────────────────────────
● Alan B.    Hey when is my order...    2m
...
```

- Section collapses completely when queue is empty
- [Send] = Approve & Send; [✕] = Dismiss — both optimistic, same server actions
- Message text truncated to ~80 chars with ellipsis
- Uses existing `pt-thread-*` visual language for consistency, but with a distinct background tint to differentiate from actual conversations

**Props change:** Add `queuedRuns: QueuedRun[]` to `InboxView` (or pass to `ThreadColumn` directly).

**InboxView** is already a client component — optimistic state for the queue list sits in local state alongside `threads`.

---

## CSS

New classes needed (small additions to existing CSS files):

**`styles/peptech.css`** — sidebar badge already has `pt-nav-badge`; no change.

**`styles/inbox.css`** (or inline) — pending approvals section:
- `.pt-pending-section` — container with light accent background tint, border-bottom
- `.pt-pending-hd` — header row with label + count
- `.pt-pending-row` — individual queued item row
- `.pt-pending-msg` — message preview text (truncated, muted)
- `.pt-pending-actions` — button row (right-aligned)

**`styles/dashboard.css`** (or peptech.css) — right rail section already uses `pt-right-section` / `pt-right-hd` / `pt-agenda`; pending approvals section reuses these classes for the container but needs button rows instead of links, so:
- `.pt-pending-row` (same as inbox, shared class)
- `.pt-pending-actions` (same)

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/app/automations/actions.ts` | Add `getQueuedRuns()` |
| `src/components/shell/Shell.tsx` | Call `getQueuedRuns()`, pass count to Sidebar + runs to page props |
| `src/components/shell/Sidebar.tsx` | Accept + render `queuedCount` badge on Automations item |
| `src/app/page.tsx` | Pass `queuedRuns` to `DashboardRightRail` |
| `src/components/dashboard/DashboardView.tsx` | Add pending approvals section to `DashboardRightRail`; make it `'use client'` |
| `src/app/inbox/page.tsx` | Pass `queuedRuns` to `InboxView` |
| `src/components/inbox/InboxView.tsx` | Add pinned pending approvals section to `ThreadColumn` |
| `styles/peptech.css` or `styles/inbox.css` | Add `.pt-pending-*` CSS classes |

---

## Error Handling

- Approve/dismiss failures: show inline error text on the row, re-add to local state (revert optimistic update)
- Empty queue: sections don't render — no empty state needed
- `getQueuedRuns()` failure: treat as empty array (non-fatal, log server-side)

---

## Out of Scope

- Real-time queue updates (page navigation refresh is sufficient)
- Bulk approve/dismiss
- Editing message text before sending
- Notification sound/push on new queued item
