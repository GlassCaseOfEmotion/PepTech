# Inbox Redesign Phase 2 — Thin Right Rail with Push Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inbox's always-on 320px customer rail with a ~48px vertical icon strip (Contact · AI · Notes · Activity · Create Order) that push-opens one panel column at a time and defaults closed, so the conversation starts wide.

**Architecture:** Today `InboxLayout` renders either `ConversationRail` (always-on customer/AI/notes/activity) or `OrderRail`, switched by a `showOrderRail` boolean, as the 3rd grid column of `.pt-inbox` (`320px 1fr 320px`). We replace that with a right region (`.pt-ix-rail-region`) containing a persistent `RailStrip` (icons) plus a `RailPanelHost` that renders one panel when open. State becomes `activePanel: RailPanel | null` (default null). The grid's 3rd column animates between 48px (closed) and 368px (open) using the existing `transition: grid-template-columns`.

**Tech Stack:** Next.js 15 App Router, React client components, plain CSS (`styles/inbox.css`, `pt-*`). UI/layout work — verified by running the app; no new unit tests (the only logic is a toggle, matching the project's untested-shell precedent).

**Spec:** [docs/superpowers/specs/2026-05-29-inbox-redesign-design.md](../specs/2026-05-29-inbox-redesign-design.md) (region 5). Phase 1 (nav rail) already shipped.

---

## File Structure

- **Create** `src/components/inbox/RailStrip.tsx` — the ~48px icon column. One job: show the 5 panel icons, mark the active one, call `onSelect` (toggle).
- **Create** `src/components/inbox/RailPanelHost.tsx` — renders the open panel's content. Owns the notes form state + activity fetch (moved out of `ConversationRail`); delegates AI to `InboxAIPanel` and Order to `OrderRail`.
- **Modify** `src/components/inbox/InboxView.tsx` — replace `showOrderRail` with `activePanel`; render `.pt-ix-rail-region` (host + strip); delete the old `ConversationRail` function.
- **Modify** `styles/inbox.css` — grid columns (closed/open), strip + region + panel styling, remove the obsolete `html.pt-ai-expanded` rules, hide the region on mobile.

Shared, unchanged: `InboxAIPanel`, `OrderRail`, `ConversationPane`, the mobile bottom-sheet (`.pt-ix-mobile-sheet`, lives in `ConversationPane` — untouched).

---

### Task 1: `RailStrip` icon column

**Files:**
- Create: `src/components/inbox/RailStrip.tsx`

- [ ] **Step 1: Define the shared panel type + write the component**

```tsx
// src/components/inbox/RailStrip.tsx
'use client'

import { Icons } from '@/lib/icons'

export type RailPanel = 'contact' | 'ai' | 'notes' | 'activity' | 'order'

const ITEMS: { panel: RailPanel; label: string; icon: React.FC<{ size?: number }> }[] = [
  { panel: 'contact',  label: 'Contact',      icon: Icons.user },
  { panel: 'ai',       label: 'AI assistant', icon: Icons.spark },
  { panel: 'notes',    label: 'Notes',        icon: Icons.pencil },
  { panel: 'activity', label: 'Activity',     icon: Icons.clock },
  { panel: 'order',    label: 'Create order', icon: Icons.box },
]

export function RailStrip({ active, onSelect }: {
  active: RailPanel | null
  onSelect: (p: RailPanel) => void
}) {
  return (
    <div className="pt-ix-strip" role="tablist" aria-orientation="vertical">
      {ITEMS.map(({ panel, label, icon: Icon }) => (
        <button
          key={panel}
          type="button"
          role="tab"
          aria-selected={active === panel}
          aria-label={label}
          title={label}
          className={`pt-ix-strip-btn ${active === panel ? 'is-on' : ''}`}
          onClick={() => onSelect(panel)}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep RailStrip`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/RailStrip.tsx
git commit -m "feat(inbox): RailStrip icon column for the thin right rail"
```

---

### Task 2: `RailPanelHost` panel content

**Files:**
- Create: `src/components/inbox/RailPanelHost.tsx`

This moves the customer-card, notes, and activity markup verbatim out of the current `ConversationRail` (InboxView.tsx lines 930-1040) and adds a panel header with a close button. It reuses the same context (`useInbox`), helpers (`initials`, `formatAmount`, `fmtRelative`, `actBullet`, `actDetail`, `CH_NAMES`, `ActivityItem`) — these are currently module-level in InboxView.tsx, so export them (Task 3 step 1) and import here.

- [ ] **Step 1: Write the component**

```tsx
// src/components/inbox/RailPanelHost.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { formatAmount } from '@/lib/currency'
import { initials, type InboxThread } from '@/types/inbox'
import { useInbox } from './InboxProvider'
import { InboxAIPanel } from './InboxAIPanel'
import { OrderRail } from './OrderRail'
import type { RailPanel } from './RailStrip'
import { CH_NAMES, fmtRelative, actBullet, actDetail, type ActivityItem } from './inbox-shared'

const TITLES: Record<RailPanel, string> = {
  contact: 'Contact', ai: 'AI assistant', notes: 'Notes', activity: 'Activity', order: 'Create order',
}

export function RailPanelHost({ panel, thread, baseCurrency, onClose }: {
  panel: RailPanel
  thread: InboxThread
  baseCurrency: string
  onClose: () => void
}) {
  const { notes, addNote } = useInbox()
  const [addingNote, setAddingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const trustCls = thread.trust >= 85 ? 'hi' : thread.trust >= 65 ? 'md' : 'lo'
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (panel !== 'activity' || !thread.customerId) return
    supabase
      .from('customer_activity')
      .select('id, source, label, ref_number, amount, note, created_at')
      .eq('customer_id', thread.customerId)
      .order('created_at', { ascending: false })
      .limit(15)
      .then(({ data }) => { if (data) setActivity(data as ActivityItem[]) })
  }, [supabase, thread.customerId, panel])

  const submitNote = async () => {
    if (!noteText.trim()) return
    await addNote(noteText)
    setNoteText('')
    setAddingNote(false)
  }

  // Order panel is self-contained (its own header + close).
  if (panel === 'order') {
    return (
      <OrderRail
        customerId={thread.customerId}
        customerName={thread.name}
        conversationId={thread.id}
        onClose={onClose}
      />
    )
  }

  return (
    <aside className="pt-ix-rail">
      <div className="pt-ix-panel-hd">
        <span>{TITLES[panel]}</span>
        <button className="pt-ix-panel-close" aria-label="Close panel" onClick={onClose}>
          <Icons.x size={13} />
        </button>
      </div>

      {panel === 'contact' && (
        <div className="pt-cust">
          <Link href={`/contacts/${thread.customerId}`} className="pt-cust-hd" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="pt-cust-av" data-channel={thread.channel}>{initials(thread.name)}</div>
            <div className="pt-cust-id">
              <div className="pt-cust-name">{thread.name}</div>
              <div className="pt-cust-handle mono">{thread.handle}</div>
            </div>
            <div className={`pt-trust pt-trust-${trustCls}`}>
              <div className="pt-trust-num">{thread.trust}</div>
              <div className="pt-trust-lbl">trust</div>
            </div>
          </Link>
          <div className="pt-cust-stats">
            <div><div className="lbl">LTV</div><div className="val mono">{formatAmount(thread.ltv, baseCurrency)}</div></div>
            <div><div className="lbl">Channel</div><div className="val">{CH_NAMES[thread.channel]}</div></div>
          </div>
          <div className="pt-cust-tags">
            {thread.tags.map(tag => <span key={tag} className="pt-tag pt-tag-soft">{tag}</span>)}
          </div>
        </div>
      )}

      {panel === 'ai' && thread.id && thread.customerId && (
        <InboxAIPanel conversationId={thread.id} customerId={thread.customerId} customerName={thread.name} />
      )}

      {panel === 'notes' && (
        <div className="pt-right-section">
          <div className="pt-right-hd">
            <span>Notes</span>
            <button className="pt-right-add" onClick={() => { setAddingNote(v => !v); setNoteText('') }}>
              <Icons.plus size={11} />
            </button>
          </div>
          {addingNote && (
            <div className="pt-note-form">
              <textarea className="pt-note-input" placeholder="Add an internal note…" value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} autoFocus />
              <div className="pt-note-actions">
                <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => { setAddingNote(false); setNoteText('') }}>Cancel</button>
                <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={submitNote} disabled={!noteText.trim()}>Save</button>
              </div>
            </div>
          )}
          {notes.map(note => (
            <div key={note.id} className="pt-rail-note">
              <div className="pt-rail-note-meta">{fmtRelative(note.created_at)}</div>
              <div>{note.content}</div>
            </div>
          ))}
        </div>
      )}

      {panel === 'activity' && (
        <div className="pt-right-section">
          {activity.length === 0
            ? <div className="pt-right-hd"><span>No activity yet</span></div>
            : (
              <ul className="pt-rail-activity">
                {activity.map(item => (
                  <li key={item.id}>
                    <i className={`pt-act-dot ${actBullet(item)}`} />
                    <div>
                      <b>{item.label}</b>{actDetail(item, baseCurrency)}
                      <div className="pt-act-time">{fmtRelative(item.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </aside>
  )
}
```

- [ ] **Step 2: Verify it compiles after Task 3 step 1 exports the shared helpers**

(`pt-ix-panel-hd`/`pt-ix-panel-close` styling lands in Task 4 — unstyled is fine here.) Defer the tsc check to Task 3, since this imports `./inbox-shared` which Task 3 creates.

- [ ] **Step 3: Commit (after Task 3 step 1)**

```bash
git add src/components/inbox/RailPanelHost.tsx
git commit -m "feat(inbox): RailPanelHost renders one right-rail panel at a time"
```

---

### Task 3: Extract shared helpers + rewire `InboxLayout`

**Files:**
- Create: `src/components/inbox/inbox-shared.ts`
- Modify: `src/components/inbox/InboxView.tsx`

`RailPanelHost` needs helpers currently private to InboxView.tsx (`CH_NAMES`, `fmtRelative`, `actBullet`, `actDetail`, `ActivityItem`). Extract them to a shared module so both files import from one place (DRY).

- [ ] **Step 1: Create the shared module**

Read InboxView.tsx and move the literal definitions of `ActivityItem` (interface, ~line 23), `CH_NAMES`, `fmtRelative`, `actBullet`, `actDetail` into:

```ts
// src/components/inbox/inbox-shared.ts
// (paste the EXACT current definitions from InboxView.tsx — interface ActivityItem,
//  const CH_NAMES, function fmtRelative, function actBullet, function actDetail)
```

Then in InboxView.tsx, delete those local definitions and add an import:

```ts
import { CH_NAMES, fmtRelative, actBullet, actDetail, type ActivityItem } from './inbox-shared'
```

(If any of these helpers reference other locals, move those too, or keep them and import — choose the minimal cut that compiles. Report what you moved.)

- [ ] **Step 2: Delete the old `ConversationRail` function**

Remove the entire `function ConversationRail(...) { ... }` (InboxView.tsx lines ~930-1040) — its content now lives in `RailPanelHost`.

- [ ] **Step 3: Rewire `InboxLayout`**

In `InboxLayout` (InboxView.tsx ~line 1044):

Add imports at the top of the file:
```ts
import { RailStrip, type RailPanel } from './RailStrip'
import { RailPanelHost } from './RailPanelHost'
```

Replace the state line:
```ts
  const [showOrderRail, setShowOrderRail] = useState(false)
```
with:
```ts
  const [activePanel, setActivePanel] = useState<RailPanel | null>(null)
```

Replace the reset effect:
```ts
  useEffect(() => { setShowOrderRail(false) }, [activeId])
```
with:
```ts
  useEffect(() => { setActivePanel(null) }, [activeId])
```

Update the conversation's create-order callback (currently `onCreateOrder={() => setShowOrderRail(true)}`):
```ts
          onCreateOrder={() => setActivePanel('order')}
```

Replace the two rail render lines (the `!showOrderRail` ConversationRail + the `showOrderRail` OrderRail block) with the new region:
```tsx
      {activeThread && (
        <div className={`pt-ix-rail-region${activePanel ? ' is-open' : ''}`}>
          {activePanel && (
            <RailPanelHost
              panel={activePanel}
              thread={activeThread}
              baseCurrency={baseCurrency}
              onClose={() => setActivePanel(null)}
            />
          )}
          <RailStrip active={activePanel} onSelect={(p) => setActivePanel(cur => cur === p ? null : p)} />
        </div>
      )}
```

Also add `is-panel-open` to the `.pt-inbox` wrapper so CSS can widen the column:
```tsx
    <div className={`pt-inbox${selectedConvId ? ' has-conversation' : ''}${activePanel ? ' is-panel-open' : ''}`}>
```

- [ ] **Step 4: Verify the whole inbox compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "(InboxView|RailPanelHost|RailStrip|inbox-shared)"`
Expected: no output. (Confirms Task 2's RailPanelHost now resolves its `./inbox-shared` import too.)

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/inbox-shared.ts src/components/inbox/InboxView.tsx src/components/inbox/RailPanelHost.tsx
git commit -m "feat(inbox): rewire right rail to strip + push panel, drop ConversationRail"
```

---

### Task 4: Right-rail CSS

**Files:**
- Modify: `styles/inbox.css`

- [ ] **Step 1: New grid columns (closed default + open)**

Replace the grid rules at the top of `styles/inbox.css` (lines 6-18). Current:
```css
.pt-inbox {
  display: grid;
  grid-template-columns: 320px 1fr 320px;
  height: calc(100vh - 48px);
  overflow: hidden;
  transition: grid-template-columns 0.22s ease;
}
.pt-d-compact .pt-inbox { grid-template-columns: 296px 1fr 296px; }
html.pt-ai-expanded .pt-inbox { grid-template-columns: 320px 1fr 420px; }
html.pt-ai-expanded .pt-ix-rail .pt-right-section { display: none; }
html.pt-ai-expanded .pt-inbox-ai-card { max-height: calc(100vh - 270px); }
html.pt-ai-expanded .pt-inbox-ai-msgs { flex: 1; max-height: none; }
```
Replace the entire block above with:
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
(The `html.pt-ai-expanded` rules are deleted — AI is now an ordinary panel; the expand-to-420 special case is gone.)

- [ ] **Step 2: Strip + region + panel styling**

The `.pt-ix-rail` rule (line ~336) currently styles the always-on rail. Keep it (the panel host reuses it) but it must size to the panel, not the whole column. Replace the `.pt-ix-rail` rule with the region/strip/panel set:
```css
/* Right region = optional panel + persistent icon strip */
.pt-ix-rail-region {
  display: flex;
  min-height: 0; min-width: 0;
  border-left: 0.5px solid var(--pt-line);
}
.pt-ix-strip {
  flex: 0 0 48px;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 0;
  background: var(--pt-bg-side);
  border-left: 0.5px solid var(--pt-line);
}
.pt-ix-rail-region.is-open .pt-ix-strip { border-left: 0; }
.pt-ix-strip-btn {
  width: 34px; height: 34px; border: 0; border-radius: 8px;
  background: transparent; color: var(--pt-fg-3); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background-color 140ms ease, color 140ms ease;
}
.pt-ix-strip-btn:hover { background: oklch(from var(--pt-fg) l c h / 0.06); color: var(--pt-fg); }
.pt-ix-strip-btn.is-on { background: var(--pt-accent-soft); color: var(--pt-accent-fg); }

/* The open panel fills the rest of the region (the .pt-ix-rail aside / OrderRail) */
.pt-ix-rail-region > .pt-ix-rail,
.pt-ix-rail-region > .pt-ix-order-rail { flex: 1 1 auto; min-width: 0; }

.pt-ix-rail {
  background: var(--pt-bg-side);
  overflow-y: auto; overflow-x: hidden;
  padding: 0 14px 24px;
  display: flex; flex-direction: column; gap: 16px;
  min-height: 0; min-width: 0;
}
.pt-ix-panel-hd {
  position: sticky; top: 0; z-index: 1;
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0 10px; margin-bottom: -2px;
  background: var(--pt-bg-side);
  font-size: 13px; font-weight: 600;
}
.pt-ix-panel-close {
  width: 24px; height: 24px; border: 0; border-radius: 6px; cursor: pointer;
  background: transparent; color: var(--pt-fg-3);
  display: inline-flex; align-items: center; justify-content: center;
}
.pt-ix-panel-close:hover { background: oklch(from var(--pt-fg) l c h / 0.06); color: var(--pt-fg); }
```
(Note: the old `.pt-ix-rail` had `border-left` + top padding; the border now lives on the region/strip and the sticky panel header replaces the top padding.)

- [ ] **Step 3: Mobile — hide the region (bottom sheet still handles details)**

In the `@media (max-width: 768px)` block, the rule `.pt-ix-rail { display: none !important; }` (line ~661) won't catch the new region. Add alongside it:
```css
  .pt-ix-rail-region { display: none !important; }
```
(The mobile customer bottom-sheet in `ConversationPane` is unchanged and continues to show details on small screens.)

- [ ] **Step 4: Verify visually**

Run: `npm run dev`, open `/inbox`, select a conversation.
- Default: thin 48px strip on the right, 5 icons, conversation wide.
- Click Contact → panel pushes in (column animates to 368px), customer card shows; conversation reflows narrower.
- Click the same icon again, or the ✕ → panel closes, conversation back to full width.
- Click through AI / Notes / Activity / Create Order → each opens its panel; only one at a time; active icon highlighted.
- Switch conversations → panel closes (resets to strip).
- (If the dev server is blocked by the Google Fonts cert issue in your env, note it and rely on reading the CSS.)

- [ ] **Step 5: Commit**

```bash
git add styles/inbox.css
git commit -m "feat(inbox): thin right-rail strip + push-panel CSS, drop ai-expanded"
```

---

### Task 5: Phase 2 ship checkpoint

- [ ] **Step 1: Code gates**

Run: `npx tsc --noEmit 2>&1 | grep -E "inbox"` → expect no errors in inbox files.
Run: `npx next lint --file src/components/inbox/InboxView.tsx --file src/components/inbox/RailStrip.tsx --file src/components/inbox/RailPanelHost.tsx` → no new errors (pre-existing warnings OK).
Run: `npm run test:run` → no NEW failures vs. baseline (same pre-existing `@testing-library/dom` / schema-integration failures).

- [ ] **Step 2: Grep for orphans**

Confirm `showOrderRail`, `ConversationRail`, and `pt-ai-expanded` no longer appear in `src/components/inbox/` or `styles/inbox.css`:
```bash
grep -rn "showOrderRail\|ConversationRail\|pt-ai-expanded" src/components/inbox styles/inbox.css
```
Expected: no matches (clean removal). If `InboxAIPanel` set `pt-ai-expanded` on the html element internally, remove that too — search `src/components/inbox/InboxAIPanel.tsx` for `pt-ai-expanded` and delete any add/remove of that class (the expand affordance is obsolete now that AI is a fixed-width panel). Report what you found.

- [ ] **Step 3: Manual QA + finish**

Confirm the Task 4 step 4 behaviours in the deployed/preview build. Then use superpowers:finishing-a-development-branch to land Phase 2.

---

## Self-Review

- **Spec coverage (region 5):** thin 48px strip ✓ (Task 1, 4), icon set Contact/AI/Notes/Activity/Order ✓ (Task 1), push column reflow ✓ (Task 4 grid 48↔368 with transition), one panel at a time ✓ (single `activePanel` state, Task 3), default closed ✓ (`useState<RailPanel|null>(null)`), existing components re-homed ✓ (Task 2 reuses customer card/InboxAIPanel/notes/activity/OrderRail), mobile bottom-sheet preserved ✓ (Task 4 step 3).
- **Placeholder scan:** one intentional deferral — Task 3 step 1 says "paste the EXACT current definitions" for the shared helpers rather than reproducing them here, because they must be moved verbatim from InboxView.tsx (reproducing risks drift). The implementer reads + moves them; not a vague instruction.
- **Type/name consistency:** `RailPanel` defined in RailStrip.tsx, imported by RailPanelHost + InboxView. `activePanel`/`setActivePanel` consistent across Task 3. CSS classes `pt-ix-rail-region`, `pt-ix-strip`, `pt-ix-strip-btn`, `pt-ix-panel-hd`, `is-panel-open`, `is-open` consistent between Task 3 (markup) and Task 4 (CSS).
- **Risk:** AI panel renders at 320px (was 420 when "expanded"). Acceptable — it rendered at 320 before the expand feature existed; flag in QA if cramped, bump panel width in a follow-up.
