# Catalog Detail Panel — Tabs Design Spec

**Date:** 2026-05-18
**Status:** Approved

## Goal

Organise the growing catalog product detail panel into four tabs so tenants can navigate directly to the section they need without scrolling through all content. Zero visual redesign — every existing section keeps its exact appearance. The only new element is a tab bar.

---

## Scope

**Changes:**
- Add a tab bar to `CatalogDetail` between the product header and the content area
- Distribute existing sections across four tabs
- Track active tab in the URL via `?tab=<name>` (alongside the existing `?product=<id>` param)
- Extract tab content into dedicated component files to reduce `CatalogView.tsx` from ~1,300 lines

**Explicitly unchanged:**
- The catalog product list on the left
- The product header (name, SKU, family pill, Send info / Edit / Re-order buttons, edit form)
- Every section's visual design — cards, colours, fonts, spacing
- `pt-card`, `pt-cat-section` structure inside each section
- `ProtocolSection`, `ProductMediaSection`, `ProductSendModal` — unchanged internally

---

## Tab Structure

| Tab | Sections | URL param |
|-----|----------|-----------|
| **Overview** | Stock alert · Stats grid · Batches | `?tab=overview` (default) |
| **Protocol** | ProtocolSection | `?tab=protocol` |
| **Media** | ProductMediaSection | `?tab=media` |
| **Insights** | Frequently ordered together | `?tab=insights` |

**Default:** `overview` — shown when no `?tab` param is present or when switching products.

---

## URL Behaviour

Current URL pattern: `/catalog?product=<id>`

New pattern: `/catalog?product=<id>&tab=<name>`

- Selecting a product always resets to `overview` tab
- Switching tabs updates the URL via `router.replace` (no browser history entry — tabs are not back-button destinations)
- Invalid `?tab` values fall back to `overview`

---

## Tab Bar Design

A new `pt-cat-tabs` CSS block added to `styles/catalog.css`. Rendered between the product header and the tab content area.

```
[Product header — unchanged]
─────────────────────────────
Overview  |  Protocol  |  Media  |  Insights
─────────────────────────────
[Active tab content]
```

- Active tab: `border-bottom: 2px solid var(--pt-accent)`, `color: var(--pt-accent-fg)`
- Inactive: `color: var(--pt-fg-3)`, no underline
- Hover: `color: var(--pt-fg)`
- Font: 12px, matching existing section header sizing
- No background change — tab bar sits directly on `var(--pt-bg-side)`

---

## Component Architecture

`CatalogView.tsx` currently holds all sections inline (~1,300 lines). The tab extraction is a natural opportunity to split it into focused files:

| New file | Contains | Extracted from |
|----------|----------|----------------|
| `src/components/catalog/CatalogDetailOverview.tsx` | Stats grid + stock alert + Batches section | `CatalogDetail` inline JSX + `AddBatchForm` + `BatchRow` |
| `src/components/catalog/CatalogDetailProtocol.tsx` | `ProtocolSection` component | `CatalogView.tsx` lines ~900–1063 |
| `src/components/catalog/CatalogDetailMedia.tsx` | `ProductMediaSection` component | `CatalogView.tsx` lines ~329–499 |
| `src/components/catalog/CatalogDetailInsights.tsx` | Frequently ordered together section | `CatalogDetail` inline JSX |

`CatalogView.tsx` retains: `MiniSparkline`, `openCoa`, `AddProductForm`, `CatalogDetail` (now the shell with tab bar), and `CatalogView` (the main export).

`CatalogDetail` becomes the shell: product header + tab bar + renders the active tab component.

---

## Props Interface

Each tab component receives only what it needs:

```typescript
// CatalogDetailOverview
{ product: CatalogProduct; baseCurrency: string }

// CatalogDetailProtocol
{ productId: string; protocol: ProductProtocol | null }

// CatalogDetailMedia
{ productId: string; media: ProductMediaItem[] }

// CatalogDetailInsights
{ product: CatalogProduct; products: CatalogProduct[]; baseCurrency: string }
```

---

## File Changes

| File | Change |
|------|--------|
| `src/components/catalog/CatalogView.tsx` | Remove extracted sections; add tab bar to `CatalogDetail`; read/write `?tab` URL param |
| `src/components/catalog/CatalogDetailOverview.tsx` | New — stats + batches |
| `src/components/catalog/CatalogDetailProtocol.tsx` | New — wraps ProtocolSection |
| `src/components/catalog/CatalogDetailMedia.tsx` | New — wraps ProductMediaSection |
| `src/components/catalog/CatalogDetailInsights.tsx` | New — frequently ordered together |
| `styles/catalog.css` | Add `pt-cat-tabs`, `pt-cat-tab`, `pt-cat-tab.is-active` |
