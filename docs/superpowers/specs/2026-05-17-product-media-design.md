# Product Media — Design Spec

**Date:** 2026-05-17  
**Status:** Approved

## Goal

Let tenants upload images and videos to catalog products so they can send them to customers via the inbox. Media items are stored in Supabase Storage and can be attached through both the composer ProductInfoPicker and the catalog ProductSendModal.

---

## Data Model

### `product_media` table

```sql
CREATE TABLE product_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label        text NOT NULL,
  type         text NOT NULL CHECK (type IN ('image', 'video')),
  storage_path text,           -- null until client PUT succeeds
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_product_media_all" ON product_media
  FOR ALL USING (tenant_id = auth_tenant_id());
```

Rows with `storage_path IS NULL` are upload orphans (client PUT never completed). They are harmless — no cleanup job needed for now.

### Storage bucket: `product-media`

- **Visibility:** Private
- **Path format:** `{tenant_id}/{product_id}/{uuid}.{ext}`
- **Size cap:** 16 MB (matches WhatsApp media message limit)
- **Accepted MIME types:** `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime`, `video/webm`
- **Storage RLS policies:**
  - SELECT/INSERT/UPDATE/DELETE on `storage.objects` where `bucket_id = 'product-media'` AND `left(name, 36) = auth_tenant_id()::text`

### Fetching media with the product

The catalog detail query (in `src/app/catalog/actions.ts` or wherever `CatalogProduct` is loaded) must be extended to join `product_media`:

```sql
SELECT *, product_media(id, label, type, storage_path, sort_order)
FROM products WHERE id = $productId
ORDER BY product_media.sort_order ASC
```

In the Supabase client query: `.select('*, product_media(id, label, type, storage_path, sort_order)')` with `.order('sort_order', { referencedTable: 'product_media', ascending: true })`.

`ProductInfoPicker` already fetches products client-side — its query must also include `product_media(id, label, type, storage_path, sort_order)`.

### TypeScript type (`src/types/catalog.ts`)

```typescript
export type ProductMediaItem = {
  id: string
  label: string
  type: 'image' | 'video'
  storage_path: string
  sort_order: number
}
```

`CatalogProduct` gains `media: ProductMediaItem[]`.

---

## API

### `GET /api/catalog/file-url?bucket={bucket}&path={storagePath}`

1. Auth-gate: user must be signed in
2. Validate `bucket` is one of `['coa', 'product-media']` — reject anything else with 400
3. Validate `path` starts with user's `tenant_id` and contains no `..` segments
4. Call `supabase.storage.from(bucket).createSignedUrl(path, 3600)`
5. Return `{ url: signedUrl }`

---

## Server Actions (`src/app/catalog/actions.ts`)

### `createProductMedia(productId, label, type, ext): { id, uploadUrl }`

1. Resolve `tenantId` from `auth_tenant_id()`
2. Generate `storagePath = {tenantId}/{productId}/{randomUUID()}.{ext}`
3. Insert `product_media` row with `storage_path = null`
4. Call `supabase.storage.from('product-media').createSignedUploadUrl(storagePath)`
5. Return `{ id, uploadUrl }`

### `saveProductMediaPath(id, storagePath): void`

1. Verify ownership: select row, confirm `tenant_id = auth_tenant_id()`
2. `UPDATE product_media SET storage_path = $storagePath WHERE id = $id`

### `deleteProductMedia(id, storagePath): void`

1. Verify ownership (as above)
2. `DELETE FROM product_media WHERE id = $id`
3. `supabase.storage.from('product-media').remove([storagePath])`

---

## UI

### Catalog Detail Panel — Media Section

Location: between the protocol card and the resources section. Visible at all times (not gated behind edit mode — uploading is not an edit-product action).

**Empty state:** Dashed-border zone with two buttons: "Upload image" and "Upload video". Each triggers a hidden `<input type="file" accept="...">`.

**Populated state:** 3-column thumbnail grid.
- Images: actual thumbnail loaded via signed URL
- Videos: dark tile with ▶ icon + label
- Each tile: label beneath, ✕ delete button top-right
- Clicking image/video: opens signed URL in new tab
- Delete flow: inline confirm ("Delete?  Yes / Cancel") on the tile, no modal

**Upload flow:**
1. User picks file → inline label input appears (pre-filled with filename sans extension)
2. User edits label → clicks "Upload"
3. `createProductMedia()` → signed upload URL
4. Client PUT to Supabase Storage
5. `saveProductMediaPath()` → row complete
6. Grid re-renders with new tile

**Loading state:** Uploading tile shows a spinner with progress (if fetch supports it) or indeterminate spinner.

---

## Picker Integration

### Rename: `onAttachCoa` → `onAttachFile`

Both `ProductInfoPicker` and `InboxView` (Composer) rename this prop/callback to `onAttachFile(storagePath: string, label: string, bucket: 'coa' | 'product-media')`. The composer chip uses `label` for display. The signed URL step at send time uses `bucket` to call the correct API route.

> The `/api/send` route currently calls `/api/catalog/coa-url` internally. It needs to accept an optional `bucket` param so it can route to `media-url` for product media. Alternatively, a single unified `/api/catalog/file-url` route can replace both.

**Decision:** Unify into a single `GET /api/catalog/file-url?bucket={bucket}&path={path}` route. The `coa-url` route is kept as-is for backwards compatibility (existing callers).

### ProductInfoPicker (composer)

- New "Media" toggle card (below Resources) appears if `product.media.length > 0`
- Label: "Media · N item(s)"
- When toggled on: card expands to show thumbnail/video grid
- Tap a tile to select it (green ring); tap again to deselect; only one item selected at a time
- On Insert: calls `onAttachFile(item.storage_path, item.label, 'product-media')` — closes picker
- Text content and media attachment are independent: both can be active simultaneously

### ProductSendModal (catalog)

- New "Media" section below content toggles (visible if `product.media.length > 0`)
- Same single-select thumbnail grid
- Send behaviour:
  - Text only: one POST `/api/send` with `content`
  - Media only: one POST `/api/send` with `storagePath` + `bucket: 'product-media'`
  - Both: two sequential POSTs — text first, then media
- Button label:
  - "Send →" (text only or media only)
  - "Send message + media →" (both selected)
- On either POST failure: show inline error; do not close modal

### `/api/send` changes

Accept optional `bucket: 'coa' | 'product-media'` in the request body alongside `storagePath`. When `storagePath` is present, fetch the signed URL from the appropriate bucket before calling Twilio. Default `bucket` to `'coa'` if omitted (backwards compatible).

---

## File Changes Summary

| File | Change |
|------|--------|
| `supabase/migrations/20260517000003_product_media.sql` | New table + RLS + storage bucket policies |
| `src/types/catalog.ts` | Add `ProductMediaItem`, extend `CatalogProduct` |
| `src/types/database.ts` | Add `product_media` Row/Insert/Update |
| `src/app/catalog/actions.ts` | Add `createProductMedia`, `saveProductMediaPath`, `deleteProductMedia` |
| `src/app/api/catalog/file-url/route.ts` | New unified signed URL route |
| `src/app/api/send/route.ts` | Accept `bucket` param for media sends |
| `src/components/catalog/CatalogView.tsx` | Add Media section to detail panel |
| `src/components/catalog/ProductSendModal.tsx` | Add media grid + two-send flow |
| `src/components/inbox/ProductInfoPicker.tsx` | Add media toggle card + selection grid, rename callback |
| `src/components/inbox/InboxView.tsx` | Rename `onAttachCoa` → `onAttachFile`, handle bucket routing |
