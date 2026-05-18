# Catalog Detail Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganise the catalog product detail panel into four tabs (Overview · Protocol · Media · Insights) by extracting existing sections into dedicated component files and adding a tab bar with URL state tracking.

**Architecture:** `CatalogDetail` becomes a shell that renders a tab bar and the active tab component. Each tab component is extracted into its own file. No visual changes to any section — same cards, same styles. Tab state is held in local state, synced to `?tab=` URL param via `router.replace`. Shared constants and `stockFlag` move to `src/lib/catalog-utils.ts`.

**Tech Stack:** Next.js 15 App Router, React `useSearchParams` / `useRouter`, `pt-*` CSS. No new packages.

---

## File Map

| File | Change |
|------|--------|
| `src/lib/catalog-utils.ts` | **New** — `stockFlag`, `LOW_THRESHOLD`, `CRITICAL_THRESHOLD`, `BAR_MAX` |
| `src/components/catalog/CatalogDetailOverview.tsx` | **New** — stock alert, stats grid, batches (`MiniSparkline`, `AddBatchForm`, `BatchRow` moved here) |
| `src/components/catalog/CatalogDetailProtocol.tsx` | **New** — `ProtocolSection` moved here |
| `src/components/catalog/CatalogDetailMedia.tsx` | **New** — `ProductMediaSection` moved here |
| `src/components/catalog/CatalogDetailInsights.tsx` | **New** — co-products query + "Frequently ordered together" section |
| `src/components/catalog/CatalogView.tsx` | **Modify** — remove extracted code, add tab bar + routing to `CatalogDetail`, import new components |
| `styles/catalog.css` | **Modify** — add `pt-cat-tabs`, `pt-cat-tab`, `pt-cat-tab.is-active` |

---

## Task 1: Shared Utilities

**Files:**
- Create: `src/lib/catalog-utils.ts`
- Modify: `src/components/catalog/CatalogView.tsx`

- [ ] **Step 1: Create `src/lib/catalog-utils.ts`**

```typescript
export const LOW_THRESHOLD = 25
export const CRITICAL_THRESHOLD = 10
export const BAR_MAX = 200

export function stockFlag(stock: number): 'oos' | 'critical' | 'low' | undefined {
  if (stock === 0) return 'oos'
  if (stock <= CRITICAL_THRESHOLD) return 'critical'
  if (stock <= LOW_THRESHOLD) return 'low'
  return undefined
}
```

- [ ] **Step 2: Update `CatalogView.tsx` to import from `catalog-utils.ts`**

Remove the three const declarations and the `stockFlag` function that currently live at lines ~879–890 of `CatalogView.tsx`:

```typescript
// DELETE these lines from CatalogView.tsx:
const LOW_THRESHOLD = 25
const CRITICAL_THRESHOLD = 10
const BAR_MAX = 200

function stockFlag(stock: number): 'oos' | 'critical' | 'low' | undefined {
  if (stock === 0) return 'oos'
  if (stock <= CRITICAL_THRESHOLD) return 'critical'
  if (stock <= LOW_THRESHOLD) return 'low'
  return undefined
}
```

Add to the imports at the top of `CatalogView.tsx`:
```typescript
import { stockFlag, LOW_THRESHOLD, BAR_MAX } from '@/lib/catalog-utils'
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors in the modified files. (4 pre-existing errors in test files are fine.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/catalog-utils.ts src/components/catalog/CatalogView.tsx
git commit -m "refactor: extract stockFlag and inventory constants to catalog-utils"
```

---

## Task 2: Tab Bar CSS + State

**Files:**
- Modify: `src/components/catalog/CatalogView.tsx`
- Modify: `styles/catalog.css`

This task adds the tab bar to `CatalogDetail` and wires up URL-tracked tab state. The existing content sections are NOT moved yet — they stay below the tab bar temporarily. The tab bar renders but only Overview is active and all content shows underneath (we split content across tabs in Tasks 3–4).

- [ ] **Step 1: Add `useRouter` import to `CatalogView.tsx`**

Find the existing import line:
```typescript
import { useSearchParams } from 'next/navigation'
```

Replace with:
```typescript
import { useSearchParams, useRouter } from 'next/navigation'
```

- [ ] **Step 2: Add tab state and tab bar to `CatalogDetail`**

At the top of `CatalogDetail`, add after the existing state declarations (after `const [editSaving, setEditSaving] = useState(false)`):

```typescript
  const router = useRouter()
  const searchParams = useSearchParams()
  const VALID_TABS = ['overview', 'protocol', 'media', 'insights'] as const
  type Tab = typeof VALID_TABS[number]

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get('tab') as Tab | null
    return t && (VALID_TABS as readonly string[]).includes(t) ? t : 'overview'
  })

  // Reset to overview when product changes
  useEffect(() => {
    setActiveTab('overview')
  }, [product.id])

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`/catalog?${params.toString()}`)
  }
```

- [ ] **Step 3: Add tab bar JSX to `CatalogDetail`**

In the JSX of `CatalogDetail`, find the closing `</header>` / `{flag && ...}` block. The tab bar goes **between the header block and the first content section** (after the `{flag && ...}` stock alert). Insert:

```tsx
      {/* Tab bar */}
      <div className="pt-cat-tabs">
        {(['overview', 'protocol', 'media', 'insights'] as const).map(tab => (
          <button
            key={tab}
            className={`pt-cat-tab${activeTab === tab ? ' is-active' : ''}`}
            onClick={() => switchTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
```

- [ ] **Step 4: Add CSS to `styles/catalog.css`**

Append at the end of the file:

```css
/* ── Catalog detail tab bar ──────────────────────────────────────────────── */
.pt-cat-tabs {
  display: flex;
  border-bottom: 0.5px solid var(--pt-line);
  padding: 0 16px;
  flex-shrink: 0;
  background: var(--pt-bg-side);
}
.pt-cat-tab {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--pt-fg-3);
  cursor: pointer;
  border: none;
  background: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -0.5px;
  transition: color 0.12s;
  white-space: nowrap;
}
.pt-cat-tab:hover { color: var(--pt-fg); }
.pt-cat-tab.is-active {
  color: var(--pt-accent-fg);
  border-bottom-color: var(--pt-accent);
  font-weight: 600;
}
.pt-cat-detail-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/catalog/CatalogView.tsx styles/catalog.css
git commit -m "feat: tab bar in catalog detail panel with URL state"
```

---

## Task 3: CatalogDetailOverview

**Files:**
- Create: `src/components/catalog/CatalogDetailOverview.tsx`
- Modify: `src/components/catalog/CatalogView.tsx`

Extract the Overview tab content (stock alert + stats grid + batches section) and the `MiniSparkline`, `AddBatchForm`, `BatchRow` helper components that support it.

- [ ] **Step 1: Create `src/components/catalog/CatalogDetailOverview.tsx`**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { Icons } from '@/lib/icons'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatAmount, formatAmountCompact } from '@/lib/currency'
import { createBatch, saveBatchCoaPath, updateBatch, deleteBatch } from '@/app/catalog/actions'
import type { CatalogProduct, DbBatch } from '@/types/catalog'
import { grossMargin } from '@/types/catalog'
import { stockFlag, LOW_THRESHOLD, BAR_MAX } from '@/lib/catalog-utils'

// ── Velocity sparkline ────────────────────────────────────────────────────────
function MiniSparkline({ data, width = 44, height = 16 }: { data: number[]; width?: number; height?: number }) {
  const max = Math.max(...data, 1)
  const step = (width - 1) / Math.max(1, data.length - 1)
  const pts = data.map((v, i) =>
    `${(i * step).toFixed(1)},${(height - (v / max) * height * 0.88).toFixed(1)}`
  ).join(' ')
  const lastX = ((data.length - 1) * step).toFixed(1)
  const area = `0,${height} ${pts} ${lastX},${height}`
  return (
    <svg className="pt-cat-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polygon points={area} fill="var(--pt-accent-soft)" stroke="none" />
      <polyline points={pts} fill="none" stroke="var(--pt-accent)" strokeWidth="1.2"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Add batch form ─────────────────────────────────────────────────────────────
function AddBatchForm({ productId, onDone }: { productId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [form, setForm] = useState({ batchNumber: '', stock: '', expiresAt: '' })
  const [coaFile, setCoaFile] = useState<File | null>(null)
  const fileInputRef = { current: null as HTMLInputElement | null }

  const submit = () => {
    setError('')
    const stock = parseInt(form.stock)
    if (!form.batchNumber.trim()) { setError('Batch number is required'); return }
    if (isNaN(stock) || stock < 0) { setError('Stock must be a non-negative number'); return }
    startTransition(async () => {
      const result = await createBatch({
        productId,
        batchNumber: form.batchNumber.trim(),
        stock,
        expiresAt: form.expiresAt || undefined,
      })
      if ('error' in result) { setError(result.error); return }
      if (coaFile && result.coaUploadUrl) {
        await fetch(result.coaUploadUrl, {
          method: 'PUT', body: coaFile, headers: { 'Content-Type': 'application/pdf' },
        })
        await saveBatchCoaPath(result.batchId, result.coaPath)
      }
      onDone()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && <p style={{ fontSize: 11, color: 'var(--pt-danger)', margin: 0 }}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label className="pt-sku-lbl">Lot / Batch number</label>
          <input className="pt-input" value={form.batchNumber}
            onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))} />
        </div>
        <div>
          <label className="pt-sku-lbl">Initial stock</label>
          <input className="pt-input" type="number" min="0" value={form.stock}
            onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
        </div>
        <div>
          <label className="pt-sku-lbl">Expiry date <span className="pt-sku-lbl-opt">optional</span></label>
          <input className="pt-input" type="date" value={form.expiresAt}
            onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
        </div>
        <div>
          <label className="pt-sku-lbl">COA PDF <span className="pt-sku-lbl-opt">optional</span></label>
          <input ref={el => { fileInputRef.current = el }} type="file" accept="application/pdf"
            style={{ display: 'none' }} onChange={e => setCoaFile(e.target.files?.[0] ?? null)} />
          <button className="pt-input" style={{ textAlign: 'left', cursor: 'pointer', color: coaFile ? 'var(--pt-fg)' : 'var(--pt-fg-4)' }}
            onClick={() => fileInputRef.current?.click()}>
            {coaFile ? coaFile.name : 'Upload COA PDF'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="pt-btn pt-btn-primary" onClick={submit} disabled={pending}>
          {pending ? 'Adding…' : 'Add batch'}
        </button>
      </div>
    </div>
  )
}

// ── Batch row ────────────────────────────────────────────────────────────────
async function openCoa(coaPath: string) {
  const res = await fetch(`/api/catalog/coa-url?path=${encodeURIComponent(coaPath)}`)
  if (!res.ok) return
  const { url } = await res.json() as { url: string }
  window.open(url, '_blank', 'noopener')
}

function BatchRow({ batch }: { batch: DbBatch }) {
  const [editing, setEditing] = useState(false)
  const [stock, setStock] = useState(String(batch.stock))
  const [expiresAt, setExpiresAt] = useState(batch.expires_at?.slice(0, 10) ?? '')
  const [pending, startTransition] = useTransition()

  const save = () => {
    startTransition(async () => {
      await updateBatch(batch.id, { stock: parseInt(stock) || 0, expiresAt: expiresAt || null })
      setEditing(false)
    })
  }

  const remove = () => {
    if (!confirm(`Delete batch ${batch.batch_number}?`)) return
    startTransition(async () => { await deleteBatch(batch.id) })
  }

  const added = new Date(batch.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  const expires = batch.expires_at
    ? new Date(batch.expires_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    : '—'

  if (editing) {
    return (
      <tr>
        <td className="mono">{batch.batch_number}</td>
        <td>{added}</td>
        <td><input className="pt-input" style={{ width: 60, padding: '2px 6px', fontSize: 11 }} value={stock} onChange={e => setStock(e.target.value)} /></td>
        <td><input className="pt-input" type="date" style={{ fontSize: 11, padding: '2px 6px' }} value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></td>
        <td>
          <button className="pt-link" style={{ fontSize: 11 }} onClick={save} disabled={pending}>Save</button>
          {' '}
          <button className="pt-link" style={{ fontSize: 11 }} onClick={() => setEditing(false)}>Cancel</button>
        </td>
      </tr>
    )
  }

  return (
    <tr onDoubleClick={() => setEditing(true)} style={{ cursor: 'default' }}>
      <td className="mono">{batch.batch_number}</td>
      <td>{added}</td>
      <td>{batch.stock}</td>
      <td style={{ color: batch.expires_at ? 'inherit' : 'var(--pt-fg-4)' }}>{expires}</td>
      <td>
        {batch.coa_path
          ? <button className="pt-link" style={{ fontSize: 11 }} onClick={() => void openCoa(batch.coa_path!)}>View →</button>
          : <span style={{ color: 'var(--pt-fg-4)', fontSize: 11 }}>—</span>}
        {' '}
        <button className="pt-link" style={{ fontSize: 11, color: 'var(--pt-fg-4)' }} onClick={remove} title="Delete batch">
          <Icons.x size={10} />
        </button>
      </td>
    </tr>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────
export function CatalogDetailOverview({ product, baseCurrency }: {
  product: CatalogProduct
  baseCurrency: string
}) {
  const [showAddBatch, setShowAddBatch] = useState(false)
  const flag = stockFlag(product.totalStock)
  const barPct = Math.min(100, (product.totalStock / BAR_MAX) * 100)
  const thrPct = (LOW_THRESHOLD / BAR_MAX) * 100

  return (
    <>
      {flag && (
        <div className={`pt-cat-note ${flag === 'oos' ? 'pt-cat-note-critical' : 'pt-cat-note-low'}`}>
          <i className="pt-cat-note-dot" />
          <span>
            {flag === 'oos'
              ? 'Out of stock — reorder immediately.'
              : `Below threshold — ${product.totalStock} units remaining.`}
          </span>
        </div>
      )}

      <div className="pt-cat-stat-grid">
        <div className="pt-cat-stat">
          <div className="lbl">In Stock</div>
          <div className={`val ${flag === 'oos' ? 'is-zero' : flag ? 'is-warn' : ''}`}>
            {product.totalStock}<span className="u">units</span>
          </div>
          <div className="pt-cat-stock-bar" style={{ marginTop: 2 }}>
            <div className={`pt-cat-stock-fill ${flag ? `is-${flag}` : ''}`} style={{ width: `${barPct}%` }} />
            <div className="pt-cat-stock-thr" style={{ left: `${thrPct}%` }} />
          </div>
          <div className="pt-cat-stat-sub">threshold {LOW_THRESHOLD}</div>
        </div>
        <div className="pt-cat-stat">
          <div className="lbl">Velocity</div>
          {(() => {
            const wkTotal = product.velocity7d.reduce((s, v) => s + v, 0)
            return <>
              <div className="val">{wkTotal || '—'}<span className="u">/wk</span></div>
              <MiniSparkline data={product.velocity7d} width={110} height={28} />
              <div className="pt-cat-stat-sub">last 7 days</div>
            </>
          })()}
        </div>
        <div className="pt-cat-stat">
          <div className="lbl">Cover</div>
          {(() => {
            const dailyRate = product.velocity30dTotal / 30
            const cover = dailyRate > 0 ? Math.ceil(product.totalStock / dailyRate) : null
            return <>
              <div className="val">{cover ?? '—'}<span className="u">days</span></div>
              <div className="pt-cat-stat-sub">30d avg · {product.velocity30dTotal} units</div>
            </>
          })()}
        </div>
        <div className="pt-cat-stat">
          <div className="lbl">Unit Econ</div>
          <div className="val">{formatAmountCompact(product.unitPrice, baseCurrency)}</div>
          <div className="pt-cat-stat-sub">
            {product.costPrice != null ? `cost ${formatAmountCompact(product.costPrice, baseCurrency)}` : 'cost —'}
            {' · '}
            {(() => {
              const m = grossMargin(product.unitPrice, product.costPrice)
              return m !== null ? `margin ${m.toFixed(0)}%` : 'margin —'
            })()}
          </div>
        </div>
      </div>

      <section className="pt-card pt-cat-section">
        <header className="pt-card-hd">
          <div>
            <h3>Batches</h3>
            <p>{product.batches.length} batch{product.batches.length !== 1 ? 'es' : ''} · {product.totalStock} units total</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pt-link" onClick={() => setShowAddBatch(v => !v)}>
              {showAddBatch ? 'Cancel' : '+ Add batch'}
            </button>
          </div>
        </header>
        <div className="pt-card-body" style={{ padding: 0 }}>
          {showAddBatch && (
            <div style={{ padding: '12px 14px' }}>
              <AddBatchForm productId={product.id} onDone={() => setShowAddBatch(false)} />
            </div>
          )}
          {product.batches.length > 0 ? (
            <table className="pt-cat-batches">
              <thead>
                <tr><th>Lot</th><th>Added</th><th>Stock</th><th>Expires</th><th>COA</th></tr>
              </thead>
              <tbody>
                {product.batches.map(b => <BatchRow key={b.id} batch={b} />)}
              </tbody>
            </table>
          ) : (
            !showAddBatch && (
              <EmptyState
                size="sm"
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                    <rect x="4" y="3" width="16" height="18" rx="2"/>
                    <line x1="8" y1="8" x2="16" y2="8" opacity="0.5"/>
                    <line x1="8" y1="12" x2="14" y2="12" opacity="0.35"/>
                    <line x1="8" y1="16" x2="13" y2="16" opacity="0.25"/>
                  </svg>
                }
                title="No batches yet"
                body="Add a batch to track stock and expiry."
              />
            )
          )}
        </div>
      </section>
    </>
  )
}
```

- [ ] **Step 2: Wire `CatalogDetailOverview` into `CatalogDetail` in `CatalogView.tsx`**

In `CatalogView.tsx`, add the import at the top:
```typescript
import { CatalogDetailOverview } from '@/components/catalog/CatalogDetailOverview'
```

In `CatalogDetail`'s JSX, **remove** the following blocks (they now live in `CatalogDetailOverview`):
- The `{flag && <div className="pt-cat-note ...">}` stock alert block
- The `<div className="pt-cat-stat-grid">` block (all 4 stats)
- The batches `<section className="pt-card pt-cat-section">` block

**Replace** them with a tab content area that renders `CatalogDetailOverview` when `activeTab === 'overview'`:

```tsx
      {/* Tab content */}
      <div className="pt-cat-detail-body">
        {activeTab === 'overview' && (
          <CatalogDetailOverview product={product} baseCurrency={baseCurrency} />
        )}
        {activeTab === 'protocol' && (
          <ProtocolSection productId={product.id} protocol={protocol} />
        )}
        {activeTab === 'media' && (
          <ProductMediaSection productId={product.id} media={product.media} />
        )}
        {activeTab === 'insights' && (
          <div>{/* CatalogDetailInsights wired in Task 4 */}</div>
        )}
      </div>
```

Also remove `showAddBatch` and `setShowAddBatch` state from `CatalogDetail` (it moves to `CatalogDetailOverview`).

Also remove `MiniSparkline`, `AddBatchForm`, and `BatchRow` function definitions from `CatalogView.tsx` (they moved to `CatalogDetailOverview.tsx`).

Also remove `formatAmountCompact` from the import if it's no longer used in `CatalogView.tsx` — check first.

Also remove the `openCoa` standalone function from `CatalogView.tsx` (it moved into `CatalogDetailOverview.tsx` as a local function).

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors in the new files.

- [ ] **Step 4: Commit**

```bash
git add src/components/catalog/CatalogDetailOverview.tsx src/components/catalog/CatalogView.tsx
git commit -m "feat: extract Overview tab content to CatalogDetailOverview"
```

---

## Task 4: CatalogDetailProtocol, CatalogDetailMedia, CatalogDetailInsights

**Files:**
- Create: `src/components/catalog/CatalogDetailProtocol.tsx`
- Create: `src/components/catalog/CatalogDetailMedia.tsx`
- Create: `src/components/catalog/CatalogDetailInsights.tsx`
- Modify: `src/components/catalog/CatalogView.tsx`

- [ ] **Step 1: Create `src/components/catalog/CatalogDetailProtocol.tsx`**

`ProtocolSection` is a large component (~160 lines) currently defined inside `CatalogView.tsx` at lines ~902–1063. Move the entire function to this new file and export it.

Read lines 902–1063 of `CatalogView.tsx` verbatim — the entire `ProtocolSection` function — and place it in the new file with these additions:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { upsertProtocol } from '@/app/catalog/actions'
import { FREQUENCY_LABELS, FREQUENCY_OPTIONS } from '@/types/protocols'
import type { ProductProtocol, Frequency } from '@/types/protocols'

// [PASTE THE ENTIRE ProtocolSection FUNCTION HERE — do not change a single line of it]
// It starts with:
// function ProtocolSection({ productId, protocol }: { productId: string; protocol: ProductProtocol | null }) {
// Make it an exported function:

export function CatalogDetailProtocol({ productId, protocol }: {
  productId: string
  protocol: ProductProtocol | null
}) {
  // Thin wrapper — ProtocolSection is self-contained
  return <ProtocolSection productId={productId} protocol={protocol} />
}
```

- [ ] **Step 2: Create `src/components/catalog/CatalogDetailMedia.tsx`**

`ProductMediaSection` is defined in `CatalogView.tsx` at lines ~329–495. Move the entire function here.

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { createProductMedia, saveProductMediaPath, deleteProductMedia } from '@/app/catalog/actions'
import type { ProductMediaItem } from '@/types/catalog'

// [PASTE THE ENTIRE ProductMediaSection FUNCTION HERE — do not change a single line]
// Make it an exported function by renaming it:

export function CatalogDetailMedia({ productId, media }: {
  productId: string
  media: ProductMediaItem[]
}) {
  return <ProductMediaSection productId={productId} media={media} />
}
```

- [ ] **Step 3: Create `src/components/catalog/CatalogDetailInsights.tsx`**

This component owns the co-products query that currently lives in `CatalogDetail`. Move it out:

```typescript
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatAmount } from '@/lib/currency'
import type { CatalogProduct } from '@/types/catalog'
import { stockFlag } from '@/lib/catalog-utils'

export function CatalogDetailInsights({ product, products, baseCurrency }: {
  product: CatalogProduct
  products: CatalogProduct[]
  baseCurrency: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [coProducts, setCoProducts] = useState<{ product: CatalogProduct; count: number }[]>([])
  const [coLoading, setCoLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setCoLoading(true)
    setCoProducts([])
    async function load() {
      const { data: orderRows } = await supabase
        .from('order_items')
        .select('order_id')
        .eq('product_id', product.id)
      if (cancelled || !orderRows || orderRows.length === 0) {
        if (!cancelled) setCoLoading(false)
        return
      }
      const orderIds = [...new Set(orderRows.map(r => r.order_id))]
      const { data: coRows } = await supabase
        .from('order_items')
        .select('product_id')
        .in('order_id', orderIds)
        .neq('product_id', product.id)
      if (cancelled || !coRows) {
        if (!cancelled) setCoLoading(false)
        return
      }
      const freq: Record<string, number> = {}
      for (const row of coRows) {
        freq[row.product_id] = (freq[row.product_id] ?? 0) + 1
      }
      const sorted = Object.entries(freq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
      const result = sorted
        .map(([id, count]) => {
          const p = products.find(p => p.id === id)
          return p ? { product: p, count } : null
        })
        .filter((x): x is { product: CatalogProduct; count: number } => x !== null)
      if (!cancelled) { setCoProducts(result); setCoLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [product.id, supabase, products])

  if (coLoading) return null

  return (
    <section className="pt-card pt-cat-section">
      <header className="pt-card-hd">
        <div>
          <h3>Frequently ordered together</h3>
          <p>Based on order history</p>
        </div>
      </header>
      {coProducts.length === 0 ? (
        <div style={{ padding: '14px 14px 16px', color: 'var(--pt-fg-4)', fontSize: 12 }}>
          No data yet — will populate as orders come in.
        </div>
      ) : (
        <div className="pt-cat-affinity-body">
          {coProducts.map(({ product: p, count }) => {
            const pFlag = stockFlag(p.totalStock)
            return (
              <div key={p.id} className="pt-cat-aff">
                <span className="pt-cat-cat-pill" data-cat={p.productFamily}>{p.productFamily}</span>
                <div>
                  <div className="pt-cat-aff-name">{p.name}</div>
                  <div className="pt-cat-aff-sub mono">{p.sku} · {formatAmount(p.unitPrice, baseCurrency)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                  <div className={`pt-cat-aff-stock mono ${pFlag ? 'is-low' : ''}`}>{p.totalStock}</div>
                  <div style={{ fontSize: 10, color: 'var(--pt-fg-4)' }}>{count}×</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Wire all tabs in `CatalogView.tsx`**

Add imports to `CatalogView.tsx`:
```typescript
import { CatalogDetailProtocol } from '@/components/catalog/CatalogDetailProtocol'
import { CatalogDetailMedia } from '@/components/catalog/CatalogDetailMedia'
import { CatalogDetailInsights } from '@/components/catalog/CatalogDetailInsights'
```

In `CatalogDetail`, update the tab content area to replace the placeholder `{activeTab === 'protocol'}` etc. with the real components:

```tsx
      {/* Tab content */}
      <div className="pt-cat-detail-body">
        {activeTab === 'overview' && (
          <CatalogDetailOverview product={product} baseCurrency={baseCurrency} />
        )}
        {activeTab === 'protocol' && (
          <CatalogDetailProtocol productId={product.id} protocol={protocol} />
        )}
        {activeTab === 'media' && (
          <CatalogDetailMedia productId={product.id} media={product.media} />
        )}
        {activeTab === 'insights' && (
          <CatalogDetailInsights product={product} products={products} baseCurrency={baseCurrency} />
        )}
      </div>
```

Remove from `CatalogView.tsx`:
- `ProtocolSection` function definition (moved to `CatalogDetailProtocol.tsx`)
- `ProductMediaSection` function definition (moved to `CatalogDetailMedia.tsx`)
- The co-products state and useEffect from `CatalogDetail` (moved to `CatalogDetailInsights.tsx`):
  - `const supabase = useMemo(() => createClient(), [])`
  - `const [coProducts, setCoProducts] = useState(...)`
  - `const [coLoading, setCoLoading] = useState(true)`
  - The entire `useEffect(() => { ... }, [product.id, supabase, products])` block
- The `{!coLoading && <section>...Frequently ordered together...</section>}` JSX block (moved to `CatalogDetailInsights`)
- The `<ProtocolSection ... />` render (replaced by tab content)
- The `<ProductMediaSection ... />` render (replaced by tab content)
- Now-unused imports: `createClient` (if no longer used elsewhere in the file), `FREQUENCY_LABELS`, `FREQUENCY_OPTIONS` (if moved to CatalogDetailProtocol)

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run tests**

```bash
npm run test:run -- src/lib/__tests__ src/app/api/catalog
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/catalog/CatalogDetailProtocol.tsx src/components/catalog/CatalogDetailMedia.tsx src/components/catalog/CatalogDetailInsights.tsx src/components/catalog/CatalogView.tsx
git commit -m "feat: extract Protocol, Media, Insights tabs — catalog detail now fully tabbed"
```

---

## Verification

1. Open `/catalog` — product list on the left is unchanged
2. Click a product — detail panel shows header (name, SKU, pill, Send info / Edit / Re-order) above the tab bar
3. Tab bar shows: Overview | Protocol | Media | Insights
4. **Overview tab** (default): stock alert (if applicable), 4-stat grid, batches table with "+ Add batch"
5. **Protocol tab**: existing protocol card with inline edit — looks identical to before
6. **Media tab**: existing media upload + thumbnail grid — looks identical to before
7. **Insights tab**: "Frequently ordered together" section
8. Clicking a tab updates the URL to `?tab=<name>`
9. Clicking a different product in the list resets to Overview tab
10. All existing functionality works: add batch, upload COA, edit product, send info, re-order
