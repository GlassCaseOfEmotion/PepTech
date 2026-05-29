# Inbox Redesign Phase 3 — Collapsible Views Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible "views" column as the new leftmost inbox column — a single-select lens (All · New Lead · Customer · WhatsApp · Telegram · Email) — moving channel filtering out of the thread-list pills and into it, completing the respond.io-style five-region layout.

**Architecture:** A new `view` lens (string, default `'all'`) lives in `InboxProvider` context alongside the existing `filter` (status). The thread list filters by status (`filter`) AND the lens (`view`) AND search. The channel pills are removed from `ThreadColumn`; channel + lifecycle selection moves to a new `ViewsColumn` component rendered as the first child of `.pt-inbox`. The column collapses to a thin strip (state in `localStorage`), reclaiming width for the conversation. All filtering is client-side on data threads already carry (`lifecycleStage`, `channel`) — no schema or query changes.

**Tech Stack:** Next.js 15 App Router, React client components, plain CSS (`styles/inbox.css`). UI/layout — verified by running the app.

**Spec:** [docs/superpowers/specs/2026-05-29-inbox-redesign-design.md](../specs/2026-05-29-inbox-redesign-design.md) (region 2 + the views/status split). Phases 1 (nav rail) and 2 (right rail) shipped.

**Scope decisions (confirmed):** Hot Lead view is **dropped** (no data backing — lifecycle is only lead/customer). Assignment views (Mine/Unassigned) are **deferred** (would need `assigned_to` plumbed through). This iteration: All + Lifecycle (New Lead, Customer) + Channels (WhatsApp, Telegram, Email).

---

## File Structure

- **Modify** `src/components/inbox/InboxProvider.tsx` — add `view` / `setView` to the context type, state, and value.
- **Modify** `src/components/inbox/InboxView.tsx` — `ThreadColumn`: drop `chanFilter` + the channel pills, read `view` from context, extend the `visible` filter. `InboxLayout`: render `ViewsColumn` first + apply the collapse class.
- **Create** `src/components/inbox/useViewsCollapsed.ts` — localStorage-backed collapse boolean (no DOM class; the layout applies the className in React).
- **Create** `src/components/inbox/ViewsColumn.tsx` — the single-select lens list with counts + collapse chevron.
- **Modify** `styles/inbox.css` — grid gains a leftmost column via CSS variables; views column styling; collapsed thin state; mobile hide.

Mobile note: the views column is **desktop-only** this iteration (hidden on ≤768px, consistent with how the nav rail and right rail region collapse on mobile). The status quick-filter stays in the thread list. A mobile views affordance (dropdown) is explicitly deferred.

---

### Task 1: Migrate filtering — `view` lens in context, drop channel pills

**Files:**
- Modify: `src/components/inbox/InboxProvider.tsx`
- Modify: `src/components/inbox/InboxView.tsx`

- [ ] **Step 1: Add `view` to the InboxProvider context type**

In `src/components/inbox/InboxProvider.tsx`, the context type currently has (lines ~26-27):
```ts
  filter: string
  setFilter: (f: string) => void
```
Add right after them:
```ts
  view: string
  setView: (v: string) => void
```

- [ ] **Step 2: Add the `view` state**

After `const [filter, setFilter] = useState('all')` (line ~79) add:
```ts
  const [view, setView] = useState('all')
```

- [ ] **Step 3: Expose it in the context value**

In the context value object (line ~465, where `filter, setFilter` are listed), add `view, setView`:
```ts
      threads, activeId, setActiveId, filter, setFilter, view, setView,
```
(Insert `view, setView` adjacent to `filter, setFilter` — match the exact surrounding property list in the file.)

- [ ] **Step 4: Drop `chanFilter` + read `view` in ThreadColumn**

In `src/components/inbox/InboxView.tsx`:
- Delete the local channel state (line ~84): `const [chanFilter, setChanFilter] = useState<'all' | 'wa' | 'tg' | 'em'>('all')`
- `ThreadColumn` already calls `useInbox()` (line ~82: `const { resolvedCount } = useInbox()`). Extend it to pull `view`:
```ts
  const { resolvedCount, view } = useInbox()
```

- [ ] **Step 5: Extend the `visible` filter to use the lens**

Replace the `visible` filter (lines 116-125) with:
```tsx
  const visible = threads.filter(t => {
    if (filter === 'all') { if (t.status === 'resolved') return false }
    else if (t.status !== filter) return false
    // Views lens (single-select): lifecycle or channel
    if (view === 'lead' && t.lifecycleStage !== 'lead') return false
    if (view === 'customer' && t.lifecycleStage !== 'customer') return false
    if ((view === 'wa' || view === 'tg' || view === 'em') && t.channel !== view) return false
    if (search) {
      const q = search.toLowerCase()
      return t.name.toLowerCase().includes(q) || t.handle.toLowerCase().includes(q)
    }
    return true
  })
```

- [ ] **Step 6: Remove the channel pills block**

Delete the entire second `.pt-ix-filters` block (the channel pills, lines 159-169):
```tsx
      <div className="pt-ix-filters">
        {(['all', 'wa', 'tg', 'em'] as const).map(ch => (
          ...
        ))}
      </div>
```
Leave the FIRST `.pt-ix-filters` block (status pills, lines 152-158) intact.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -E "(InboxView|InboxProvider)"` → expect no output.
Run: `grep -n "chanFilter" src/components/inbox/InboxView.tsx` → expect nothing.

At this point the inbox works exactly as before minus the channel pills (the lens defaults to `'all'`, so no behaviour change yet). The ViewsColumn UI lands in Task 3.

- [ ] **Step 8: Commit**

```bash
git add src/components/inbox/InboxProvider.tsx src/components/inbox/InboxView.tsx
git commit -m "feat(inbox): add view lens to context, drop channel filter pills"
```

---

### Task 2: `useViewsCollapsed` hook + `ViewsColumn` component

**Files:**
- Create: `src/components/inbox/useViewsCollapsed.ts`
- Create: `src/components/inbox/ViewsColumn.tsx`

- [ ] **Step 1: Write the collapse hook**

```ts
// src/components/inbox/useViewsCollapsed.ts
'use client'

import { useEffect, useState } from 'react'

const KEY = 'pt-views-collapsed'

/** Collapsed boolean for the inbox views column. Defaults to expanded (the
 * lens is useful at a glance); persists the user's choice in localStorage.
 * Unlike useNavCollapsed this does NOT touch the DOM — InboxLayout owns the
 * grid element and applies the class in React. */
export function useViewsCollapsed() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem(KEY) === '1')
  }, [])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(KEY, next ? '1' : '0')
      return next
    })
  }

  return { collapsed, toggle }
}
```

- [ ] **Step 2: Write the ViewsColumn component**

```tsx
// src/components/inbox/ViewsColumn.tsx
'use client'

import { Icons } from '@/lib/icons'
import { useInbox } from './InboxProvider'

const LIFECYCLE: { id: string; label: string }[] = [
  { id: 'lead',     label: 'New leads' },
  { id: 'customer', label: 'Customers' },
]
const CHANNELS: { id: string; label: string }[] = [
  { id: 'wa', label: 'WhatsApp' },
  { id: 'tg', label: 'Telegram' },
  { id: 'em', label: 'Email' },
]

export function ViewsColumn({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { threads, view, setView } = useInbox()

  // Counts ignore the status filter — they reflect how many active (non-resolved)
  // threads fall in each lens, so the numbers are stable as you change status.
  const active = threads.filter(t => t.status !== 'resolved')
  const countFor = (id: string): number => {
    if (id === 'all') return active.length
    if (id === 'lead' || id === 'customer') return active.filter(t => t.lifecycleStage === id).length
    return active.filter(t => t.channel === id).length
  }

  if (collapsed) {
    return (
      <aside className="pt-ix-views is-collapsed">
        <button className="pt-ix-views-toggle" title="Expand views" aria-label="Expand views" onClick={onToggle}>
          <Icons.arrowL size={13} />
        </button>
      </aside>
    )
  }

  const Row = ({ id, label }: { id: string; label: string }) => (
    <button
      className={`pt-ix-view ${view === id ? 'is-on' : ''}`}
      onClick={() => setView(id)}
    >
      <span className="pt-ix-view-label">{label}</span>
      <span className="pt-ix-view-count">{countFor(id)}</span>
    </button>
  )

  return (
    <aside className="pt-ix-views">
      <div className="pt-ix-views-hd">
        <span>Views</span>
        <button className="pt-ix-views-toggle" title="Collapse views" aria-label="Collapse views" onClick={onToggle}>
          <Icons.arrowL size={13} />
        </button>
      </div>
      <div className="pt-ix-views-body">
        <Row id="all" label="All" />
        <div className="pt-ix-views-sec">Lifecycle</div>
        {LIFECYCLE.map(v => <Row key={v.id} {...v} />)}
        <div className="pt-ix-views-sec">Channels</div>
        {CHANNELS.map(v => <Row key={v.id} {...v} />)}
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "(ViewsColumn|useViewsCollapsed)"` → expect no output. (`Icons.arrowL` is confirmed to exist — used by the Phase 1 nav-rail toggle.)

- [ ] **Step 4: Commit**

```bash
git add src/components/inbox/useViewsCollapsed.ts src/components/inbox/ViewsColumn.tsx
git commit -m "feat(inbox): ViewsColumn lens component + collapse hook"
```

---

### Task 3: Wire ViewsColumn into the layout + CSS

**Files:**
- Modify: `src/components/inbox/InboxView.tsx`
- Modify: `styles/inbox.css`

- [ ] **Step 1: Render ViewsColumn first in InboxLayout + apply collapse class**

In `src/components/inbox/InboxView.tsx`, add imports near the other inbox-component imports:
```ts
import { ViewsColumn } from './ViewsColumn'
import { useViewsCollapsed } from './useViewsCollapsed'
```

In `InboxLayout`, after the existing state declarations (e.g. after `const [activePanel, setActivePanel] = useState<RailPanel | null>(null)`), add:
```ts
  const { collapsed: viewsCollapsed, toggle: toggleViews } = useViewsCollapsed()
```

Update the `.pt-inbox` wrapper className to include the views-collapsed class (it currently is `` `pt-inbox${selectedConvId ? ' has-conversation' : ''}${activePanel ? ' is-panel-open' : ''}` ``):
```tsx
    <div className={`pt-inbox${selectedConvId ? ' has-conversation' : ''}${activePanel ? ' is-panel-open' : ''}${viewsCollapsed ? ' is-views-collapsed' : ''}`}>
```

Render `<ViewsColumn>` as the FIRST child inside that div, before `<ThreadColumn>`:
```tsx
      <ViewsColumn collapsed={viewsCollapsed} onToggle={toggleViews} />
      <ThreadColumn
        ...
      />
```

- [ ] **Step 2: Verify the layout compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "InboxView"` → expect no output.

- [ ] **Step 3: Grid — prepend the views column via CSS variables**

In `styles/inbox.css`, the current grid block (post-Phase-2, lines ~6-15) is:
```css
.pt-inbox {
  display: grid;
  grid-template-columns: 320px 1fr 48px;
  height: calc(100vh - 48px);
  overflow: hidden;
  transition: grid-template-columns 0.22s ease;
}
.pt-inbox.is-panel-open { grid-template-columns: 320px 1fr 368px; }
.pt-d-compact .pt-inbox { grid-template-columns: 296px 1fr 48px; }
.pt-d-compact .pt-inbox.is-panel-open { grid-template-columns: 296px 1fr 368px; }
```
Replace that entire block with a variable-driven 4-column grid (composes both collapse states cleanly):
```css
.pt-inbox {
  display: grid;
  --pt-views-w: 188px;
  --pt-thread-w: 320px;
  --pt-rail-w: 48px;
  grid-template-columns: var(--pt-views-w) var(--pt-thread-w) 1fr var(--pt-rail-w);
  height: calc(100vh - 48px);
  overflow: hidden;
  transition: grid-template-columns 0.22s ease;
}
.pt-inbox.is-panel-open    { --pt-rail-w: 368px; }
.pt-inbox.is-views-collapsed { --pt-views-w: 40px; }
.pt-d-compact .pt-inbox    { --pt-thread-w: 296px; }
```

- [ ] **Step 4: Views column styling**

Append (e.g. right before the `.pt-ix-list` rule, or anywhere in the inbox structural section):
```css
/* ─── Views column (Phase 3) ─────────────────────────────────────────────── */
.pt-ix-views {
  border-right: 0.5px solid var(--pt-line);
  background: var(--pt-bg-side);
  display: flex; flex-direction: column;
  min-height: 0; overflow: hidden;
}
.pt-ix-views-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 14px 8px;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--pt-fg-4);
}
.pt-ix-views-toggle {
  width: 22px; height: 22px; border: 0; border-radius: 6px; cursor: pointer;
  background: transparent; color: var(--pt-fg-3);
  display: inline-flex; align-items: center; justify-content: center;
  transition: background-color 140ms ease, transform 180ms ease;
}
.pt-ix-views-toggle:hover { background: oklch(from var(--pt-fg) l c h / 0.06); color: var(--pt-fg); }
.pt-ix-views.is-collapsed { align-items: center; padding-top: 14px; }
.pt-ix-views.is-collapsed .pt-ix-views-toggle { transform: rotate(180deg); }
.pt-ix-views-body { display: flex; flex-direction: column; gap: 1px; padding: 0 8px; overflow-y: auto; min-height: 0; }
.pt-ix-views-sec {
  font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--pt-fg-4); padding: 12px 6px 4px;
}
.pt-ix-view {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; border: 0; background: transparent; cursor: pointer;
  padding: 6px 8px; border-radius: 6px;
  font-size: 12.5px; color: var(--pt-fg-2); text-align: left;
  transition: background-color 140ms ease, color 140ms ease;
}
.pt-ix-view:hover { background: oklch(from var(--pt-fg) l c h / 0.05); color: var(--pt-fg); }
.pt-ix-view.is-on { background: var(--pt-accent-soft); color: var(--pt-accent-fg); font-weight: 500; }
.pt-ix-view-count { font-size: 11px; color: var(--pt-fg-4); font-family: var(--pt-mono); }
.pt-ix-view.is-on .pt-ix-view-count { color: var(--pt-accent-fg); }
```

- [ ] **Step 5: Mobile — hide the views column**

In the `@media (max-width: 768px)` block (where `.pt-ix-rail-region { display: none !important; }` lives), add:
```css
  .pt-ix-views { display: none !important; }
```

- [ ] **Step 6: Verify visually**

Run: `npm run dev`, open `/inbox`.
- Five regions: nav rail · views column · thread list · conversation · right strip.
- Views column shows All / Lifecycle (New leads, Customers) / Channels (WhatsApp, Telegram, Email) with counts; clicking one filters the thread list (single-select, active highlighted).
- Status pills still in the thread list; channel pills gone.
- Collapse chevron → column shrinks to 40px (thin); reload → state persists.
- (If the dev server is blocked by the Google Fonts cert issue, note it and rely on the CSS.)

- [ ] **Step 7: Commit**

```bash
git add src/components/inbox/InboxView.tsx styles/inbox.css
git commit -m "feat(inbox): render views column + grid/styling, mobile hide"
```

---

### Task 4: Phase 3 ship checkpoint

- [ ] **Step 1: Code gates**

Run: `npx tsc --noEmit 2>&1 | grep -E "inbox"` → no errors in inbox source.
Run: `npx next lint --file src/components/inbox/InboxView.tsx --file src/components/inbox/ViewsColumn.tsx --file src/components/inbox/useViewsCollapsed.ts --file src/components/inbox/InboxProvider.tsx` → no new errors.
Run: `npm run test:run` → no NEW failures vs. baseline.

- [ ] **Step 2: Orphan grep**

```bash
grep -rn "chanFilter\|setChanFilter" src/components/inbox
```
Expected: no matches.

- [ ] **Step 3: Manual QA + finish**

Confirm the Task 3 step 6 behaviours on the deploy/preview. Then use superpowers:finishing-a-development-branch to land Phase 3, completing the five-region redesign.

---

## Self-Review

- **Spec coverage (region 2 + split):** dedicated views column ✓ (Task 2-3), single-select lens ✓ (`view` state), All + Lifecycle + Channels ✓ (ViewsColumn lists; Hot Lead dropped + assignment deferred per confirmed scope), channels moved OUT of thread-list pills ✓ (Task 1 step 6) and INTO views ✓, status stays as thread-list quick-filter ✓ (status pills untouched), collapsible + persisted ✓ (useViewsCollapsed + Task 3 grid), leftmost column ✓ (Task 3 step 1).
- **Placeholder scan:** none — every step shows literal code. Task 1 steps 1/3 say "match the exact surrounding property list" for the context object because the precise neighbouring properties must be read in-file (the file owns the canonical list); the code to add is explicit.
- **Type/name consistency:** `view`/`setView` (string) consistent across InboxProvider (context type + state + value), ThreadColumn (reads via useInbox), ViewsColumn (reads via useInbox). View ids `'all'|'lead'|'customer'|'wa'|'tg'|'em'` consistent between the filter logic (Task 1 step 5) and ViewsColumn's `LIFECYCLE`/`CHANNELS`/`countFor` (Task 2). CSS classes `pt-ix-views`, `is-views-collapsed`, `--pt-views-w` consistent between markup (Task 3 step 1) and CSS (Task 3 steps 3-4). `is-collapsed` on the aside matches ViewsColumn's collapsed render + the CSS.
- **Risk:** thread `channel` values are `'wa'|'tg'|'em'` (confirmed in InboxThread) — the channel view ids match exactly, so the filter predicate works. Counts ignore status by design (stable numbers); flag in QA if the user expects counts to reflect the active status filter instead.
