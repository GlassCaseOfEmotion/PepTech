'use client'

import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatAmountCompact } from '@/lib/currency'
import { createProduct, updateProduct } from '@/app/catalog/actions'
import type { CatalogProduct } from '@/types/catalog'
import { grossMargin } from '@/types/catalog'
import type { ProductProtocol } from '@/types/protocols'
import { ProductSendModal } from '@/components/catalog/ProductSendModal'
import { stockFlag, LOW_THRESHOLD, BAR_MAX } from '@/lib/catalog-utils'
import { CatalogDetailOverview } from '@/components/catalog/CatalogDetailOverview'
import { CatalogDetailProtocol } from '@/components/catalog/CatalogDetailProtocol'
import { CatalogDetailMedia } from '@/components/catalog/CatalogDetailMedia'
import { CatalogDetailInsights } from '@/components/catalog/CatalogDetailInsights'
import { MiniSparkline } from '@/components/catalog/MiniSparkline'

// ── Add product form ─────────────────────────────────────────────────────────
function AddProductForm({ onDone, knownFamilies, baseCurrency }: { onDone: () => void; knownFamilies: string[]; baseCurrency: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [form, setForm] = useState({ sku: '', name: '', productFamily: '', unitPrice: '', costPrice: '' })
  const [addingFamily, setAddingFamily] = useState(false)
  const [newFamilyText, setNewFamilyText] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const selectFamily = (f: string) => setForm(prev => ({ ...prev, productFamily: f }))

  const confirmNewFamily = () => {
    const val = newFamilyText.trim().toUpperCase()
    if (val) { selectFamily(val); setAddingFamily(false); setNewFamilyText('') }
  }

  const sale = parseFloat(form.unitPrice)
  const cost = parseFloat(form.costPrice)
  const margin = !isNaN(sale) && !isNaN(cost) && sale > 0 && cost >= 0
    ? ((sale - cost) / sale) * 100
    : null
  const marginCls = margin === null ? '' : margin >= 50 ? 'is-hi' : margin >= 25 ? 'is-md' : 'is-lo'

  const submit = () => {
    setError('')
    startTransition(async () => {
      const costPrice = form.costPrice !== '' ? parseFloat(form.costPrice) : null
      const result = await createProduct({
        sku: form.sku,
        name: form.name,
        productFamily: form.productFamily,
        unitPrice: sale,
        costPrice,
      })
      if ('error' in result) { setError(result.error); return }
      onDone()
    })
  }

  return (
    <div className="pt-modal-backdrop" onClick={pending ? undefined : onDone}>
      <div className="pt-modal pt-sku-modal" onClick={e => e.stopPropagation()}>

        <div className="pt-modal-hd">
          <h2>New SKU</h2>
          <button className="pt-iconbtn" onClick={onDone} disabled={pending}><Icons.x size={14} /></button>
        </div>

        <div className="pt-sku-form-body">

          {/* ── Product identity ── */}
          <div className="pt-sku-section">
            <div className="pt-sku-section-hd">Product</div>

            <div className="pt-sku-field">
              <label className="pt-sku-lbl">SKU</label>
              <input
                className="pt-sku-input mono"
                placeholder="e.g. BPC-157-5MG"
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))}
                autoFocus
              />
            </div>

            <div className="pt-sku-field">
              <label className="pt-sku-lbl">Name</label>
              <input className="pt-sku-input" placeholder="e.g. BPC-157 5mg" value={form.name} onChange={set('name')} />
            </div>

            <div className="pt-sku-field">
              <label className="pt-sku-lbl">Family</label>
              <div className="pt-sku-chips">
                {knownFamilies.map(f => (
                  <button
                    key={f} type="button"
                    className={`pt-sku-chip ${form.productFamily === f ? 'is-on' : ''}`}
                    onClick={() => selectFamily(form.productFamily === f ? '' : f)}
                  >
                    {displayFamily(f)}
                  </button>
                ))}
                {addingFamily ? (
                  <input
                    className="pt-sku-input"
                    style={{ width: 120, height: 26, fontSize: 11.5, padding: '0 8px' }}
                    placeholder="New family…"
                    value={newFamilyText}
                    onChange={e => setNewFamilyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmNewFamily(); if (e.key === 'Escape') setAddingFamily(false) }}
                    onBlur={confirmNewFamily}
                    autoFocus
                  />
                ) : (
                  <button type="button" className="pt-sku-chip pt-sku-chip-new" onClick={() => setAddingFamily(true)}>
                    <Icons.plus size={9} /> New
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="pt-sku-divider" />

          {/* ── Pricing ── */}
          <div className="pt-sku-section">
            <div className="pt-sku-section-hd">Pricing</div>

            <div className="pt-sku-field">
              <label className="pt-sku-lbl">Sale price <span className="pt-sku-lbl-opt">{baseCurrency}</span></label>
              <input className="pt-sku-input mono" placeholder="0.00" type="number" min="0" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} />
            </div>

            <div className="pt-sku-field">
              <label className="pt-sku-lbl">Cost price <span className="pt-sku-lbl-opt">{baseCurrency} · optional</span></label>
              <input className="pt-sku-input mono" placeholder="0.00" type="number" min="0" step="0.01" value={form.costPrice} onChange={set('costPrice')} />
            </div>

            <div className="pt-sku-margin">
              {margin !== null ? (
                <div className={`pt-sku-margin-live ${marginCls}`}>
                  <span className="pt-sku-margin-pct">{margin.toFixed(0)}%</span>
                  <div className="pt-sku-margin-meta">
                    <span className="pt-sku-margin-abs">${(sale - cost).toFixed(2)}/unit</span>
                    <span className="pt-sku-margin-lbl">gross margin</span>
                  </div>
                </div>
              ) : (
                <div className="pt-sku-margin-empty">Enter both prices to preview margin</div>
              )}
            </div>
          </div>

        </div>

        <div className="pt-sku-form-ft">
          {error ? <span className="pt-sku-form-ft-err">{error}</span> : <span />}
          <div className="pt-sku-form-ft-actions">
            <button className="pt-btn pt-btn-ghost" onClick={onDone} disabled={pending}>Cancel</button>
            <button className="pt-btn pt-btn-primary" onClick={submit} disabled={pending}>
              {pending ? 'Saving…' : 'Add product'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Product detail panel ─────────────────────────────────────────────────────
function CatalogDetail({ product, products, protocol, baseCurrency }: {
  product: CatalogProduct
  products: CatalogProduct[]
  protocol: ProductProtocol | null
  baseCurrency: string
}) {
  const [showReorder, setShowReorder] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [reorderCopied, setReorderCopied] = useState(false)
  const [reorderMsg, setReorderMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: product.name,
    sku: product.sku,
    family: product.productFamily,
    unitPrice: String(product.unitPrice),
    costPrice: product.costPrice != null ? String(product.costPrice) : '',
    resources: product.resources ?? [],
  })
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)

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
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'overview')
    router.replace(`/catalog?${params.toString()}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id])

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`/catalog?${params.toString()}`)
  }

  const knownFamilies = products.map(p => p.productFamily).filter((f, i, a) => a.indexOf(f) === i).sort()

  const saveEdit = async () => {
    const unitPrice = parseFloat(editForm.unitPrice)
    const costPrice = editForm.costPrice !== '' ? parseFloat(editForm.costPrice) : null
    if (!editForm.name.trim()) { setEditError('Name is required'); return }
    if (isNaN(unitPrice) || unitPrice <= 0) { setEditError('Invalid price'); return }
    setEditSaving(true)
    const result = await updateProduct(product.id, {
      name: editForm.name.trim(),
      sku: editForm.sku.trim(),
      productFamily: editForm.family.trim(),
      unitPrice,
      costPrice: costPrice !== null && !isNaN(costPrice) ? costPrice : null,
      resources: editForm.resources.filter(r => r.label.trim() && r.url.trim()),
    })
    setEditSaving(false)
    if ('error' in result) { setEditError(result.error); return }
    setEditing(false)
    setEditError('')
  }

  return (
    <aside className="pt-cat-detail">
      {editing ? (
        <header className="pt-cat-detail-hd" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label className="pt-sku-lbl">Name</label>
              <input className="pt-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="pt-sku-lbl">SKU</label>
              <input className="pt-input" value={editForm.sku} onChange={e => setEditForm(f => ({ ...f, sku: e.target.value }))} style={{ textTransform: 'uppercase' }} />
            </div>
            <div>
              <label className="pt-sku-lbl">Family</label>
              <input className="pt-input" list="edit-families" value={editForm.family} onChange={e => setEditForm(f => ({ ...f, family: e.target.value }))} />
              <datalist id="edit-families">{knownFamilies.map(f => <option key={f} value={f} />)}</datalist>
            </div>
            <div>
              <label className="pt-sku-lbl">Sale price <span className="pt-sku-lbl-opt">{baseCurrency}</span></label>
              <input className="pt-input" type="number" min="0" step="any" value={editForm.unitPrice} onChange={e => setEditForm(f => ({ ...f, unitPrice: e.target.value }))} />
            </div>
            <div>
              <label className="pt-sku-lbl">Cost price <span className="pt-sku-lbl-opt">optional</span></label>
              <input className="pt-input" type="number" min="0" step="any" value={editForm.costPrice} onChange={e => setEditForm(f => ({ ...f, costPrice: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="pt-sku-lbl">Resources <span className="pt-sku-lbl-opt">links &amp; videos</span></label>
              {editForm.resources.map((r, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
                  <input className="pt-input" placeholder="Label (e.g. Tutorial video)" value={r.label}
                    onChange={e => setEditForm(f => ({ ...f, resources: f.resources.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))} />
                  <input className="pt-input" placeholder="https://..." value={r.url}
                    onChange={e => setEditForm(f => ({ ...f, resources: f.resources.map((x, j) => j === i ? { ...x, url: e.target.value } : x) }))} />
                  <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }}
                    onClick={() => setEditForm(f => ({ ...f, resources: f.resources.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              ))}
              <button className="pt-link" style={{ fontSize: 11 }}
                onClick={() => setEditForm(f => ({ ...f, resources: [...f.resources, { label: '', url: '' }] }))}>
                + Add resource
              </button>
            </div>
          </div>
          {editError && <p style={{ fontSize: 11, color: 'var(--pt-danger)', margin: 0 }}>{editError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pt-btn pt-btn-primary" onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save changes'}</button>
            <button className="pt-btn pt-btn-ghost" onClick={() => { setEditing(false); setEditError(''); setEditForm({ name: product.name, sku: product.sku, family: product.productFamily, unitPrice: String(product.unitPrice), costPrice: product.costPrice != null ? String(product.costPrice) : '', resources: product.resources ?? [] }) }}>Cancel</button>
          </div>
        </header>
      ) : (
        <header className="pt-cat-detail-hd">
          <div>
            <span className="pt-cat-cat-pill" data-cat={product.productFamily}>{product.productFamily}</span>
            <h2>{product.name}</h2>
            <div className="pt-cat-sku mono">{product.sku}</div>
          </div>
          <div className="pt-cat-detail-actions">
            <button className="pt-btn pt-btn-ghost" onClick={() => setShowSendModal(true)}>
              Send info →
            </button>
            <button className="pt-btn pt-btn-ghost" onClick={() => {
              setEditForm({ name: product.name, sku: product.sku, family: product.productFamily, unitPrice: String(product.unitPrice), costPrice: product.costPrice != null ? String(product.costPrice) : '', resources: product.resources ?? [] })
              setEditing(true)
              setEditError('')
            }}>Edit</button>
            <button className="pt-btn pt-btn-primary" onClick={() => {
              const dailyVel = product.velocity30dTotal / 30
              const daysOfCover = dailyVel > 0 ? Math.floor(product.totalStock / dailyVel) : null
              const suggestedQty = dailyVel > 0
                ? Math.max(Math.ceil(dailyVel * 30) - product.totalStock, 10)
                : 50
              setReorderMsg([
                `Hi,`,
                ``,
                `We'd like to place a reorder for the following:`,
                ``,
                `  Product: ${product.name}`,
                `  SKU: ${product.sku}`,
                `  Quantity: ${suggestedQty} units`,
                ``,
                `Current stock is ${product.totalStock} units${daysOfCover !== null ? ` (~${daysOfCover}d cover)` : ''}.`,
                ``,
                `Please confirm availability and lead time.`,
                ``,
                `Thanks`,
              ].join('\n'))
              setShowReorder(true)
              setReorderCopied(false)
            }}>Re-order</button>
          </div>
        </header>
      )}

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

      {showSendModal && (
        <ProductSendModal
          product={product}
          protocol={protocol}
          onClose={() => setShowSendModal(false)}
        />
      )}

      {showReorder && (
        <div className="pt-modal-backdrop" onClick={() => setShowReorder(false)}>
          <div className="pt-modal pt-reorder-modal" onClick={e => e.stopPropagation()}>
            <div className="pt-modal-hd">
              <h3>Reorder — {product.name}</h3>
              <button className="pt-iconbtn" onClick={() => setShowReorder(false)}><Icons.x size={14} /></button>
            </div>
            <div className="pt-modal-body">
              <p className="pt-reorder-hint">Edit the message below then copy it to send to your supplier.</p>
              <textarea
                className="pt-reorder-ta"
                value={reorderMsg}
                onChange={e => setReorderMsg(e.target.value)}
                rows={13}
              />
            </div>
            <div className="pt-modal-ft">
              <button className="pt-btn pt-btn-ghost" onClick={() => setShowReorder(false)}>Close</button>
              <button
                className={`pt-btn pt-btn-primary${reorderCopied ? ' is-copied' : ''}`}
                onClick={() => {
                  navigator.clipboard.writeText(reorderMsg)
                  setReorderCopied(true)
                  setTimeout(() => setReorderCopied(false), 2000)
                }}
              >
                {reorderCopied ? '✓ Copied!' : 'Copy message'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

const FAMILY_DISPLAY: Record<string, string> = {
  'GLP-1': 'GLP-1', 'HEALING': 'Healing', 'COSMETIC': 'Cosmetic', 'MITO': 'Mito', 'GH': 'GH',
}
function displayFamily(f: string) { return FAMILY_DISPLAY[f] ?? f }

function flagOrder(f: ReturnType<typeof stockFlag>) {
  return f === 'oos' ? 0 : f === 'critical' ? 1 : f === 'low' ? 2 : 3
}

// ── Main catalog view ────────────────────────────────────────────────────────
export function CatalogView({ products, protocols, baseCurrency }: { products: CatalogProduct[]; protocols: ProductProtocol[]; baseCurrency: string }) {
  const searchParams = useSearchParams()
  const highlightId = searchParams.get('product') ?? ''
  const [selectedId, setSelectedId] = useState(highlightId || (products[0]?.id ?? ''))
  const highlightRowRef = useRef<HTMLDivElement>(null)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [familyFilter, setFamilyFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('attention')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const protocolByProduct = Object.fromEntries(protocols.map(p => [p.product_id, p]))

  // Scroll highlighted product into view on mount
  useEffect(() => {
    if (highlightId && highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [highlightId])

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

  const colSort = (col: string, defaultDir: 'asc' | 'desc' = 'asc') => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(defaultDir) }
  }

  const sortedProducts = useMemo(() => {
    if (sortBy === 'attention') {
      return [...filtered].sort((a, b) =>
        flagOrder(stockFlag(a.totalStock)) - flagOrder(stockFlag(b.totalStock)) || a.name.localeCompare(b.name)
      )
    }
    const d = sortDir === 'asc' ? 1 : -1
    const cover = (p: CatalogProduct) => p.velocity30dTotal > 0 ? p.totalStock / (p.velocity30dTotal / 30) : Infinity
    const vel = (p: CatalogProduct) => p.velocity7d.reduce((s, v) => s + v, 0)
    const mg = (p: CatalogProduct) => grossMargin(p.unitPrice, p.costPrice) ?? -Infinity
    const fns: Record<string, (a: CatalogProduct, b: CatalogProduct) => number> = {
      name:     (a, b) => d * a.name.localeCompare(b.name),
      stock:    (a, b) => d * (a.totalStock - b.totalStock),
      velocity: (a, b) => d * (vel(a) - vel(b)),
      cover:    (a, b) => d * (cover(a) - cover(b)),
      price:    (a, b) => d * (a.unitPrice - b.unitPrice),
      margin:   (a, b) => d * (mg(a) - mg(b)),
    }
    return [...filtered].sort(fns[sortBy] ?? fns.name)
  }, [filtered, sortBy, sortDir])

  const selected = products.find(p => p.id === selectedId) ?? products[0]

  return (
    <div className="pt-cat">
      <div className="pt-cat-hd">
        <div>
          <h1>Catalog</h1>
          <p>{products.length} SKUs · {needsAttentionCount} need attention · {formatAmountCompact(Math.round(totalValue), baseCurrency)} on hand</p>
        </div>
        <div className="pt-cat-hd-actions">
          <button className="pt-btn pt-btn-primary" onClick={() => setShowAddProduct(true)}>
            <Icons.plus size={12} /> New SKU
          </button>
        </div>
      </div>

      {showAddProduct && (
        <AddProductForm onDone={() => setShowAddProduct(false)} knownFamilies={allFamilies} baseCurrency={baseCurrency} />
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
          <button
            className={`pt-cat-filter ${sortBy === 'attention' ? 'is-active' : ''}`}
            onClick={() => setSortBy('attention')}
          >
            ⚠ Attention first
          </button>
        </div>
      </div>

      <div className="pt-cat-body">
        <div className="pt-cat-list">
          <div className="pt-cat-list-head">
            {([
              ['name',     'Product',  'asc'],
              ['stock',    'Stock',    'asc'],
              ['velocity', 'Vel · 7d', 'desc'],
              ['cover',    'Cover',    'asc'],
              ['price',    'Price',    'asc'],
              ['margin',   'Margin',   'desc'],
            ] as [string, string, 'asc' | 'desc'][]).map(([col, label, def], i) => (
              <button
                key={col}
                className={`pt-cat-col-hd ${['pt-cat-cell-name','pt-cat-cell-stock','pt-cat-cell-velocity','pt-cat-cell-cover','pt-cat-cell-price','pt-cat-cell-margin'][i]} ${sortBy === col ? 'is-sorted' : ''}`}
                onClick={() => colSort(col, def)}
              >
                {label}
                {sortBy === col && <span className="pt-cat-sort-arr">{sortDir === 'asc' ? '↑' : '↓'}</span>}
              </button>
            ))}
          </div>
          <ul>
            {sortedProducts.map(p => {
              const flag = stockFlag(p.totalStock)
              const barPct = Math.min(100, (p.totalStock / BAR_MAX) * 100)
              const thrPct = (LOW_THRESHOLD / BAR_MAX) * 100
              return (
                <li key={p.id}>
                  <div
                    ref={p.id === highlightId ? highlightRowRef : null}
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
                      <MiniSparkline data={p.velocity7d} />
                      <span className="pt-cat-vel">{p.velocity7d.reduce((s, v) => s + v, 0) || '—'}/wk</span>
                    </div>
                    <div className="pt-cat-cell-cover">
                      {(() => {
                        const dailyRate = p.velocity30dTotal / 30
                        const cover = dailyRate > 0 ? Math.ceil(p.totalStock / dailyRate) : null
                        return <span className={`mono ${flag === 'oos' ? 'is-zero' : flag === 'critical' ? 'is-warn' : ''}`}>
                          {cover !== null ? `${cover}d` : '—'}
                        </span>
                      })()}
                    </div>
                    <div className="pt-cat-cell-price mono">{formatAmountCompact(p.unitPrice, baseCurrency)}</div>
                    <div className="pt-cat-cell-margin">
                      {(() => {
                        const m = grossMargin(p.unitPrice, p.costPrice)
                        return m !== null
                          ? <span className={`mono pt-cat-margin ${m >= 50 ? 'is-hi' : m >= 25 ? 'is-md' : 'is-lo'}`}>{m.toFixed(0)}%</span>
                          : <span style={{ color: 'var(--pt-fg-4)' }}>—</span>
                      })()}
                    </div>
                  </div>
                </li>
              )
            })}
            {sortedProducts.length === 0 && (
              <li>
                <div className="pt-empty-page">
                  <EmptyState
                    size="lg"
                    icon={
                      <svg width="120" height="100" viewBox="0 0 120 100" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                        {/* Center vial */}
                        <rect x="47" y="12" width="26" height="76" rx="13" strokeWidth="1.2"/>
                        <rect x="51" y="6" width="18" height="10" rx="3" strokeWidth="1.1"/>
                        {/* Liquid fill */}
                        <rect x="48" y="68" width="24" height="18" rx="0 0 12 12" fill="currentColor" opacity="0.06" strokeWidth="0"/>
                        {/* Measurement ticks left */}
                        <line x1="36" y1="32" x2="47" y2="32" strokeWidth="0.8" opacity="0.4"/>
                        <line x1="40" y1="42" x2="47" y2="42" strokeWidth="0.6" opacity="0.28"/>
                        <line x1="36" y1="52" x2="47" y2="52" strokeWidth="0.8" opacity="0.4"/>
                        <line x1="40" y1="62" x2="47" y2="62" strokeWidth="0.6" opacity="0.28"/>
                        <line x1="36" y1="72" x2="47" y2="72" strokeWidth="0.8" opacity="0.4"/>
                        {/* Label area (dashed) */}
                        <rect x="52" y="30" width="16" height="26" rx="1.5" strokeWidth="0.8" strokeDasharray="2 1.5" opacity="0.45"/>
                        {/* Right vial (smaller) */}
                        <rect x="78" y="28" width="18" height="60" rx="9" strokeWidth="1" opacity="0.38"/>
                        <rect x="81" y="23" width="12" height="8" rx="2.5" strokeWidth="0.9" opacity="0.38"/>
                        {/* Left vial (smallest) */}
                        <rect x="24" y="36" width="16" height="52" rx="8" strokeWidth="0.9" opacity="0.28"/>
                        <rect x="27" y="31" width="10" height="8" rx="2" strokeWidth="0.8" opacity="0.28"/>
                        {/* Base line */}
                        <line x1="16" y1="90" x2="104" y2="90" strokeWidth="0.7" opacity="0.22"/>
                      </svg>
                    }
                    title="Your catalog is empty"
                    body="Add your first product to start tracking stock, pricing, and batch certificates."
                  />
                </div>
              </li>
            )}
          </ul>
        </div>
        {selected && <CatalogDetail product={selected} products={products} protocol={protocolByProduct[selected.id] ?? null} baseCurrency={baseCurrency} />}
      </div>
    </div>
  )
}
