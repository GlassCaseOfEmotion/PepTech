# Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-product `product_media` table with a tenant-wide media library (`media_items` + `media_product_tags`) and add a `/media` page where tenants upload once, tag to products, and send to customers.

**Architecture:** A new `media_items` table owns all media records; `media_product_tags` is a join table enabling many-to-many product associations. The existing `/catalog` Media tab becomes a filtered view of the library. The inbox `ProductInfoPicker` gains a "Browse library" tab for tenant-wide content. Uploads use the same two-phase signed-URL pattern already in use.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + Storage), `pt-*` CSS, Vitest + React Testing Library.

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260518000001_media_library.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260518000001_media_library.sql

-- Allow PDFs in the existing product-media bucket
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp',
  'video/mp4','video/quicktime','video/webm',
  'application/pdf'
]
WHERE id = 'product-media';

-- Canonical library table
CREATE TABLE media_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label        text NOT NULL,
  type         text NOT NULL CHECK (type IN ('image', 'video', 'pdf')),
  storage_path text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_media_items_all" ON media_items
  FOR ALL
  USING  (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- Many-to-many product associations
CREATE TABLE media_product_tags (
  media_item_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id)    ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  PRIMARY KEY (media_item_id, product_id)
);

ALTER TABLE media_product_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_media_product_tags_all" ON media_product_tags
  FOR ALL
  USING  (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- Migrate existing product_media rows → media_items + media_product_tags
INSERT INTO media_items (id, tenant_id, label, type, storage_path, sort_order, created_at)
SELECT id, tenant_id, label, type, storage_path, sort_order, created_at
FROM product_media;

INSERT INTO media_product_tags (media_item_id, product_id, tenant_id)
SELECT id, product_id, tenant_id
FROM product_media;

-- Drop old table (storage objects and paths are unchanged)
DROP TABLE product_media;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push --include-all
```

Expected: migration applies cleanly, `product_media` table is gone.

- [ ] **Step 3: Verify in Supabase dashboard**

Check that `media_items` and `media_product_tags` exist and have the same row count as the old `product_media` table had.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000001_media_library.sql
git commit -m "feat: media_items + media_product_tags tables, migrate product_media"
```

---

## Task 2: TypeScript types + icons

**Files:**
- Modify: `src/lib/icons.tsx`
- Create: `src/types/media.ts`
- Modify: `src/types/catalog.ts`

- [ ] **Step 1: Add `Icons.photo` to `src/lib/icons.tsx`**

Add after the `moon` entry (line 64):

```typescript
  photo:   (p: IconProps) => <PtIcon {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M3 9h2l2-3h10l2 3"/></PtIcon>,
```

- [ ] **Step 2: Create `src/types/media.ts`**

```typescript
export type MediaItemType = 'image' | 'video' | 'pdf'

export type MediaItem = {
  id: string
  label: string
  type: MediaItemType
  storagePath: string
  sortOrder: number
  createdAt: string
  productTags: { productId: string; productName: string }[]
  thumbnailUrl?: string
}
```

- [ ] **Step 3: Update `src/types/catalog.ts`**

Change `ProductMediaItem.type` to include `'pdf'`:

```typescript
export type ProductMediaItem = {
  id: string
  label: string
  type: 'image' | 'video' | 'pdf'
  storage_path: string
  sort_order: number
  thumbnailUrl?: string
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no new errors (pre-existing test errors are acceptable).

- [ ] **Step 5: Commit**

```bash
git add src/lib/icons.tsx src/types/media.ts src/types/catalog.ts
git commit -m "feat: MediaItem type, photo icon, pdf type in ProductMediaItem"
```

---

## Task 3: Media server actions

**Files:**
- Create: `src/app/media/actions.ts`

- [ ] **Step 1: Create `src/app/media/actions.ts`**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id as string }
}

export async function createMediaItem(
  label: string,
  type: 'image' | 'video' | 'pdf',
  ext: string,
  productId?: string,
): Promise<{ id: string; uploadUrl: string; storagePath: string } | { error: string }> {
  if (!label.trim()) return { error: 'Label is required' }
  if (!['image', 'video', 'pdf'].includes(type)) return { error: 'Invalid type' }
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5)
  if (!safeExt) return { error: 'Invalid file extension' }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { data: row, error: insertErr } = await supabase
      .from('media_items')
      .insert({ tenant_id: tenantId, label: label.trim(), type, storage_path: null })
      .select('id')
      .single()
    if (insertErr || !row) return { error: insertErr?.message ?? 'Insert failed' }

    const storagePath = `${tenantId}/${row.id}.${safeExt}`
    const { data: uploadData, error: urlErr } = await supabase.storage
      .from('product-media')
      .createSignedUploadUrl(storagePath)
    if (urlErr || !uploadData) {
      await supabase.from('media_items').delete().eq('id', row.id)
      return { error: urlErr?.message ?? 'Could not create upload URL' }
    }

    if (productId) {
      await supabase.from('media_product_tags').insert({
        media_item_id: row.id,
        product_id: productId,
        tenant_id: tenantId,
      })
    }

    return { id: row.id, uploadUrl: uploadData.signedUrl, storagePath }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function saveMediaItemPath(
  id: string,
  storagePath: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    if (!storagePath.startsWith(`${tenantId}/`)) return { error: 'Invalid path' }
    const { error } = await supabase
      .from('media_items')
      .update({ storage_path: storagePath })
      .eq('id', id)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/media')
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteMediaItem(
  id: string,
  storagePath: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    if (!storagePath.startsWith(`${tenantId}/`)) return { error: 'Invalid path' }
    const { error } = await supabase
      .from('media_items')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    const { error: storageErr } = await supabase.storage.from('product-media').remove([storagePath])
    if (storageErr) console.error('media storage removal failed:', storagePath, storageErr.message)
    revalidatePath('/media')
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateMediaItemLabel(
  id: string,
  label: string,
): Promise<{ success: true } | { error: string }> {
  if (!label.trim()) return { error: 'Label is required' }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase
      .from('media_items')
      .update({ label: label.trim() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/media')
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function tagMediaItemToProduct(
  mediaItemId: string,
  productId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('media_product_tags').insert({
      media_item_id: mediaItemId,
      product_id: productId,
      tenant_id: tenantId,
    })
    if (error && error.code !== '23505') return { error: error.message } // ignore duplicate
    revalidatePath('/media')
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function untagMediaItemFromProduct(
  mediaItemId: string,
  productId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase
      .from('media_product_tags')
      .delete()
      .eq('media_item_id', mediaItemId)
      .eq('product_id', productId)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/media')
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/media/actions.ts
git commit -m "feat: media library server actions (create, save, delete, tag, untag)"
```

---

## Task 4: Update catalog actions

**Files:**
- Modify: `src/app/catalog/actions.ts`

The catalog media functions now target `media_items` + `media_product_tags`. Delete from the catalog tab **untags only** — it does not delete the storage object or the `media_items` row.

- [ ] **Step 1: Replace `createProductMedia` in `src/app/catalog/actions.ts`**

Remove the old `createProductMedia` function and replace it with:

```typescript
export async function createProductMedia(
  productId: string,
  label: string,
  type: 'image' | 'video' | 'pdf',
  ext: string,
): Promise<{ id: string; uploadUrl: string; storagePath: string } | { error: string }> {
  const { createMediaItem } = await import('@/app/media/actions')
  return createMediaItem(label, type, ext, productId)
}
```

- [ ] **Step 2: Replace `saveProductMediaPath` in `src/app/catalog/actions.ts`**

Remove the old `saveProductMediaPath` and replace with:

```typescript
export async function saveProductMediaPath(
  id: string,
  storagePath: string,
): Promise<{ success: true } | { error: string }> {
  const { saveMediaItemPath } = await import('@/app/media/actions')
  return saveMediaItemPath(id, storagePath)
}
```

- [ ] **Step 3: Replace `deleteProductMedia` in `src/app/catalog/actions.ts`**

Remove the old `deleteProductMedia` and replace with (untag only — item stays in the library):

```typescript
export async function deleteProductMedia(
  mediaItemId: string,
  productId: string,
): Promise<{ success: true } | { error: string }> {
  const { untagMediaItemFromProduct } = await import('@/app/media/actions')
  return untagMediaItemFromProduct(mediaItemId, productId)
}
```

Note: the function signature changes — second argument is now `productId` (uuid string), not `storagePath`. The caller in `CatalogDetailMedia.tsx` will be updated in Task 8.

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/catalog/actions.ts
git commit -m "refactor: catalog media actions delegate to media library actions"
```

---

## Task 5: /media page server component + nav

**Files:**
- Create: `src/app/media/page.tsx`
- Modify: `src/components/shell/Sidebar.tsx`
- Modify: `src/components/shell/BottomNav.tsx`
- Modify: `src/components/shell/__tests__/Sidebar.test.tsx`

- [ ] **Step 1: Create `src/app/media/page.tsx`**

```typescript
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { MediaLibraryView } from '@/components/media/MediaLibraryView'
import type { MediaItem } from '@/types/media'

export default async function MediaPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: rawItems }, { data: products }] = await Promise.all([
    supabase
      .from('media_items')
      .select('id, label, type, storage_path, sort_order, created_at, media_product_tags(product_id, products(name))')
      .not('storage_path', 'is', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
  ])

  // Sign image thumbnails server-side
  const imageItems = (rawItems ?? []).filter(m => m.type === 'image')
  const thumbnailMap: Record<string, string> = {}
  if (imageItems.length > 0) {
    const signed = await Promise.all(
      imageItems.map(m =>
        supabase.storage.from('product-media')
          .createSignedUrl(m.storage_path!, 3600, { transform: { width: 400, quality: 80, resize: 'contain' } })
          .then(({ data }) => data ? { path: m.storage_path!, url: data.signedUrl } : null)
      )
    )
    for (const s of signed) {
      if (s) thumbnailMap[s.path] = s.url
    }
  }

  const items: MediaItem[] = (rawItems ?? []).map(m => ({
    id: m.id,
    label: m.label,
    type: m.type as MediaItem['type'],
    storagePath: m.storage_path!,
    sortOrder: m.sort_order,
    createdAt: m.created_at,
    productTags: ((m.media_product_tags ?? []) as { product_id: string; products: { name: string } | null }[]).map(t => ({
      productId: t.product_id,
      productName: t.products?.name ?? '',
    })),
    thumbnailUrl: thumbnailMap[m.storage_path!],
  }))

  return (
    <Shell section="Media">
      <MediaLibraryView
        items={items}
        products={(products ?? []) as { id: string; name: string }[]}
      />
    </Shell>
  )
}
```

- [ ] **Step 2: Add `Icons.photo` and `Media` to `NAV_SECONDARY` in `src/components/shell/Sidebar.tsx`**

Change `NAV_SECONDARY` from:

```typescript
const NAV_SECONDARY = [
  { label: 'Vault',    href: '/vault',             icon: Icons.vault, badge: null },
  { label: 'Settings', href: '/settings/channels', icon: Icons.gear,  badge: null },
]
```

To:

```typescript
const NAV_SECONDARY = [
  { label: 'Vault',    href: '/vault',             icon: Icons.vault,  badge: null },
  { label: 'Media',    href: '/media',             icon: Icons.photo,  badge: null },
  { label: 'Settings', href: '/settings/channels', icon: Icons.gear,   badge: null },
]
```

- [ ] **Step 3: Add `Media` to `MORE_ITEMS` in `src/components/shell/BottomNav.tsx`**

Change `MORE_ITEMS` from:

```typescript
const MORE_ITEMS = [
  { label: 'Catalog',     href: '/catalog',           icon: Icons.flask },
  { label: 'Broadcasts',  href: '/broadcasts',         icon: Icons.send  },
  { label: 'Automations', href: '/automations',        icon: Icons.zap   },
  { label: 'Vault',       href: '/vault',              icon: Icons.vault },
  { label: 'Settings',    href: '/settings/channels',  icon: Icons.gear  },
]
```

To:

```typescript
const MORE_ITEMS = [
  { label: 'Catalog',     href: '/catalog',           icon: Icons.flask },
  { label: 'Broadcasts',  href: '/broadcasts',         icon: Icons.send  },
  { label: 'Automations', href: '/automations',        icon: Icons.zap   },
  { label: 'Vault',       href: '/vault',              icon: Icons.vault },
  { label: 'Media',       href: '/media',              icon: Icons.photo },
  { label: 'Settings',    href: '/settings/channels',  icon: Icons.gear  },
]
```

- [ ] **Step 4: Update Sidebar test in `src/components/shell/__tests__/Sidebar.test.tsx`**

Find the test `'renders all primary nav items'` and add `'Media'` to whatever assertions it makes, e.g.:

```typescript
expect(screen.getByText('Media')).toBeInTheDocument()
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/media/page.tsx src/components/shell/Sidebar.tsx src/components/shell/BottomNav.tsx src/components/shell/__tests__/Sidebar.test.tsx
git commit -m "feat: /media page server component + nav items"
```

---

## Task 6: MediaLibraryView client component

**Files:**
- Create: `src/components/media/MediaLibraryView.tsx`

- [ ] **Step 1: Create `src/components/media/MediaLibraryView.tsx`**

```typescript
'use client'

import { useState, useRef } from 'react'
import { createMediaItem, saveMediaItemPath } from '@/app/media/actions'
import { MediaItemModal } from '@/components/media/MediaItemModal'
import type { MediaItem, MediaItemType } from '@/types/media'

type FilterType = 'all' | 'image' | 'video' | 'pdf' | 'untagged'

const TYPE_LABELS: Record<FilterType, string> = {
  all: 'All',
  image: 'Images',
  video: 'Videos',
  pdf: 'PDFs',
  untagged: 'Untagged',
}

export function MediaLibraryView({
  items: initialItems,
  products,
}: {
  items: MediaItem[]
  products: { id: string; name: string }[]
}) {
  // Pre-select product filter from URL param (e.g. /media?product={id} from catalog link)
  const searchParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams()

  const [items, setItems] = useState<MediaItem[]>(initialItems)
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [productFilter, setProductFilter] = useState<string>(searchParams.get('product') ?? 'all')
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const filtered = items.filter(item => {
    if (typeFilter === 'untagged') return item.productTags.length === 0
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (productFilter !== 'all' && !item.productTags.some(t => t.productId === productFilter)) return false
    return true
  })

  async function handleUpload(file: File, type: 'image' | 'video' | 'pdf') {
    const label = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
    const ext = file.name.split('.').pop() ?? (type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : 'pdf')
    setUploading(true)
    setUploadError('')
    try {
      const result = await createMediaItem(label, type, ext)
      if ('error' in result) { setUploadError(result.error); return }
      const putRes = await fetch(result.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!putRes.ok) {
        setUploadError('Upload failed — please try again')
        return
      }
      await saveMediaItemPath(result.id, result.storagePath)
      const newItem: MediaItem = {
        id: result.id,
        label,
        type,
        storagePath: result.storagePath,
        sortOrder: items.length,
        createdAt: new Date().toISOString(),
        productTags: [],
        thumbnailUrl: undefined,
      }
      setItems(prev => [newItem, ...prev])
    } finally {
      setUploading(false)
    }
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'pdf') {
    const file = e.target.files?.[0]
    if (file) void handleUpload(file, type)
    e.target.value = ''
  }

  function handleItemUpdated(updated: MediaItem) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
    setSelectedItem(updated)
  }

  function handleItemDeleted(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    setSelectedItem(null)
  }

  return (
    <div className="pt-media-lib">
      {/* Filter bar */}
      <div className="pt-media-lib-bar">
        <div className="pt-media-lib-pills">
          {(['all', 'image', 'video', 'pdf', 'untagged'] as FilterType[]).map(f => (
            <button
              key={f}
              className={`pt-media-lib-pill${typeFilter === f ? ' is-on' : ''}`}
              onClick={() => setTypeFilter(f)}
            >
              {TYPE_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="pt-media-lib-bar-right">
          <select
            className="pt-select"
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
          >
            <option value="all">All products</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => onFilePick(e, 'image')} />
          <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" style={{ display: 'none' }} onChange={e => onFilePick(e, 'video')} />
          <input ref={pdfInputRef}   type="file" accept="application/pdf"                     style={{ display: 'none' }} onChange={e => onFilePick(e, 'pdf')}   />
          <div style={{ position: 'relative' }}>
            <button className="pt-btn pt-btn-primary" disabled={uploading}>
              {uploading ? 'Uploading…' : '↑ Upload'}
            </button>
            {!uploading && (
              <div className="pt-media-lib-upload-menu">
                <button onClick={() => imageInputRef.current?.click()}>Image</button>
                <button onClick={() => videoInputRef.current?.click()}>Video</button>
                <button onClick={() => pdfInputRef.current?.click()}>PDF</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {uploadError && (
        <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--pt-danger)' }}>{uploadError}</div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="pt-media-empty">
          <div className="pt-media-empty-icon">◈</div>
          <div style={{ fontSize: 12, color: 'var(--pt-fg-4)' }}>
            {typeFilter === 'untagged' ? 'No untagged items' : 'No media yet — upload an image, video, or PDF'}
          </div>
        </div>
      ) : (
        <div className="pt-media-lib-grid">
          {filtered.map(item => (
            <div key={item.id} className="pt-media-tile">
              <button
                className="pt-media-tile-thumb"
                onClick={() => setSelectedItem(item)}
                title={item.label}
              >
                {item.type === 'image' && item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt={item.label} className="pt-media-thumb-img" loading="lazy" />
                ) : item.type === 'video' ? (
                  <div className="pt-media-thumb-video">
                    <span className="pt-media-play-icon">▶</span>
                  </div>
                ) : (
                  <div className="pt-media-thumb-pdf">
                    <span className="pt-media-pdf-icon">PDF</span>
                  </div>
                )}
              </button>
              <div className="pt-media-tile-label">{item.label}</div>
              {item.productTags.length > 0 && (
                <div className="pt-media-lib-tag-hint">
                  {item.productTags.length === 1
                    ? item.productTags[0].productName
                    : `${item.productTags.length} products`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedItem && (
        <MediaItemModal
          item={selectedItem}
          products={products}
          onClose={() => setSelectedItem(null)}
          onUpdated={handleItemUpdated}
          onDeleted={handleItemDeleted}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/media/MediaLibraryView.tsx
git commit -m "feat: MediaLibraryView — filter bar, grid, upload flow"
```

---

## Task 7: MediaItemModal + CSS

**Files:**
- Create: `src/components/media/MediaItemModal.tsx`
- Create: `styles/media.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create `src/components/media/MediaItemModal.tsx`**

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { deleteMediaItem, updateMediaItemLabel, tagMediaItemToProduct, untagMediaItemFromProduct } from '@/app/media/actions'
import type { MediaItem } from '@/types/media'

export function MediaItemModal({
  item,
  products,
  onClose,
  onUpdated,
  onDeleted,
}: {
  item: MediaItem
  products: { id: string; name: string }[]
  onClose: () => void
  onUpdated: (item: MediaItem) => void
  onDeleted: (id: string) => void
}) {
  const [label, setLabel] = useState(item.label)
  const [tagQuery, setTagQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLabel(item.label)
    setTagQuery('')
    setConfirmDelete(false)
  }, [item.id, item.label])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleLabelBlur() {
    if (label.trim() === item.label || !label.trim()) return
    setSaving(true)
    const result = await updateMediaItemLabel(item.id, label.trim())
    setSaving(false)
    if ('error' in result) { setError(result.error); return }
    onUpdated({ ...item, label: label.trim() })
  }

  async function handleUntag(productId: string) {
    const result = await untagMediaItemFromProduct(item.id, productId)
    if ('error' in result) { setError(result.error); return }
    onUpdated({ ...item, productTags: item.productTags.filter(t => t.productId !== productId) })
  }

  async function handleTag(productId: string, productName: string) {
    const result = await tagMediaItemToProduct(item.id, productId)
    if ('error' in result) { setError(result.error); return }
    onUpdated({ ...item, productTags: [...item.productTags, { productId, productName }] })
    setTagQuery('')
    tagInputRef.current?.focus()
  }

  async function handleDelete() {
    const result = await deleteMediaItem(item.id, item.storagePath)
    if ('error' in result) { setError(result.error); return }
    onDeleted(item.id)
  }

  async function handleSend() {
    const res = await fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(item.storagePath)}`)
    if (!res.ok) return
    const { url } = await res.json() as { url: string }
    window.open(url, '_blank', 'noopener')
  }

  const tagSuggestions = products.filter(
    p => p.name.toLowerCase().includes(tagQuery.toLowerCase()) &&
         !item.productTags.some(t => t.productId === p.id)
  ).slice(0, 8)

  return (
    <div className="pt-lightbox" onClick={onClose}>
      <div className="pt-media-lib-modal" onClick={e => e.stopPropagation()}>
        {/* Preview */}
        <div className="pt-media-lib-modal-preview">
          {item.type === 'image' && item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt={item.label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }} />
          ) : item.type === 'video' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--pt-fg-4)' }}>
              <span style={{ fontSize: 40 }}>▶</span>
              <span style={{ fontSize: 12 }}>{item.label}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--pt-fg-4)' }}>
              <span style={{ fontSize: 40 }}>📄</span>
              <span style={{ fontSize: 12 }}>{item.label}</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="pt-media-lib-modal-body">
          <input
            className="pt-input"
            value={label}
            onChange={e => setLabel(e.target.value)}
            onBlur={() => void handleLabelBlur()}
            style={{ marginBottom: 16 }}
            disabled={saving}
          />

          <div className="pt-media-lib-modal-label">Products</div>
          <div className="pt-media-lib-tags">
            {item.productTags.map(tag => (
              <span key={tag.productId} className="pt-media-lib-tag">
                {tag.productName}
                <button onClick={() => void handleUntag(tag.productId)} aria-label={`Remove ${tag.productName}`}>✕</button>
              </span>
            ))}
          </div>

          <div style={{ position: 'relative', marginTop: 8 }}>
            <input
              ref={tagInputRef}
              className="pt-input"
              style={{ fontSize: 12 }}
              placeholder="+ Add product…"
              value={tagQuery}
              onChange={e => setTagQuery(e.target.value)}
            />
            {tagQuery && tagSuggestions.length > 0 && (
              <div className="pt-media-lib-tag-dd">
                {tagSuggestions.map(p => (
                  <button key={p.id} onClick={() => void handleTag(p.id, p.name)}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <div style={{ fontSize: 11, color: 'var(--pt-danger)', marginTop: 8 }}>{error}</div>}

          <div className="pt-media-lib-modal-actions">
            {confirmDelete ? (
              <>
                <span style={{ fontSize: 11, color: 'var(--pt-fg-3)' }}>Delete permanently?</span>
                <button className="pt-link" style={{ fontSize: 11, color: 'var(--pt-danger)' }} onClick={() => void handleDelete()}>Yes, delete</button>
                <button className="pt-link" style={{ fontSize: 11 }} onClick={() => setConfirmDelete(false)}>Cancel</button>
              </>
            ) : (
              <>
                <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => setConfirmDelete(true)}>Delete</button>
                <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={() => void handleSend()}>Open ↗</button>
              </>
            )}
          </div>
        </div>

        <button className="pt-lightbox-close" onClick={onClose}>✕</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `styles/media.css`**

```css
/* ── Media Library ──────────────────────────────────────────────────────────── */

.pt-media-lib {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  min-height: 0;
  flex: 1;
}

/* Filter bar */
.pt-media-lib-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.pt-media-lib-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pt-media-lib-pills {
  display: flex;
  gap: 4px;
}
.pt-media-lib-pill {
  padding: 4px 12px;
  border-radius: 20px;
  border: 0.5px solid var(--pt-line);
  background: transparent;
  color: var(--pt-fg-3);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.pt-media-lib-pill.is-on {
  background: var(--pt-accent);
  color: #fff;
  border-color: var(--pt-accent);
}
.pt-media-lib-pill:hover:not(.is-on) {
  background: oklch(from var(--pt-fg) l c h / 0.06);
  color: var(--pt-fg);
}

/* Upload dropdown */
.pt-media-lib-upload-menu {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--pt-surface);
  border: 0.5px solid var(--pt-line);
  border-radius: var(--pt-radius-sm);
  box-shadow: 0 4px 16px oklch(0 0 0 / 0.15);
  z-index: 20;
  min-width: 100px;
  overflow: hidden;
}
.pt-media-lib-upload-menu button {
  display: block;
  width: 100%;
  padding: 8px 14px;
  text-align: left;
  font-size: 12px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--pt-fg);
}
.pt-media-lib-upload-menu button:hover {
  background: oklch(from var(--pt-fg) l c h / 0.06);
}
/* Show menu on parent hover */
div:has(> .pt-media-lib-upload-menu):hover .pt-media-lib-upload-menu {
  display: block;
}

/* Grid */
.pt-media-lib-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

/* PDF tile */
.pt-media-thumb-pdf {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: oklch(from var(--pt-fg) l c h / 0.04);
}
.pt-media-pdf-icon {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--pt-fg-3);
  font-family: monospace;
}

/* Tag hint below tile */
.pt-media-lib-tag-hint {
  font-size: 10px;
  color: var(--pt-fg-4);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Item modal */
.pt-media-lib-modal {
  display: flex;
  gap: 20px;
  background: var(--pt-surface);
  border-radius: 10px;
  box-shadow: 0 24px 64px oklch(0 0 0 / 0.5);
  overflow: hidden;
  max-width: 780px;
  width: 90vw;
}
.pt-media-lib-modal-preview {
  flex: 1;
  min-width: 0;
  background: oklch(from var(--pt-bg) l c h / 0.5);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  min-height: 280px;
}
.pt-media-lib-modal-body {
  width: 240px;
  flex-shrink: 0;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.pt-media-lib-modal-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--pt-fg-4);
  margin-bottom: 6px;
}
.pt-media-lib-modal-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: auto;
  padding-top: 16px;
  flex-wrap: wrap;
}

/* Product tags */
.pt-media-lib-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 24px;
}
.pt-media-lib-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: oklch(from var(--pt-fg) l c h / 0.08);
  border-radius: 12px;
  padding: 2px 8px 2px 10px;
  font-size: 11px;
  color: var(--pt-fg-2);
}
.pt-media-lib-tag button {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--pt-fg-4);
  font-size: 10px;
  line-height: 1;
  padding: 0;
}
.pt-media-lib-tag button:hover { color: var(--pt-fg); }

/* Tag typeahead dropdown */
.pt-media-lib-tag-dd {
  position: absolute;
  top: calc(100% + 2px);
  left: 0; right: 0;
  background: var(--pt-surface);
  border: 0.5px solid var(--pt-line);
  border-radius: var(--pt-radius-sm);
  box-shadow: 0 4px 16px oklch(0 0 0 / 0.12);
  z-index: 30;
  overflow: hidden;
}
.pt-media-lib-tag-dd button {
  display: block;
  width: 100%;
  padding: 7px 12px;
  text-align: left;
  font-size: 12px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--pt-fg);
}
.pt-media-lib-tag-dd button:hover {
  background: oklch(from var(--pt-fg) l c h / 0.06);
}
```

- [ ] **Step 3: Import `media.css` in `src/app/layout.tsx`**

Add after the existing CSS imports:

```typescript
import '../../styles/media.css'
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/media/MediaItemModal.tsx styles/media.css src/app/layout.tsx
git commit -m "feat: MediaItemModal + media library CSS"
```

---

## Task 8: Update catalog integration

**Files:**
- Modify: `src/app/catalog/page.tsx`
- Modify: `src/components/catalog/CatalogDetailMedia.tsx`

- [ ] **Step 1: Update media query in `src/app/catalog/page.tsx`**

Change the `allMedia` query from:

```typescript
supabase
  .from('product_media')
  .select('id, product_id, label, type, storage_path, sort_order')
  .not('storage_path', 'is', null)
  .order('sort_order', { ascending: true }),
```

To (navigate the join in reverse — from media_items through the tag table, grouped by product via a subquery approach):

```typescript
supabase
  .from('media_product_tags')
  .select('product_id, media_items!inner(id, label, type, storage_path, sort_order)')
  .not('media_items.storage_path', 'is', null)
  .order('media_items.sort_order', { ascending: true }),
```

Update the `mediaByProduct` builder to match the new shape. The raw rows now look like `{ product_id, media_items: { id, label, type, storage_path, sort_order } }`:

```typescript
const mediaByProduct = ((allMedia ?? []) as {
  product_id: string
  media_items: { id: string; label: string; type: string; storage_path: string; sort_order: number }
}[]).reduce<Record<string, ProductMediaItem[]>>((acc, row) => {
  const m = row.media_items
  if (!acc[row.product_id]) acc[row.product_id] = []
  acc[row.product_id].push({
    id: m.id,
    label: m.label,
    type: m.type as 'image' | 'video' | 'pdf',
    storage_path: m.storage_path,
    sort_order: m.sort_order,
    thumbnailUrl: thumbnailUrlMap[m.storage_path],
  })
  return acc
}, {})
```

Update `imageMediaItems` to read from the new shape:

```typescript
const imageMediaItems = ((allMedia ?? []) as {
  product_id: string
  media_items: { type: string; storage_path: string }
}[]).filter(row => row.media_items.type === 'image')
```

And `thumbnailUrlMap` population:

```typescript
const signed = await Promise.all(
  imageMediaItems.map(row =>
    supabase.storage.from('product-media')
      .createSignedUrl(row.media_items.storage_path, 3600, { transform: { width: 400, quality: 80, resize: 'contain' } })
      .then(({ data }) => data ? { path: row.media_items.storage_path, url: data.signedUrl } : null)
  )
)
for (const item of signed) {
  if (item) thumbnailUrlMap[item.path] = item.url
}
```

- [ ] **Step 2: Update `src/components/catalog/CatalogDetailMedia.tsx`**

**2a.** Change the import:

```typescript
import { createProductMedia, saveProductMediaPath, deleteProductMedia } from '@/app/catalog/actions'
```

stays the same — but `deleteProductMedia` now accepts `(mediaItemId, productId)` instead of `(id, storagePath)`.

**2b.** Add a `productId` prop to `ProductMediaSection`:

```typescript
function ProductMediaSection({ productId, media: initialMedia }: { productId: string; media: ProductMediaItem[] }) {
```

(No change — `productId` was already a prop.)

**2c.** Update `confirmDelete` to pass `productId` instead of `storagePath`:

```typescript
async function confirmDelete(item: ProductMediaItem) {
  const result = await deleteProductMedia(item.id, productId)
  if ('error' in result) return
  setItems(prev => prev.filter(m => m.id !== item.id))
  setConfirmDeleteId(null)
}
```

**2d.** Add PDF tile in the grid (inside the `items.map` block, after the video branch):

```typescript
{item.type === 'image' && item.thumbnailUrl ? (
  <img src={item.thumbnailUrl} alt={item.label} className="pt-media-thumb-img" loading="lazy" />
) : item.type === 'video' ? (
  <div className="pt-media-thumb-video">
    <span className="pt-media-play-icon">▶</span>
  </div>
) : (
  <div className="pt-media-thumb-pdf">
    <span className="pt-media-pdf-icon">PDF</span>
  </div>
)}
```

**2e.** Add `createProductMedia` call to handle PDFs — update the `onFilePick` accept and the `upload` function's `ext` fallback:

Update the `imageInputRef` accept to remain `image/jpeg,image/png,image/webp`. Add a `pdfInputRef`:

```typescript
const pdfInputRef = useRef<HTMLInputElement>(null)
```

Add PDF input in the header:
```tsx
<input ref={pdfInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => onFilePick(e, 'pdf')} />
<button className="pt-link" onClick={() => pdfInputRef.current?.click()}>+ PDF</button>
```

Update `upload()` ext fallback:
```typescript
const ext = pendingFile.file.name.split('.').pop() ?? (pendingFile.type === 'image' ? 'jpg' : pendingFile.type === 'video' ? 'mp4' : 'pdf')
```

**2f.** Add "Manage in library →" link in the card header:

```tsx
<header className="pt-card-hd">
  <div>
    <h3>Media</h3>
    <p>{items.length} item{items.length !== 1 ? 's' : ''}</p>
  </div>
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <a href={`/media?product=${productId}`} className="pt-link" style={{ fontSize: 11 }}>
      Manage in library →
    </a>
    {/* existing + Image, + Video buttons */}
    ...
  </div>
</header>
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```

- [ ] **Step 5: Commit**

```bash
git add src/app/catalog/page.tsx src/components/catalog/CatalogDetailMedia.tsx
git commit -m "feat: catalog media tab reads from media_items via join table, delete untags only"
```

---

## Task 9: ProductInfoPicker — Browse library tab

**Files:**
- Modify: `src/components/inbox/ProductInfoPicker.tsx`

The picker currently queries `product_media(...)` directly. After migration, that table is gone. Replace with `media_product_tags(media_items(...))` and add a "Browse library" tab.

- [ ] **Step 1: Update the product media query in `ProductInfoPicker.tsx`**

Change the `products` fetch select from:

```typescript
product_media(id, label, type, storage_path, sort_order)
```

To:

```typescript
media_product_tags(media_items(id, label, type, storage_path, sort_order))
```

Update the `media` mapping in the product mapper:

```typescript
media: Array.isArray(p.media_product_tags)
  ? (p.media_product_tags as { media_items: Record<string, unknown> }[])
      .map(t => t.media_items as ProductMediaItem)
      .filter(m => m.storage_path)
      .sort((a, b) => a.sort_order - b.sort_order)
  : [],
```

- [ ] **Step 2: Add `libraryItems` state and fetch for the Browse tab**

Add state at the top of `ProductInfoPicker`:

```typescript
const [activeTab, setActiveTab] = useState<'product' | 'library'>('product')
const [libraryItems, setLibraryItems] = useState<{ id: string; label: string; type: string; storage_path: string }[]>([])
const [libraryQuery, setLibraryQuery] = useState('')
const [libraryTypeFilter, setLibraryTypeFilter] = useState<'all' | 'image' | 'video' | 'pdf'>('all')
const [libraryLoaded, setLibraryLoaded] = useState(false)
```

Add a `useEffect` that loads library items when the Browse tab is opened:

```typescript
useEffect(() => {
  if (activeTab !== 'library' || libraryLoaded) return
  supabase
    .from('media_items')
    .select('id, label, type, storage_path')
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: false })
    .then(({ data }) => {
      if (data) setLibraryItems(data as { id: string; label: string; type: string; storage_path: string }[])
      setLibraryLoaded(true)
    })
}, [activeTab, libraryLoaded, supabase])
```

- [ ] **Step 3: Add tab UI to the picker header**

In the `pt-pip-hd` div, after the title, add tabs:

```tsx
<div className="pt-pip-tabs">
  <button
    className={`pt-pip-tab${activeTab === 'product' ? ' is-on' : ''}`}
    onClick={() => setActiveTab('product')}
  >
    Product
  </button>
  <button
    className={`pt-pip-tab${activeTab === 'library' ? ' is-on' : ''}`}
    onClick={() => setActiveTab('library')}
  >
    Browse library
  </button>
</div>
```

- [ ] **Step 4: Render the Browse library tab body**

In the `pt-pip-body` div, conditionally render based on `activeTab`:

```tsx
{activeTab === 'product' ? (
  /* existing product picker content — unchanged */
  <>
    <div className="pt-pip-sidebar">...</div>
    <div className="pt-pip-detail">...</div>
  </>
) : (
  <div className="pt-pip-library">
    <div style={{ display: 'flex', gap: 6, padding: '0 0 10px', flexWrap: 'wrap' }}>
      <input
        className="pt-pip-search"
        placeholder="Search…"
        value={libraryQuery}
        onChange={e => setLibraryQuery(e.target.value)}
        autoFocus
      />
      {(['all', 'image', 'video', 'pdf'] as const).map(t => (
        <button
          key={t}
          className={`pt-media-lib-pill${libraryTypeFilter === t ? ' is-on' : ''}`}
          onClick={() => setLibraryTypeFilter(t)}
        >
          {t === 'all' ? 'All' : t === 'image' ? 'Images' : t === 'video' ? 'Videos' : 'PDFs'}
        </button>
      ))}
    </div>
    <div className="pt-pip-lib-grid">
      {libraryItems
        .filter(m =>
          (libraryTypeFilter === 'all' || m.type === libraryTypeFilter) &&
          m.label.toLowerCase().includes(libraryQuery.toLowerCase())
        )
        .map(m => (
          <button
            key={m.id}
            className="pt-pip-lib-tile"
            onClick={() => {
              onAttachFile(m.storage_path, m.label, 'product-media')
              onClose()
            }}
          >
            <div className="pt-pip-lib-tile-icon">
              {m.type === 'image' ? '🖼' : m.type === 'video' ? '▶' : '📄'}
            </div>
            <div className="pt-pip-lib-tile-label">{m.label}</div>
          </button>
        ))}
    </div>
  </div>
)}
```

- [ ] **Step 5: Add tab + library CSS to `styles/media.css`**

Append to `styles/media.css`:

```css
/* ── ProductInfoPicker library tab ─────────────────────────────────────────── */
.pt-pip-tabs {
  display: flex;
  gap: 0;
  border-bottom: 0.5px solid var(--pt-line);
  margin: 0 -1px;
}
.pt-pip-tab {
  padding: 6px 14px;
  font-size: 12px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--pt-fg-3);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.1s;
}
.pt-pip-tab.is-on {
  color: var(--pt-fg);
  border-bottom-color: var(--pt-accent);
}
.pt-pip-library {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  overflow: hidden;
}
.pt-pip-lib-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 8px;
  overflow-y: auto;
  flex: 1;
}
.pt-pip-lib-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border-radius: var(--pt-radius-sm);
  border: 0.5px solid var(--pt-line);
  background: none;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
  text-align: center;
}
.pt-pip-lib-tile:hover {
  background: oklch(from var(--pt-fg) l c h / 0.05);
  border-color: oklch(from var(--pt-fg) l c h / 0.2);
}
.pt-pip-lib-tile-icon { font-size: 22px; line-height: 1; }
.pt-pip-lib-tile-label {
  font-size: 10px;
  color: var(--pt-fg-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Run all tests**

```bash
npm run test:run
```

- [ ] **Step 8: Commit**

```bash
git add src/components/inbox/ProductInfoPicker.tsx styles/media.css
git commit -m "feat: ProductInfoPicker — browse library tab, fix media query for new schema"
```

---

## Verification

1. **Nav:** `/media` appears in the sidebar between Vault and Settings. Clicking navigates correctly.
2. **Library page:** Grid shows all tenant media. Type pills filter correctly. Product dropdown filters to tagged items only. "Untagged" shows items with no product associations.
3. **Upload:** Click Upload → Image/Video/PDF sub-menu appears. Pick a file → it appears in the grid.
4. **Item modal:** Click a tile → modal opens. Edit label → blur saves. "+ Add product" typeahead shows matching products and tags on select. ✕ on a tag removes it. Delete → confirmation → item removed from grid and storage.
5. **Catalog Media tab:** Still shows items tagged to each product. Delete button **untags** the item (it remains in `/media`). "Manage in library →" link navigates to `/media?product={id}`. PDF tiles render with "PDF" icon.
6. **Inbox composer:** Flask button → "Browse library" tab shows all media items. Clicking one attaches it to the message and closes the picker.
7. **Existing product media:** All previously uploaded product images still appear in both the catalog tab and the library.
