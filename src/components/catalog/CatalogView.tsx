'use client'

import { useState, useTransition } from 'react'
import { Icons } from '@/lib/icons'
import { createProduct, createBatch, saveBatchCoaPath } from '@/app/catalog/actions'
import type { CatalogProduct, DbBatch } from '@/types/catalog'

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
        await fetch(result.coaUploadUrl, {
          method: 'PUT',
          body: coaFile,
          headers: { 'Content-Type': 'application/pdf' },
        })
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
  return (
    <tr>
      <td className="mono">{batch.batch_number}</td>
      <td className="mono">{batch.stock}</td>
      <td>{batch.expires_at ?? '—'}</td>
      <td>
        {batch.coa_path
          ? <button className="pt-od-coa" onClick={() => void openCoa(batch.coa_path!)}>View COA</button>
          : <span style={{ color: 'var(--pt-fg-4)', fontSize: 11 }}>No COA</span>}
      </td>
    </tr>
  )
}

// ── Product detail panel ─────────────────────────────────────────────────────
function CatalogDetail({ product }: { product: CatalogProduct }) {
  const [showAddBatch, setShowAddBatch] = useState(false)
  const lowStock = product.totalStock > 0 && product.totalStock < 20
  const outOfStock = product.totalStock === 0

  return (
    <aside className="pt-cat-detail">
      <header className="pt-cat-detail-hd">
        <div>
          <span className="pt-cat-cat-pill">{product.productFamily}</span>
          <h2>{product.name}</h2>
          <div className="pt-cat-sku mono">{product.sku}</div>
        </div>
        <div className="pt-cat-detail-actions">
          <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>${product.unitPrice.toFixed(2)}</span>
        </div>
      </header>

      {outOfStock && (
        <div className="pt-cat-note pt-cat-note-critical">
          <i className="pt-cat-note-dot" /><span>Out of stock</span>
        </div>
      )}
      {lowStock && !outOfStock && (
        <div className="pt-cat-note pt-cat-note-low">
          <i className="pt-cat-note-dot" /><span>Low stock — {product.totalStock} units remaining</span>
        </div>
      )}
      {product.description && (
        <p style={{ fontSize: 12.5, color: 'var(--pt-fg-3)', margin: '0 0 16px' }}>{product.description}</p>
      )}

      <section className="pt-card pt-cat-section">
        <header className="pt-card-hd">
          <div>
            <h3>Batches</h3>
            <p>{product.batches.length} batch{product.batches.length !== 1 ? 'es' : ''} · {product.totalStock} units total</p>
          </div>
          <button className="pt-link" onClick={() => setShowAddBatch(v => !v)}>
            {showAddBatch ? 'Cancel' : '+ Add batch'}
          </button>
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
                <tr><th>Batch</th><th>Stock</th><th>Expires</th><th>COA</th></tr>
              </thead>
              <tbody>
                {product.batches.map(b => <BatchRow key={b.id} batch={b} />)}
              </tbody>
            </table>
          ) : (
            !showAddBatch && (
              <div className="pt-cat-empty"><span>No batches yet.</span></div>
            )
          )}
        </div>
      </section>
    </aside>
  )
}

// ── Main catalog view ────────────────────────────────────────────────────────
export function CatalogView({ products }: { products: CatalogProduct[] }) {
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? '')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = products.filter(p =>
    !search ||
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.productFamily.toLowerCase().includes(search.toLowerCase())
  )

  const families = Array.from(new Set(filtered.map(p => p.productFamily))).sort()
  const byFamily = Object.fromEntries(families.map(f => [f, filtered.filter(p => p.productFamily === f)]))

  const selected = products.find(p => p.id === selectedId) ?? products[0]
  const lowCount = products.filter(p => p.totalStock < 20).length
  const totalValue = products.reduce((s, p) => s + p.totalStock * p.unitPrice, 0)

  return (
    <div className="pt-cat">
      <div className="pt-cat-hd">
        <div>
          <h1>Catalog</h1>
          <p>{products.length} SKUs · {lowCount} need attention · ${Math.round(totalValue).toLocaleString()} on hand</p>
        </div>
        <div className="pt-cat-hd-actions">
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
          <div className="pt-ix-search" style={{ width: 260 }}>
            <Icons.search size={12} />
            <input
              placeholder="Search SKU, name, family…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="pt-cat-body">
        <div className="pt-cat-list">
          <div className="pt-cat-list-head">
            <div className="pt-cat-cell-name">Product</div>
            <div className="pt-cat-cell-stock">Stock</div>
            <div className="pt-cat-cell-price">Price</div>
            <div className="pt-cat-cell-velocity">Batches</div>
          </div>
          <ul>
            {families.map(family => (
              <li key={family}>
                <div className="pt-cat-family-hd">{family}</div>
                {byFamily[family].map(p => {
                  const flag = p.totalStock === 0 ? 'oos' : p.totalStock < 20 ? 'low' : undefined
                  return (
                    <div
                      key={p.id}
                      className={`pt-cat-row ${selectedId === p.id ? 'is-active' : ''} ${flag ? `pt-cat-row-${flag}` : ''}`}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <div className="pt-cat-cell-name">
                        <div className="pt-cat-prod-name">{p.name}</div>
                        <div className="pt-cat-sku mono">{p.sku}</div>
                      </div>
                      <div className="pt-cat-cell-stock">
                        <span className={`pt-cat-stock-num mono ${flag === 'oos' ? 'is-zero' : ''}`}>
                          {p.totalStock === 0 ? 'OUT' : p.totalStock}
                        </span>
                        {flag && (
                          <span className={`pt-cat-flag pt-cat-flag-${flag}`}>
                            {flag === 'oos' ? 'out of stock' : 'low'}
                          </span>
                        )}
                      </div>
                      <div className="pt-cat-cell-price mono">${p.unitPrice.toFixed(2)}</div>
                      <div className="pt-cat-cell-velocity mono">{p.batches.length}</div>
                    </div>
                  )
                })}
              </li>
            ))}
            {filtered.length === 0 && (
              <li style={{ padding: '24px', textAlign: 'center', color: 'var(--pt-fg-4)', fontSize: 13 }}>
                {search ? 'No products match your search' : 'No products yet — add your first SKU above'}
              </li>
            )}
          </ul>
        </div>
        {selected && <CatalogDetail product={selected} />}
      </div>
    </div>
  )
}
