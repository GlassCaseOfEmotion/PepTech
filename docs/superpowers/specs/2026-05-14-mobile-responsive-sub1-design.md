# Peptech Mobile Responsive — Sub-project 1: Shell + Core Views

**Date:** 2026-05-14  
**Scope:** Shell/navigation + Inbox + Dashboard + Customer detail  
**Out of scope:** Orders, Catalog, Customers list, Settings, Vault, Broadcasts, Automations, PWA layer (separate sub-projects)

---

## Context

Peptech currently has no media queries — all layouts use fixed pixel widths designed for desktop. The mobile breakpoint strategy agreed: responsive CSS first, PWA (manifest + push notifications) layered on top once layouts are solid.

This spec covers sub-project 1: the shell/navigation foundation and the three views that matter most for the core mobile use case ("checking messages and customer context on the go").

---

## Breakpoint Strategy

Single breakpoint: **`max-width: 768px`** = mobile. No tablet intermediate breakpoint in this sub-project.

All responsive rules go inside `@media (max-width: 768px) { }` blocks added to the existing CSS files (`peptech.css`, `inbox.css`, etc.). No new CSS files created.

---

## 1. Shell & Navigation

### Desktop (unchanged)
Left sidebar (`232px`) with vertical nav list. Top bar across `pt-main`.

### Mobile (`≤768px`)

**Sidebar hidden.** Replaced by a **bottom tab bar** rendered as a new `BottomNav` client component.

**Bottom tab bar — 5 tabs:**
| Tab | Icon | Route |
|-----|------|-------|
| Dashboard | spark | `/` |
| Inbox | inbox (with unread badge) | `/inbox` |
| Customers | users | `/customers` |
| Orders | box | `/orders` |
| More | `···` | Opens a slide-up sheet with: Catalog, Broadcasts, Automations, Vault, Settings |

**Height:** 56px. Fixed to bottom of viewport. `z-index: 300`. Safe-area padding for iOS home indicator: `padding-bottom: env(safe-area-inset-bottom)`.

**Unread badge:** Inbox tab shows a badge dot when there are unread threads (sourced from the same `pinnedThreads` / `threads` state already in the app).

**"More" sheet:** Simple slide-up modal listing remaining nav items as large tap targets. Tap any item navigates and closes the sheet.

**Top bar (`pt-top`) on mobile:**
- Hide: connected channel chips (`.pt-top-mid`), right-rail toggle button
- Keep: breadcrumb section title, notification bell, AI assistant button
- Height stays `48px`

**`pt-root` grid on mobile:**
```css
@media (max-width: 768px) {
  .pt-root {
    grid-template-columns: 1fr;
    grid-template-rows: 48px 1fr 56px;
  }
  .pt-sidebar { display: none; }
  .pt-right { display: none; }  /* right rail hidden on all mobile views */
}
```

**New component:** `src/components/shell/BottomNav.tsx`  
- Client component, mirrors `Sidebar`'s nav items and active-route logic
- Added to `Shell.tsx` and `DashboardLayout.tsx` (rendered only on mobile via CSS `display:none` on desktop)

---

## 2. Inbox

### Desktop (unchanged)
Three-panel grid: thread list (`320px`) | conversation (`1fr`) | right rail (`320px`).

### Mobile (`≤768px`)

**Stack navigation** — two separate full-screen views:

**View 1 — Thread list (`/inbox`)**
- Full width, full height minus top bar and bottom nav
- Each thread row is a tap target navigating to View 2
- Same thread list rendering as desktop, no columns removed

**View 2 — Conversation (`/inbox?conversation=X`)**
- Back button in top bar: `← Inbox`
- Full-width message bubbles
- Composer pinned to bottom (above bottom nav)
- Right rail content replaced by a **bottom sheet**

**Customer details bottom sheet:**
- A persistent "handle bar" peeking `72px` above the composer, showing customer name + LTV + trust score
- Drag/tap to expand to ~60% of screen height
- Expanded state shows: LTV, trust, tags, last order, supply status (critical products only)
- Collapsed automatically when keyboard opens

**CSS approach for inbox panels:**
```css
@media (max-width: 768px) {
  .pt-inbox { grid-template-columns: 1fr; }
  .pt-ix-conv { display: none; }   /* hidden until conversation selected */
  .pt-ix-rail { display: none; }   /* replaced by bottom sheet */
  .pt-inbox.has-conversation .pt-ix-list { display: none; }
  .pt-inbox.has-conversation .pt-ix-conv { display: flex; }
}
```

The `has-conversation` class is toggled on the `.pt-inbox` wrapper div by `InboxView` via a `useEffect` that watches `useSearchParams()`. When `searchParams.get('conversation')` is non-null, the class is applied. This makes direct URL loads (`/inbox?conversation=X`) work correctly on mobile — the conversation view shows immediately without showing the list first.

---

## 3. Dashboard

### Desktop (unchanged)
4-column KPI strip + 3-column card grid (6 cards).

### Mobile (`≤768px`)

**KPIs:** 2×2 grid instead of 4-column row.

**Cards — curated set (3 cards, stacked):**
1. **Reorder signals** — elevated to first position (most actionable)
2. **Payments** — pending crypto orders
3. **Revenue summary** — headline number + trend delta only; sparkline chart hidden (`.pt-revenue-chart { display: none }`)

**Hidden on mobile:** Inbox card (redundant — it's a nav tab), Stock card, Shipments card.

**CSS:**
```css
@media (max-width: 768px) {
  .pt-kpis { grid-template-columns: 1fr 1fr; }
  .pt-grid { grid-template-columns: 1fr; }
  .pt-dash-card-inbox,
  .pt-dash-card-stock,
  .pt-dash-card-shipments { display: none; }
  .pt-revenue-spark { display: none; }
}
```

**New class names to add** (these don't exist yet — added during implementation):
- `pt-dash-card-inbox` — wrapper className on the `<DashCard>` for `InboxCard`
- `pt-dash-card-stock` — wrapper className on `StockCard`
- `pt-dash-card-shipments` — wrapper className on `ShipmentsCard`
- `pt-revenue-spark` — className on the sparkline/chart `<div>` inside `RevenueCard`

---

## 4. Customer Detail

### Desktop (unchanged)
Multi-card side-by-side layout: Activity, Details, Notes, Orders, Active Cycles, Trust Score.

### Mobile (`≤768px`)

**Pinned hero section** (always visible, not scrollable):
- Customer name + channel handle
- Trust score as a small pill (`87 / Trust`) top-right
- Tag chips
- Stat strip: LTV · Orders · Last order date
- Action row: **Message** (primary) · **Note** · **Tag**

**Section tabs** (4 tabs, full-width, scrollable content below):

| Tab | Content |
|-----|---------|
| **Cycles** | Active cycle cards per product — supply bar, days remaining, status badge. Default/first tab. |
| **Activity** | Milestone activity feed (same filtered feed as desktop) |
| **Orders** | Order list — ref number, amount, status, date |
| **Notes** | Notes list + add note button |

**Hidden on mobile:** Trust score breakdown card (score is in the hero), Details card (LTV/avg order in the hero stat strip).

**Tab state:** Managed by `useState` in `CustomerDetailView`. Selected tab persists during session but resets on navigation.

**Implementation note:** The existing `CustomerDetailView` component receives all card data as props. The mobile layout uses CSS to hide the desktop multi-card grid and show the tabbed layout. No data-fetching changes needed.

---

## CSS Files Modified

| File | Changes |
|------|---------|
| `styles/peptech.css` | `pt-root` grid, `pt-sidebar` hide, `pt-top` strip, bottom nav styles |
| `styles/inbox.css` | `pt-inbox` panel stack, conversation/list show-hide logic |
| `styles/peptech.css` | Dashboard: KPI 2x2, card grid 1-col, card hide classes (no separate dashboard CSS file exists) |
| `styles/customer.css` | Customer detail: hero layout, tab bar, desktop cards hide |

---

## New Component

**`src/components/shell/BottomNav.tsx`**
- Props: `unreadCount: number`
- `unreadCount` sourced from: in `Shell.tsx`, count threads with `unread_count > 0` from the server-fetched conversations; in `DashboardLayout.tsx`, count from the `threads` prop
- Renders 5 tabs + "More" slide-up sheet
- Uses `usePathname()` for active state (same pattern as `Sidebar.tsx`)
- Unread badge on Inbox tab when `unreadCount > 0`
- Hidden on desktop via `@media (min-width: 769px) { .pt-bottom-nav { display: none } }`
- Added to both `Shell.tsx` and `DashboardLayout.tsx`

---

## What's Not in This Sub-project

- Orders page (kanban board — needs separate thinking)
- Catalog page (split-pane detail panel)
- Customers list page (table → card list)
- Settings pages
- Vault, Broadcasts, Automations
- PWA manifest + service worker + push notifications

---

## Verification

1. Resize browser to 375px wide — sidebar disappears, bottom nav appears
2. Tap Inbox tab — thread list fills screen
3. Tap a thread — conversation fills screen, back button returns to list, customer sheet peeks at bottom
4. Tap Dashboard tab — 2×2 KPIs, 3 stacked cards (Reorders, Payments, Revenue)
5. Tap Customers tab, open a customer — hero pinned, Cycles tab default, tabs switch sections
6. Tap "More" in bottom nav — sheet slides up with Catalog, Settings etc.
7. Resize back to 1280px — sidebar reappears, bottom nav disappears, all desktop layouts restored
8. `npx tsc --noEmit` — 0 new errors
