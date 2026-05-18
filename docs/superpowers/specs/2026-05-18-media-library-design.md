# Media Library Design

## Goal

A tenant-wide media library at `/media` where tenants upload assets once, tag them to products, and send them to customers — replacing the current per-product media silo with a shared, searchable library.

## Context

Currently, `product_media` stores one media item per product (hard FK). There is no way to share an asset across multiple products, no tenant-wide content (guides, protocols), and no central place to browse all media. The inbox composer's product picker can surface product media, but general assets have nowhere to live.

---

## Data Model

### Replace `product_media` with two tables

**`media_items`** — canonical library record, tenant-scoped:

```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id    uuid NOT NULL REFERENCES tenants(id)
label        text NOT NULL
type         text NOT NULL CHECK (type IN ('image', 'video', 'pdf'))
storage_path text                          -- null until upload confirmed
sort_order   integer NOT NULL DEFAULT 0
created_at   timestamptz NOT NULL DEFAULT now()
```

RLS: tenant-scoped (same pattern as `product_media`).

**`media_product_tags`** — join table for many-to-many product associations:

```sql
media_item_id  uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE
product_id     uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE
tenant_id      uuid NOT NULL REFERENCES tenants(id)
PRIMARY KEY (media_item_id, product_id)
```

RLS: tenant-scoped.

### Migration

- All existing `product_media` rows copy into `media_items` (preserving id, tenant_id, label, type, storage_path, sort_order, created_at).
- Each migrated row gets a corresponding `media_product_tags` row linking it to its original `product_id`.
- `product_media` table is dropped after migration.
- Storage bucket (`product-media`) and all existing paths are unchanged.

### Untagged items

Items with no rows in `media_product_tags` are "tenant-wide" — guides, general content not specific to any product. These are the primary use case for the new library beyond what product_media already handled.

---

## /media — Library Page

### Navigation

Top-level nav item: **Media**, between Vault and Settings. Route: `/media`.

### Layout

**Header row:** "Media Library" heading + "Upload" button (top right).

**Filter bar:**
- Type pills: All · Images · Videos · PDFs · Untagged (left-aligned)
- Product dropdown: filter to items tagged to a specific product (right-aligned)
- "Untagged" pill = items with no product associations

**Grid:** 4-column, using existing `pt-media-*` CSS patterns.
- Images: thumbnail (server-signed, 400px wide, `resize: contain`, q80)
- Videos: dark tile with ▶ play icon
- PDFs: tile with document icon and truncated filename
- Hover: reveals ✕ delete button

### Item modal (click any tile)

Opens a centred modal overlay (reuses `pt-lightbox` pattern):

- **Preview:** full-size image/video lightbox or PDF icon for documents
- **Label:** editable text field
- **Product tags:** pill list of currently tagged products
  - ✕ on each pill to remove that tag
  - "+ Add product" typeahead (searches active products) to add tags
- **Actions:**
  - Delete (with confirmation)
  - Send → (opens conversation picker, same as existing `ProductSendModal`)

### Upload flow

1. Click Upload → file picker (image/jpeg, image/png, image/webp, video/mp4, video/quicktime, video/webm, application/pdf — max 16MB)
2. Label input (pre-filled from filename)
3. Optional product tag(s) via typeahead (can skip — item is tenant-wide until tagged)
4. Two-phase upload: insert `media_items` row with `storage_path: null` → signed PUT to `product-media` bucket → confirm path via server action
5. Item appears in grid immediately after confirmation

---

## Catalog Product Detail — Media Tab

No visible UX change. Under the hood:

- Query changes from `product_media` to `media_items JOIN media_product_tags` filtered by `product_id`
- Upload from the tab auto-applies a `media_product_tags` row for the current product
- **New:** "Manage in library →" link in the tab header, navigates to `/media?product={id}`

The 3-column grid, server-side thumbnail signing, lightbox, and delete flow are all preserved.

**Delete from product tab:** Removes the `media_product_tags` row only (untags from this product). The item remains in the library. Full deletion (removes `media_items` row + storage object) only happens from the `/media` library page.

---

## Inbox Composer — ProductInfoPicker

The flask button in the composer toolbar gets two entry points inside the same modal:

**Tab 1 — Product (existing flow):**
- Pick a product from the list
- Toggle protocol / description / resources / media to include
- Insert formatted text or attach a file
- No change from current behaviour

**Tab 2 — Browse library:**
- Search input (searches `media_items.label`)
- Type filter pills: All · Images · Videos · PDFs
- Grid of results (same tile pattern)
- Selecting an item attaches it to the message: images/videos via `storagePath` to `product-media` bucket, PDFs the same way
- No product context required — this is the path for sending guides, how-to videos, and other tenant-wide content

---

## TypeScript Types

```typescript
// src/types/media.ts

export type MediaItemType = 'image' | 'video' | 'pdf'

export type MediaItem = {
  id: string
  tenantId: string
  label: string
  type: MediaItemType
  storagePath: string | null
  sortOrder: number
  createdAt: string
  productTags: { productId: string; productName: string }[]
  thumbnailUrl?: string  // server-signed for images
}
```

---

## Key Files

| File | Role |
|------|------|
| `supabase/migrations/*_media_library.sql` | Create `media_items` + `media_product_tags`, migrate data, drop `product_media` |
| `src/types/media.ts` | `MediaItem` type, `MediaItemType` |
| `src/types/catalog.ts` | Update `ProductMediaItem` → reference `MediaItem`; update `CatalogProduct.media` |
| `src/app/media/page.tsx` | Server component: fetch all tenant media + product list for filter dropdown |
| `src/app/media/actions.ts` | `createMediaItem`, `saveMediaItemPath`, `deleteMediaItem`, `updateMediaItemTags` |
| `src/app/api/media/upload-url/route.ts` | Signed PUT URL for uploads (mirrors existing catalog pattern) |
| `src/components/media/MediaLibraryView.tsx` | Client component: filter bar, grid, upload, item modal |
| `src/components/media/MediaItemModal.tsx` | Item detail modal: preview, label edit, product tag management, send/delete |
| `src/app/catalog/page.tsx` | Update media query to use `media_items JOIN media_product_tags` |
| `src/app/catalog/actions.ts` | Update `createProductMedia` / `deleteProductMedia` to use new tables |
| `src/components/catalog/CatalogDetailMedia.tsx` | Add "Manage in library →" link; update types |
| `src/components/inbox/ProductInfoPicker.tsx` | Add "Browse library" tab |
| `styles/media.css` | New stylesheet for `pt-media-lib-*` classes |

---

## Out of Scope

- Customer-scoped media (personalised docs per client)
- Order-scoped media (packing slips, order-specific attachments)
- Bulk tagging / drag-and-drop reordering in the library
- Public share links for media items
