# Inbox Redesign — respond.io-style Five-Region Layout

**Date:** 2026-05-29
**Status:** Design approved, pending spec review

## Context

The current inbox feels cramped on a normal laptop screen. At ~1280px it renders four heavy columns:

- App nav sidebar — `232px` (icons + labels, shared shell)
- Thread list — `320px` (with status + channel filter pills)
- Conversation pane — `1fr` (~408px after the fixed chrome)
- Customer rail — `320px` (always on: Contact, AI, Notes, Activity, Order)

That leaves the conversation — the part the operator actually reads and types in — at only ~408px, while ~872px is permanent chrome.

The owner admires respond.io's inbox and wants to evolve toward it: **thin icon rails bookending the work area on both sides**, with the heavy chrome collapsing so the conversation breathes. respond.io's layout is genuinely five regions, but feels spacious because the outermost rails are thin (icon-only) and the contact panel is summoned on demand rather than always-on.

**Goal:** Reclaim horizontal space for the conversation (~408px → ~800px at 1280px) by collapsing chrome into thin rails, while adopting respond.io's "saved views" triage column.

## The Five Regions

Left → right, at a 1280px reference width:

| # | Region | Width | Behaviour |
|---|--------|-------|-----------|
| 1 | App nav rail | ~56px | Global shell. Icon-only + tooltips; pin-to-expand toggle shows labels (state remembered). |
| 2 | Views column | ~158–190px | Inbox-only. Collapsible — tucks into the nav rail when collapsed. |
| 3 | Thread list | ~300–320px | Conversation list + search + status filter + sort. |
| 4 | Conversation | `1fr` (~800px) | Header, message stream, composer. The primary surface. |
| 5 | Right rail | ~48px closed | Thin icon strip; clicking an icon **pushes** a panel column in (conversation reflows). Defaults closed. |

## Region Designs

### 1. App nav rail (global shell — affects every page)

This is the existing `Sidebar` (currently `232px`), narrowed to a ~56px icon rail. **This is an app-wide change** — the shell is shared by dashboard, contacts, orders, catalog, payments, broadcasts, automations, settings. All those pages inherit the thinner rail (consistent, intended).

- Icon-only by default, label on hover (tooltip).
- A pin/expand control widens it to show labels; the expanded/collapsed state persists in `localStorage` (mirror the existing theme-persistence pattern in `Sidebar.tsx`).
- Nav items unchanged: Dashboard, Inbox, Contacts, Orders, Payments, Catalog, Broadcasts, Automations + Vault/Media/Settings + profile/theme at the bottom.
- Pinned-conversation shortcuts that currently live in the sidebar move with it (shown only when expanded, or as a small count when collapsed).

### 2. Views column (inbox-only, collapsible)

A dedicated column of saved views — the operator's current "lens" on the inbox. **Single-select** (one active view at a time). Sections:

- **Assignment:** All · Mine · Unassigned
- **Lifecycle:** New Lead · Hot Lead · Customer (derived from `customers.lifecycle_stage` + tags already in the data model)
- **Channels:** WhatsApp · Telegram · Email

Each row shows an unread/count badge. A collapse control (⟨) tucks the whole column into the nav rail; collapsed state persists in `localStorage`. When collapsed, the conversation widens further.

### 3. Thread list

Largely unchanged from today, with one move:

- **Channels leave the thread-list pills** and live in the views column (region 2).
- **Status stays here** as a lighter quick-filter: Needs reply · Snoozed · Resolved, plus the existing Newest/Unreplied sort.
- Division of labour: **views column = which slice (lens); thread-list status = what's actionable within that slice.** No duplication.
- Search, the collapsible pending-approvals section, and the thread rows themselves are unchanged.

### 4. Conversation pane

Structurally unchanged (header with customer + lifecycle pill, message stream, composer) — it simply gets much wider because the chrome shrank. No functional changes to bubbles, composer, WhatsApp window banner, or lightbox.

### 5. Right rail (thin strip + push panels)

Replaces today's always-on `320px` customer rail.

- A ~48px vertical icon strip, always visible: **Contact · AI Assistant · Notes · Activity · Create Order**.
- Clicking an icon opens that panel as a **push column** (conversation reflows narrower); clicking again or ✕ closes it back to the strip.
- One panel open at a time. **Defaults to closed** on load, so conversations start wide.
- Panel contents are the existing components, re-homed:
  - Contact → customer card (trust, LTV, channel, tags) — today's `ConversationRail` customer section
  - AI Assistant → `InboxAIPanel`
  - Notes → existing notes section
  - Activity → existing activity feed
  - Create Order → `OrderRail` / `CreateOrderForm` (already a toggled mode today)

### Mobile (≤768px)

Keep today's single-column, tab-style pattern — no five columns on a phone.

- Nav rail → existing `BottomNav`.
- Views column → a dropdown/segmented control at the top of the thread list.
- Right-rail panels → the existing bottom-sheet pattern (`.pt-ix-mobile-sheet`), with the panel icons as its tabs.
- The list ↔ conversation swap (`.pt-inbox.has-conversation`) stays as-is.

## Affected Components & Files

- `src/components/shell/Sidebar.tsx` + `Shell.tsx` + `ShellSkeleton.tsx` — narrow the nav rail, add expand/pin + persistence (app-wide).
- `styles/peptech.css` (`.pt-root`, `.pt-main`, sidebar rules) — rail width tokens, app-wide.
- `src/components/inbox/InboxView.tsx` — the layout coordinator (`InboxLayout`). New views column; thread-list filter changes; right rail from always-on column → thin strip + push panel.
- `styles/inbox.css` (`.pt-inbox` grid, `.pt-ix-*`) — five-region grid, collapse states, push-panel transitions, mobile media queries.
- New: a `ViewsColumn` component (inbox) and a `RightRailStrip` + panel host component.
- Reuse unchanged: `OrderRail`, `InboxAIPanel`, `PendingApprovalRow`, `CollapsiblePendingApprovals`, thread row markup, composer.

## Non-Goals

- No change to message sending, channel webhooks, AI assistant logic, or order creation behaviour — this is layout/IA only.
- No new inbox data model (lifecycle/channels already exist).
- No custom/team inboxes or user-defined saved views in this iteration (respond.io has them; defer — the views column is built from existing segments only).
- No desktop multi-pane resizing/drag handles (fixed widths + collapse toggles only).

## Verification

- Run `npm run dev`, open `/inbox` on a 1280px window: confirm five regions, conversation visibly wider (~2x), right rail closed by default.
- Click each right-rail icon: panel pushes in, conversation reflows, ✕ restores width; only one open at a time.
- Collapse the views column and the nav rail: conversation widens further; reload — collapse states persist.
- Switch views (All / Mine / Unassigned / lifecycle / channel): thread list refilters; status quick-filter still narrows within the active view.
- Cross-page check: dashboard, orders, catalog still render correctly with the narrowed global nav rail.
- Mobile (≤768px): single-column tab pattern intact; views dropdown + bottom-sheet panels work; no horizontal overflow.
- `npm run test:run` green; `npm run build` passes lint + types.

## Open Decisions Deferred to the Plan

- Exact phasing (recommended: Phase 1 global nav rail → Phase 2 inbox right rail → Phase 3 views column), so each ships independently.
- Precise px tokens for collapsed/expanded widths and transition timing (match existing card animation easing).
