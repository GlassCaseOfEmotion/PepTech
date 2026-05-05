'use client'

import { useState, useTransition, useMemo } from 'react'
import { Icons } from '@/lib/icons'
import { createProduct, createBatch, saveBatchCoaPath } from '@/app/catalog/actions'
import type { CatalogProduct, DbBatch } from '@/types/catalog'

// ── Mini sparkline (static placeholder — replace with real 7d velocity data) ─
function MiniSparkline({ width = 44, height = 16 }: { width?: number; height?: number }) {
  return (
    <svg className="pt-cat-spark" width={width} height={height} viewBox="0 0 44 16">
      <polyline
        points="0,10 6,8 12,11 18,6 24,9 30,7 36,10 44,8"
        fill="none" stroke="var(--pt-ok)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

// ── COA PDF opener ───────────────────────────────────────────────────────────
async function openCoa(coaPath: string) {
  const res = await fetch(`/api/catalog/coa-url?path=${encodeURIComponent(coaPath)}`)
  if (!res.ok) return
  const { url } = await res.json() as { url: string }
  window.open(url, '_blank', 'noopener')
}

// ── Add product form ─────────────────────────────────────────────────────────
function AddProductForm({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [form, setForm] = useState({ sku: '', name: '', productFamily: '', unitPrice: '' })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = () => {
    setError('')
    startTransition(async () => {
      const result = await createProduct({
        sku: form.sku,
        name: form.name,
        productFamily: form.productFamily,
        unitPrice: parseFloat(form.unitPrice),
      })
      if ('error' in result) { setError(result.error); return }
      onDone()
    })
  }

  return (
    <div className="pt-cat-form">
      <div className="pt-cat-form-grid">
        <input className="pt-input" placeholder="SKU (e.g. BPC-157-5MG)" value={form.sku} onChange={set('sku')} />
        <input className="pt-input" placeholder="Name (e.g. BPC-157 5mg)" value={form.name} onChange={set('name')} />
        <input className="pt-input" placeholder="Family (e.g. BPC-157)" value={form.productFamily} onChange={set('productFamily')} />
        <input className="pt-input" placeholder="Price (USD)" type="number" min="0" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} />
      </div>
      {error && <div className="pt-cat-form-err">{error}</div>}
      <div className="pt-cat-form-actions">
        <button className="pt-btn pt-btn-ghost" onClick={onDone} disabled={pending}>Cancel</button>
        <button className="pt-btn pt-btn-primary" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : 'Add product'}
        </button>
      </div>
    </div>
  )
}

// ── Add batch form ───────────────────────────────────────────────────────────
function AddBatchForm({ productId, onDone }: { productId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [form, setForm] = useState({ batchNumber: '', stock: '', expiresAt: '' })
  const [coaFile, setCoaFile] = useState<File | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = () => {
    setError('')
    startTransition(async () => {
      const result = await createBatch({
        productId,
        batchNumber: form.batchNumber,
        stock: parseInt(form.stock, 10) || 0,
        expiresAt: form.expiresAt || undefined,
      })
      if ('error' in result) { setError(result.error); return }
      if (coaFile && result.coaUploadUrl) {
        const uploadRes = await fetch(result.coaUploadUrl, {
          method: 'PUT',
          body: coaFile,
          headers: { 'Content-Type': 'application/pdf' },
        })
        if (!uploadRes.ok) {
          setError('COA upload failed — please try again')
          return
        }
        await saveBatchCoaPath(result.batchId, result.coaPath)
      }
      onDone()
    })
  }

  return (
    <div className="pt-cat-form">
      <div className="pt-cat-form-grid">
        <input className="pt-input" placeholder="Batch number (e.g. BPC-0408-B)" value={form.batchNumber} onChange={set('batchNumber')} />
        <input className="pt-input" placeholder="Stock (units)" type="number" min="0" value={form.stock} onChange={set('stock')} />
        <input className="pt-input" placeholder="Expiry date" type="date" value={form.expiresAt} onChange={set('expiresAt')} />
        <label className="pt-cat-coa-upload">
          <Icons.doc size={13} />
          <span>{coaFile ? coaFile.name : 'Upload COA PDF'}</span>
          <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => setCoaFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      {error && <div className="pt-cat-form-err">{error}</div>}
      <div className="pt-cat-form-actions">
        <button className="pt-btn pt-btn-ghost" onClick={onDone} disabled={pending}>Cancel</button>
        <button className="pt-btn pt-btn-primary" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : 'Add batch'}
        </button>
      </div>
    </div>
  )
}

// ── Batch row ────────────────────────────────────────────────────────────────
function BatchRow({ batch }: { batch: DbBatch }) {
  const added = new Date(batch.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const expires = batch.expires_at
    ? new Date(batch.expires_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    : '—'
  return (
    <tr>
      <td className="mono" style={{ color: 'var(--pt-accent)', fontWeight: 500 }}>{batch.batch_number}</td>
      <td style={{ color: 'var(--pt-fg-3)' }}>{added}</td>
      <td className="mono" style={{ fontWeight: 500 }}>{batch.stock}</td>
      <td style={{ color: 'var(--pt-fg-3)' }}>{expires}</td>
      <td>
        {batch.coa_path
          ? <button className="pt-od-coa" onClick={() => void openCoa(batch.coa_path!)}>View →</button>
          : <span style={{ color: 'var(--pt-fg-4)', fontSize: 11 }}>—</span>}
      </td>
    </tr>
  )
}

// ── Product detail panel ─────────────────────────────────────────────────────
function CatalogDetail({ product, products }: { product: CatalogProduct; products: CatalogProduct[] }) {
  const [showAddBatch, setShowAddBatch] = useState(false)
  const flag = stockFlag(product.totalStock)
  const barPct = Math.min(100, (product.totalStock / BAR_MAX) * 100)
  const thrPct = (LOW_THRESHOLD / BAR_MAX) * 100

  const paired = products.filter(p => p.id !== product.id && p.productFamily === product.productFamily).slice(0, 3)

  return (
    <aside className="pt-cat-detail">
      <header className="pt-cat-detail-hd">
        <div>
          <span className="pt-cat-cat-pill" data-cat={product.productFamily}>{product.productFamily}</span>
          <h2>{product.name}</h2>
          <div className="pt-cat-sku mono">{product.sku}</div>
        </div>
        <div className="pt-cat-detail-actions">
          <button className="pt-btn pt-btn-ghost">Edit</button>
          <button className="pt-btn pt-btn-primary">Re-order</button>
        </div>
      </header>

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
          <div className="val">—<span className="u">/wk</span></div>
          <MiniSparkline width={110} height={28} />
          <div className="pt-cat-stat-sub">last 7 days</div>
        </div>
        <div className="pt-cat-stat">
          <div className="lbl">Cover</div>
          <div className="val">—<span className="u">days</span></div>
          <div className="pt-cat-stat-sub">at current velocity</div>
        </div>
        <div className="pt-cat-stat">
          <div className="lbl">Unit Econ</div>
          <div className="val">${product.unitPrice.toFixed(0)}</div>
          <div className="pt-cat-stat-sub">cost — · margin —</div>
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
            !showAddBatch && <div className="pt-cat-empty"><span>No batches yet.</span></div>
          )}
        </div>
      </section>

      {paired.length > 0 && (
        <section className="pt-card pt-cat-section">
          <header className="pt-card-hd">
            <div>
              <h3>Often paired with</h3>
              <p>Other {displayFamily(product.productFamily)} products</p>
            </div>
          </header>
          <div className="pt-cat-affinity-body">
            {paired.map(p => {
              const pFlag = stockFlag(p.totalStock)
              return (
                <div key={p.id} className="pt-cat-aff">
                  <span className="pt-cat-cat-pill" data-cat={p.productFamily}>{p.productFamily}</span>
                  <div>
                    <div className="pt-cat-aff-name">{p.name}</div>
                    <div className="pt-cat-aff-sub mono">{p.sku} · ${p.unitPrice}</div>
                  </div>
                  <div className={`pt-cat-aff-stock mono ${pFlag ? 'is-low' : ''}`}>{p.totalStock}</div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </aside>
  )
}

const LOW_THRESHOLD = 25
const CRITICAL_THRESHOLD = 10
const BAR_MAX = 200

function stockFlag(stock: number): 'oos' | 'critical' | 'low' | undefined {
  if (stock === 0) return 'oos'
  if (stock <= CRITICAL_THRESHOLD) return 'critical'
  if (stock <= LOW_THRESHOLD) return 'low'
  return undefined
}

const FAMILY_DISPLAY: Record<string, string> = {
  'GLP-1': 'GLP-1', 'HEALING': 'Healing', 'COSMETIC': 'Cosmetic', 'MITO': 'Mito', 'GH': 'GH',
}
function displayFamily(f: string) { return FAMILY_DISPLAY[f] ?? f }

function flagOrder(f: ReturnType<typeof stockFlag>) {
  return f === 'oos' ? 0 : f === 'critical' ? 1 : f === 'low' ? 2 : 3
}

// ── Main catalog view ────────────────────────────────────────────────────────
export function CatalogView({ products }: { products: CatalogProduct[] }) {
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? '')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [familyFilter, setFamilyFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('attention')

  const allFamilies = useMemo(() =>
    Array.from(new Set(products.map(p => p.productFamily))).sort()
  , [products])

  const needsAttentionCount = useMemo(() =>
    products.filter(p => stockFlag(p.totalStock) !== undefined).length
  , [products])
  const totalValue = products.reduce((s, p) => s + p.totalStock * p.unitPrice, 0)

  const filtered = useMemo(() => {
    let result = products
    if (familyFilter === 'attention') result = result.filter(p => stockFlag(p.totalStock) !== undefined)
    else if (familyFilter !== 'all') result = result.filter(p => p.productFamily === familyFilter)
    return result
  }, [products, familyFilter])

  const families = useMemo(() =>
    Array.from(new Set(filtered.map(p => p.productFamily))).sort()
  , [filtered])

  const byFamily = useMemo(() => {
    const sortFn = sortBy === 'attention'
      ? (a: CatalogProduct, b: CatalogProduct) => flagOrder(stockFlag(a.totalStock)) - flagOrder(stockFlag(b.totalStock)) || a.name.localeCompare(b.name)
      : sortBy === 'stock-asc' ? (a: CatalogProduct, b: CatalogProduct) => a.totalStock - b.totalStock
      : sortBy === 'stock-desc' ? (a: CatalogProduct, b: CatalogProduct) => b.totalStock - a.totalStock
      : (a: CatalogProduct, b: CatalogProduct) => a.name.localeCompare(b.name)
    return Object.fromEntries(families.map(f => [f, [...filtered.filter(p => p.productFamily === f)].sort(sortFn)]))
  }, [families, filtered, sortBy])

  const selected = products.find(p => p.id === selectedId) ?? products[0]

  return (
    <div className="pt-cat">
      <div className="pt-cat-hd">
        <div>
          <h1>Catalog</h1>
          <p>{products.length} SKUs · {needsAttentionCount} need attention · ${Math.round(totalValue).toLocaleString()} on hand</p>
        </div>
        <div className="pt-cat-hd-actions">
          <button className="pt-btn pt-btn-ghost">
            <Icons.gear size={12} /> Import COA
          </button>
          <button className="pt-btn pt-btn-primary" onClick={() => setShowAddProduct(v => !v)}>
            <Icons.plus size={12} /> {showAddProduct ? 'Cancel' : 'New SKU'}
          </button>
        </div>
      </div>

      {showAddProduct && (
        <div style={{ padding: '0 22px 16px' }}>
          <AddProductForm onDone={() => setShowAddProduct(false)} />
        </div>
      )}

      <div className="pt-cat-toolbar">
        <div className="pt-cat-filters">
          <button className={`pt-cat-filter ${familyFilter === 'all' ? 'is-active' : ''}`} onClick={() => setFamilyFilter('all')}>All</button>
          {needsAttentionCount > 0 && (
            <button className={`pt-cat-filter ${familyFilter === 'attention' ? 'is-active' : ''}`} onClick={() => setFamilyFilter('attention')}>
              Needs attention · {needsAttentionCount}
            </button>
          )}
          {allFamilies.map(f => (
            <button key={f} className={`pt-cat-filter ${familyFilter === f ? 'is-active' : ''}`} onClick={() => setFamilyFilter(f)}>
              {displayFamily(f)}
            </button>
          ))}
        </div>
        <div className="pt-cat-sort">
          <span className="pt-cat-sort-lbl">Sort</span>
          <select className="pt-cat-sort-sel" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="attention">Attention first</option>
            <option value="name">Name A–Z</option>
            <option value="stock-asc">Stock: low to high</option>
            <option value="stock-desc">Stock: high to low</option>
          </select>
        </div>
      </div>

      <div className="pt-cat-body">
        <div className="pt-cat-list">
          <div className="pt-cat-list-head">
            <div className="pt-cat-cell-name">Product</div>
            <div className="pt-cat-cell-stock">Stock</div>
            <div className="pt-cat-cell-velocity">Vel · 7d</div>
            <div className="pt-cat-cell-cover">Cover</div>
            <div className="pt-cat-cell-price">Price</div>
            <div className="pt-cat-cell-margin">Batches</div>
          </div>
          <ul>
            {families.map(family => (
              <li key={family}>
                {byFamily[family].map(p => {
                  const flag = stockFlag(p.totalStock)
                  const barPct = Math.min(100, (p.totalStock / BAR_MAX) * 100)
                  const thrPct = (LOW_THRESHOLD / BAR_MAX) * 100
                  return (
                    <div
                      key={p.id}
                      className={`pt-cat-row ${selectedId === p.id ? 'is-active' : ''} ${flag ? `pt-cat-row-${flag}` : ''}`}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <div className="pt-cat-cell-name">
                        <div className="pt-cat-name-main">
                          <span className="pt-cat-cat-pill" data-cat={p.productFamily}>{displayFamily(p.productFamily)}</span>
                          <div className="pt-cat-prod-name">{p.name}</div>
                        </div>
                        <div className="pt-cat-sku mono">{p.sku}</div>
                      </div>
                      <div className="pt-cat-cell-stock">
                        <div className="pt-cat-stock-row">
                          <span className={`pt-cat-stock-num mono ${flag === 'oos' ? 'is-zero' : ''}`}>
                            {p.totalStock === 0 ? 'OUT' : p.totalStock}
                          </span>
                          {flag && (
                            <span className={`pt-cat-flag pt-cat-flag-${flag}`}>
                              {flag === 'oos' ? 'out of stock' : flag === 'critical' ? 'critical' : 'below threshold'}
                            </span>
                          )}
                        </div>
                        <div className="pt-cat-stock-bar">
                          <div className={`pt-cat-stock-fill ${flag ? `is-${flag}` : ''}`} style={{ width: `${barPct}%` }} />
                          <div className="pt-cat-stock-thr" style={{ left: `${thrPct}%` }} />
                        </div>
                      </div>
                      <div className="pt-cat-cell-velocity">
                        {p.totalStock > 0 ? <MiniSparkline /> : null}
                        <span className="pt-cat-vel">—/wk</span>
                      </div>
                      <div className="pt-cat-cell-cover">
                        <span className={`mono ${flag === 'oos' ? 'is-zero' : flag === 'critical' ? 'is-warn' : ''}`}>—</span>
                      </div>
                      <div className="pt-cat-cell-price mono">${p.unitPrice.toFixed(0)}</div>
                      <div className="pt-cat-cell-margin mono">{p.batches.length}</div>
                    </div>
                  )
                })}
              </li>
            ))}
            {filtered.length === 0 && (
              <li style={{ padding: '24px', textAlign: 'center', color: 'var(--pt-fg-4)', fontSize: 13 }}>
                No products yet — add your first SKU above
              </li>
            )}
          </ul>
        </div>
        {selected && <CatalogDetail product={selected} products={products} />}
      </div>
    </div>
  )
}
