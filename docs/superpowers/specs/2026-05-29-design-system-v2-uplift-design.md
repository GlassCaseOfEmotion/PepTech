# Design System v2 — Site-wide Visual Uplift

**Date:** 2026-05-29
**Status:** Design approved, pending spec review

## Context

Peptech's UI is built in the flat, dense "Linear/Attio" school (the `peptech.css` header literally says so). It's precise and information-dense but reads as a cool, professional tool rather than an inviting one. The owner wants it to feel more visually engaging — closer to respond.io — and identified the **Catalog page as the one surface that already feels right**.

An audit of the Catalog confirmed the real lever: **colour, not size**. The catalog is just as dense as the rest of the app (13px type, table rows), but it earns visual life through a **colour-by-attribute system** — each product family gets its own hue, rendered as soft-fill pastel badges (light tint background + saturated text) — plus small chromatic data-viz (green/orange/red stock bars, margin colour-coding, mint sparklines). respond.io's "engaging" feel is the same idea applied to people (colour avatars + channel badges).

The owner chose **full warmth everywhere**: adopt that chromatic identity site-wide *and* warm the shared scale (slightly larger type, looser spacing, rounder corners, soft elevation). Execution strategy: **showcase, then roll** — build the language, validate it fully on the freshly-rebuilt inbox, then propagate surface-by-surface.

This is a design-system v2, not a page redesign. The lever is the shared token layer + a small set of reusable primitives; surfaces *adopt* them rather than each being restyled.

## The Elevated Token Foundation (approved magnitude)

Premium B2B warmth (Attio-meets-respond.io), deliberately not consumer-toy. Concrete changes to `styles/peptech.css` `:root`:

| Token | Now | v2 |
|---|---|---|
| Row name / item title | 13px | **14.5px** |
| Body / snippet | 12px | **13px** |
| Section labels (caps) | 9–10px | 10–11px |
| `--pt-row-h` / `--pt-pad` / `--pt-gap` | 44 / 14 / 12 | **48 / 16 / 14** |
| `--pt-radius` / `-sm` / `-lg` | 8 / 6 / 12 | **10 / 8 / 14** |
| Pills | 4–6px | **999px (fully rounded)** |
| Elevation | near-flat `0 1px 2px` | new `--pt-shadow-soft: 0 2px 8px rgba(20,20,40,.06)` |

- **Compact mode (`.pt-d-compact`, 36/10/8) stays** as an escape hatch for power users who want density back.
- **Colour-by-attribute palette**: formalise the catalog's family hues (GLP-1, HEALING, COSMETIC, MITO, GH, OTHER) as named tokens, plus the existing channel colours (`--pt-wa`, `--pt-tg`, `--pt-em`). Soft-fill recipe = light tint bg (`oklch ~0.95 0.05 H`) + saturated text (`oklch ~0.45 0.15 H`), one hue per attribute. These work across the light/dim/dark themes (verify each).

## The Primitive Set (build once, reuse everywhere)

New shared components under `src/components/ui/` (or the project's existing shared location):

1. **`Avatar` + channel badge** — circular, initials, deterministic colour from the name (stable hash → hue) or channel colour; optional channel-badge dot. The inbox currently has *no* avatars; this is the single biggest visual win. Consumers: inbox thread rows, conversation header, contacts, order customer refs.
2. **`Badge` (soft-fill)** — one component, light-tint bg + saturated text, fully rounded. Tones: `attribute` (family hue), `semantic` (ok/warn/danger), `lifecycle`, `channel`. Generalises the catalog's `.pt-cat-cat-pill` + `.pt-cat-flag` into one shared primitive.
3. **Chromatic indicators** — promote the catalog's `MiniSparkline` and the stock/status fill-bar to shared primitives for reuse (dashboard metrics, catalog velocity, etc.).
4. **Card / elevation** — a shared soft-shadow + rounder-radius card class (dashboard cards, proposal cards, stat cards).
5. **Token layer** — the v2 tokens above + the palette + soft-fill recipe, in `peptech.css`.

## Showcase — the Inbox

Apply every primitive end-to-end to the inbox (Phases 1–3 just shipped its structure):
- Colour avatars + channel badges on thread rows and the conversation header (fills the "no avatars" gap the owner called out).
- Channel-colour dots / accents in the views column.
- Warmer type + soft-fill lifecycle/channel badges on rows.
- Soft elevation on the active row.

This validates the whole language in one high-traffic surface before it goes global.

## Rollout

Each phase is its own implementation plan + PR, same rhythm as the inbox redesign:

- **Phase A — Showcase (inbox):** build the primitive components + define v2 tokens **scoped to the inbox** (e.g. under `.pt-inbox` / via the components), apply to the inbox, validate the feel. Additive tokens (family-hue palette, new components) land here and break nothing elsewhere.
- **Phase B — Promote + dashboard:** promote the warmer type/spacing/radius/elevation tokens to global `:root` (every page shifts) **behind a full cross-page regression sweep**, and adopt primitives on the dashboard.
- **Phase C+ — Per surface:** catalog (mostly there — realign its bespoke badges to the shared `Badge`), orders, contacts, payments, settings/onboarding.

**Key risk gated:** the global token flip (Phase B) is the only moment everything changes at once. It is deliberately sequenced *after* inbox validation and *with* a regression sweep, so we never blindly ship a global visual shift.

## Non-Goals

- No new product features or data — this is presentation only.
- No change to the inbox's structural layout (Phases 1–3 are done; v2 adds the visual layer on top).
- Not forking styles per page — surfaces adopt shared primitives; bespoke per-surface CSS is reduced, not added.
- Compact-density users are not forced into the warmer scale — `.pt-d-compact` persists.

## Verification

- Per phase: `npm run dev`, eyeball the surface; the primitives render with colour avatars, soft-fill badges, warmer type, soft elevation.
- Phase B specifically: cross-page regression sweep — dashboard, orders, catalog, contacts, payments, settings, onboarding, inbox — confirm the global token change didn't break any layout (overflow, truncation, alignment) in light / dim / dark themes and in compact mode.
- `npm run build` passes lint + types each phase; `npm run test:run` no new failures.

## Open Decisions Deferred to the Plans

- Exact avatar colour algorithm (name-hash hue vs. channel colour vs. both) — settle in Phase A.
- Whether sparklines appear on inbox rows or stay catalog/dashboard-only — Phase A QA call.
- Precise per-token values if QA reveals overflow at 14.5/48/16 on any dense surface.
