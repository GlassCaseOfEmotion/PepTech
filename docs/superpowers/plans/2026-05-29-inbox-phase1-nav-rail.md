# Inbox Redesign Phase 1 — Collapsible Thin Nav Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow the global app sidebar into a thin icon rail that defaults to collapsed (~56px, icon-only + tooltips) and can be pinned open (~232px, with labels), with the choice persisted — the first of three phases toward the respond.io-style inbox.

**Architecture:** The sidebar (`Sidebar.tsx`) already renders icon + label nav items inside `.pt-root`'s fixed first grid column. We add a collapsed state driven by a `pt-nav-collapsed` class on `.pt-root` (mirroring the existing `useTheme` pattern that toggles classes on `.pt-root`). CSS makes the column width and label visibility react to that class. A small `useNavCollapsed` hook owns the boolean + `localStorage` persistence. No data or routing changes.

**Tech Stack:** Next.js 15 App Router, React client components, plain CSS (`styles/peptech.css`, `pt-*` classes), Vitest + jsdom for the hook test.

**Spec:** [docs/superpowers/specs/2026-05-29-inbox-redesign-design.md](../specs/2026-05-29-inbox-redesign-design.md) (region 1).

---

## File Structure

- **Create** `src/components/shell/useNavCollapsed.ts` — the persistence hook (one responsibility: read/write the collapsed boolean + toggle, applying the class to `.pt-root`).
- **Create** `src/components/shell/__tests__/useNavCollapsed.test.ts` — unit test for the hook's persistence + default.
- **Modify** `src/components/shell/Sidebar.tsx` — consume the hook, render a collapse/expand toggle, add `title` tooltips to nav items for the collapsed state.
- **Modify** `styles/peptech.css` — collapsed-state rules (`.pt-root.pt-nav-collapsed`): column width, hide labels, center icons, restyle brand/compose/search/pinned/profile when collapsed.

Scope note: this phase touches the **global shell** only — every page (dashboard, orders, catalog, etc.) inherits the rail. The inbox-specific `.pt-root.is-inbox` override in `styles/inbox.css` must be updated to keep its first column in sync (Task 4).

---

### Task 1: `useNavCollapsed` persistence hook

**Files:**
- Create: `src/components/shell/useNavCollapsed.ts`
- Test: `src/components/shell/__tests__/useNavCollapsed.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/shell/__tests__/useNavCollapsed.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNavCollapsed } from '../useNavCollapsed'

describe('useNavCollapsed', () => {
  beforeEach(() => {
    localStorage.clear()
    // jsdom has no .pt-root by default — add one so applyClass has a target
    document.body.innerHTML = '<div class="pt-root"></div>'
  })

  it('defaults to collapsed when nothing stored', () => {
    const { result } = renderHook(() => useNavCollapsed())
    expect(result.current.collapsed).toBe(true)
    expect(document.querySelector('.pt-root')!.classList.contains('pt-nav-collapsed')).toBe(true)
  })

  it('restores expanded state from localStorage', () => {
    localStorage.setItem('pt-nav-collapsed', '0')
    const { result } = renderHook(() => useNavCollapsed())
    expect(result.current.collapsed).toBe(false)
    expect(document.querySelector('.pt-root')!.classList.contains('pt-nav-collapsed')).toBe(false)
  })

  it('toggle flips state, persists, and updates the root class', () => {
    const { result } = renderHook(() => useNavCollapsed())
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(false)
    expect(localStorage.getItem('pt-nav-collapsed')).toBe('0')
    expect(document.querySelector('.pt-root')!.classList.contains('pt-nav-collapsed')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/components/shell/__tests__/useNavCollapsed.test.ts`
Expected: FAIL — `Cannot find module '../useNavCollapsed'`.

- [ ] **Step 3: Write the hook**

```ts
// src/components/shell/useNavCollapsed.ts
'use client'

import { useEffect, useState } from 'react'

const KEY = 'pt-nav-collapsed'

function applyClass(collapsed: boolean) {
  const root = document.querySelector('.pt-root')
  if (!root) return
  root.classList.toggle('pt-nav-collapsed', collapsed)
}

/** Collapsed boolean for the global nav rail. Defaults to collapsed (thin
 * icon rail); persists the user's choice in localStorage and mirrors it onto
 * the .pt-root element so CSS can react. Mirrors the useTheme pattern in
 * Sidebar.tsx. */
export function useNavCollapsed() {
  // Default true (collapsed). The first effect reconciles with localStorage.
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(KEY)
    const next = stored === '0' ? false : true
    setCollapsed(next)
    applyClass(next)
  }, [])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(KEY, next ? '1' : '0')
      applyClass(next)
      return next
    })
  }

  return { collapsed, toggle }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/components/shell/__tests__/useNavCollapsed.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/useNavCollapsed.ts src/components/shell/__tests__/useNavCollapsed.test.ts
git commit -m "feat(shell): useNavCollapsed hook for the collapsible nav rail"
```

---

### Task 2: Wire the hook + collapse toggle into the Sidebar

**Files:**
- Modify: `src/components/shell/Sidebar.tsx`

- [ ] **Step 1: Import the hook**

In `src/components/shell/Sidebar.tsx`, add after the existing import block (after line 8, `import { dbConversationToThread ... }`):

```ts
import { useNavCollapsed } from './useNavCollapsed'
```

- [ ] **Step 2: Consume the hook inside the component**

In the `Sidebar` function, directly after `const { theme, cycle } = useTheme()` (line 85), add:

```ts
  const { collapsed, toggle } = useNavCollapsed()
```

- [ ] **Step 3: Add the collapse toggle control to the brand row**

Replace the existing `.pt-brand-menu` button (lines 192) with a collapse toggle. The brand row becomes:

```tsx
      <div className="pt-brand">
        <div className="pt-brand-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path d="M3 10.5 7 5.5h6l4 5-4 5H7l-4-5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <circle cx="10" cy="10.5" r="2" fill="currentColor"/>
          </svg>
        </div>
        <div className="pt-brand-name">Peptech<span>.</span></div>
        <button
          className="pt-nav-collapse-btn"
          title={collapsed ? 'Pin sidebar open' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Pin sidebar open' : 'Collapse sidebar'}
          aria-pressed={!collapsed}
          onClick={toggle}
        >
          <Icons.arrowL size={13} />
        </button>
      </div>
```

(The chevron visually rotates via CSS in Task 3 to point the right way in each state.)

- [ ] **Step 4: Add tooltips to nav items for the collapsed state**

Collapsed items show only icons, so each needs a native tooltip. In the `NAV_PRIMARY` map (line 213) add `title={n.label}` to the `Link`, and likewise in the `NAV_SECONDARY` map (line 246):

```tsx
            <Link key={n.href} href={n.href} title={n.label} className={`pt-nav-item ${on ? 'is-on' : ''}`} {...(n.href === '/inbox' ? { 'data-tour': 'inbox-link' } : {})}>
```

```tsx
            <Link key={n.href} href={n.href} title={n.label} className={`pt-nav-item ${on ? 'is-on' : ''}`}>
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep Sidebar`
Expected: no output (no Sidebar type errors).

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/Sidebar.tsx
git commit -m "feat(shell): nav-rail collapse toggle + collapsed-state tooltips"
```

---

### Task 3: Collapsed-state CSS

**Files:**
- Modify: `styles/peptech.css`

- [ ] **Step 1: Drive the root column width from the collapse class**

In `styles/peptech.css`, replace the `.pt-root` width rules (lines 129-137) so the first column is a variable:

```css
.pt-root {
  display: grid;
  --pt-nav-w: 232px;
  grid-template-columns: var(--pt-nav-w) 1fr 320px;
  height: 100%;
  background: var(--pt-bg);
  color: var(--pt-fg);
}
.pt-root.pt-nav-collapsed { --pt-nav-w: 56px; }
.pt-root.no-right { grid-template-columns: var(--pt-nav-w) 1fr; }
.pt-d-compact .pt-root { grid-template-columns: var(--pt-nav-w) 1fr 296px; }
.pt-d-compact .pt-root.no-right { grid-template-columns: var(--pt-nav-w) 1fr; }
```

- [ ] **Step 2: Append collapsed-state rules**

After the existing `.pt-me-more:hover` rule (line 283), append a new block:

```css
/* ─── Collapsed nav rail (Phase 1) ───────────────────────────────────────── */
.pt-nav-collapse-btn {
  margin-left: auto;
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border: 0; border-radius: 6px;
  background: transparent; color: var(--pt-fg-3); cursor: pointer;
  transition: transform 180ms ease, background-color 160ms ease;
}
.pt-nav-collapse-btn:hover { background: oklch(from var(--pt-fg) l c h / 0.06); color: var(--pt-fg); }
.pt-root.pt-nav-collapsed .pt-nav-collapse-btn { transform: rotate(180deg); }

/* When collapsed: hide labels + text, center the icons, keep the rail tidy */
.pt-root.pt-nav-collapsed .pt-sidebar { padding: 10px 6px; }
.pt-root.pt-nav-collapsed .pt-brand-name,
.pt-root.pt-nav-collapsed .pt-nav-label,
.pt-root.pt-nav-collapsed .pt-compose span,
.pt-root.pt-nav-collapsed .pt-compose kbd,
.pt-root.pt-nav-collapsed .pt-search span,
.pt-root.pt-nav-collapsed .pt-search kbd,
.pt-root.pt-nav-collapsed .pt-nav-section,
.pt-root.pt-nav-collapsed .pt-me-info,
.pt-root.pt-nav-collapsed .pt-me-more {
  display: none;
}
.pt-root.pt-nav-collapsed .pt-nav-item,
.pt-root.pt-nav-collapsed .pt-compose,
.pt-root.pt-nav-collapsed .pt-search {
  justify-content: center;
  padding-left: 0; padding-right: 0;
}
.pt-root.pt-nav-collapsed .pt-me { justify-content: center; }
/* The collapse button stays visible + centered when collapsed (it's the only
   way back). Brand mark stays; brand name hides. */
.pt-root.pt-nav-collapsed .pt-brand { justify-content: center; gap: 0; }
.pt-root.pt-nav-collapsed .pt-nav-collapse-btn { margin-left: 0; }
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`, open any page (e.g. `/` dashboard). Default state: rail is thin (56px), icons centered, no labels, brand mark only. Hover a nav icon → native tooltip shows the label. Click the collapse button (chevron) → rail expands to 232px with labels; chevron flips. Reload → state persists.

- [ ] **Step 4: Commit**

```bash
git add styles/peptech.css
git commit -m "feat(shell): collapsed nav-rail styling + width variable"
```

---

### Task 4: Keep the inbox + pinned/foot consistent when collapsed

**Files:**
- Modify: `styles/inbox.css`
- Modify: `styles/peptech.css`

- [ ] **Step 1: Sync the inbox root override to the width variable**

`styles/inbox.css` has `.pt-root.is-inbox { grid-template-columns: 232px 1fr; }`. Replace the hard-coded `232px` with the variable so the inbox rail collapses too:

```css
.pt-root.is-inbox { grid-template-columns: var(--pt-nav-w) 1fr; }
```

- [ ] **Step 2: Collapse the pinned-threads list cleanly**

Pinned thread rows (`.pt-pin`) show a channel icon + name + snippet + unread. When collapsed, show only the channel icon (centered) with the name as a tooltip. In `styles/peptech.css`, inside the collapsed block from Task 3, append:

```css
.pt-root.pt-nav-collapsed .pt-pin-body { display: none; }
.pt-root.pt-nav-collapsed .pt-pin { justify-content: center; padding-left: 0; padding-right: 0; }
.pt-root.pt-nav-collapsed .pt-pin-unread {
  position: absolute; top: 2px; right: 6px;
}
.pt-root.pt-nav-collapsed .pt-pin { position: relative; }
```

- [ ] **Step 3: Add the pinned-name tooltip in the markup**

In `src/components/shell/Sidebar.tsx`, the pinned `Link` (line 228) gets a `title`:

```tsx
                <Link key={p.id} href={`/inbox?conversation=${p.id}`} title={p.name} className="pt-pin">
```

- [ ] **Step 4: Verify across pages**

Run: `npm run dev`. With the rail collapsed, check `/` (dashboard), `/orders`, `/catalog`, and `/inbox`:
- Rail is 56px everywhere; main content shifts left to fill the reclaimed space.
- Pinned threads (if any) show just the channel icon, centered, with unread dot top-right; hovering shows the name.
- Expand the rail; confirm pinned rows return to full name + snippet.
- `/inbox` still lays out correctly (its internal 3-column grid is unaffected — that's Phase 2/3).

- [ ] **Step 5: Commit**

```bash
git add styles/inbox.css styles/peptech.css src/components/shell/Sidebar.tsx
git commit -m "feat(shell): collapsed pinned-threads + inbox rail width sync"
```

---

### Task 5: Phase 1 ship checkpoint

- [ ] **Step 1: Full test + build gate**

Run: `npm run test:run` — expect no NEW failures vs. baseline (the pre-existing `@testing-library/dom` / schema-integration failures are unrelated; the new `useNavCollapsed` test passes).
Run: `npm run build` — expect lint + type check to pass (no `Deno`/excluded-dir issues; this phase touches only shell + CSS).

- [ ] **Step 2: Manual regression sweep**

`npm run dev` and confirm:
- Default load = collapsed rail (first impression is the thin rail).
- Toggle persists across reload and across route changes.
- Mobile (≤768px): the sidebar is already `display: none` (peptech.css line ~1277) and `BottomNav` takes over — confirm the collapse class doesn't affect mobile.
- Theme toggle still works (it lives in the foot, hidden when collapsed — confirm it's reachable when expanded).

- [ ] **Step 3: Finish the branch**

Use superpowers:finishing-a-development-branch to merge/PR Phase 1 independently. It is a complete, shippable improvement on its own.

---

## Subsequent Phases (roadmap — planned separately)

Per the spec, the redesign ships in three independent phases. **Phases 2 and 3 will each get their own full plan when Phase 1 lands** — they depend on Phase 1's final shell behaviour and require fresh reads of the large `InboxView.tsx` (~1000 lines) to write placeholder-free code.

- **Phase 2 — Inbox right rail.** Convert the always-on 320px `ConversationRail` into a ~48px icon strip (Contact · AI · Notes · Activity · Create Order) that push-opens one panel column at a time; default closed. Re-home existing components (`InboxAIPanel`, `OrderRail`, customer card, notes, activity) behind the strip. Touches `InboxView.tsx` + `styles/inbox.css`.
- **Phase 3 — Views column.** Add the collapsible single-select views column (Assignment / Lifecycle / Channels), move channel filters out of the thread-list pills into it, keep status as a thread-list quick-filter. New `ViewsColumn` component + filter wiring in `InboxView.tsx` + `styles/inbox.css`.

## Self-Review

- **Spec coverage (region 1):** thin rail ✓ (Task 3), icon-only + tooltip ✓ (Task 2 step 4), pin-to-expand + persistence ✓ (Tasks 1-2), nav items unchanged ✓, pinned shortcuts handled ✓ (Task 4), app-wide ✓ (Task 4 cross-page check). Regions 2-5 are explicitly out of Phase 1 (roadmap).
- **Placeholder scan:** none — every code/CSS step shows the literal content.
- **Type/name consistency:** `useNavCollapsed` → `{ collapsed, toggle }` used identically in hook (Task 1), Sidebar (Task 2), and tests (Task 1). Class `pt-nav-collapsed` and var `--pt-nav-w` consistent across Tasks 1, 3, 4.
- **Default state:** hook defaults `collapsed = true`; SSR renders the sidebar without the class and the first client effect adds it — a brief expanded flash is possible on first paint. Acceptable for Phase 1; if it bothers in QA, set the class server-side in `Shell.tsx` from a cookie in a Phase 1.1 follow-up.
