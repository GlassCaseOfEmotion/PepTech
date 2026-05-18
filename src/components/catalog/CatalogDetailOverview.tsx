'use client'

import { useState, useTransition } from 'react'
import { Icons } from '@/lib/icons'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatAmountCompact } from '@/lib/currency'
import { createBatch, saveBatchCoaPath, updateBatch, deleteBatch } from '@/app/catalog/actions'
import type { CatalogProduct, DbBatch } from '@/types/catalog'
import { grossMargin } from '@/types/catalog'
import { stockFlag, LOW_THRESHOLD, BAR_MAX } from '@/lib/catalog-utils'

// ── Velocity sparkline — area fill matching original design ─────────────────
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

// ── COA PDF opener ───────────────────────────────────────────────────────────
export async function openCoa(coaPath: string) {
  const res = await fetch(`/api/catalog/coa-url?path=${encodeURIComponent(coaPath)}`)
  if (!res.ok) return
  const { url } = await res.json() as { url: string }
  window.open(url, '_blank', 'noopener')
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
  const [editing, setEditing] = useState(false)
  const [stock, setStock] = useState(String(batch.stock))
  const [expiresAt, setExpiresAt] = useState(batch.expires_at?.slice(0, 10) ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const added = new Date(batch.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const save = async () => {
    const stockNum = parseInt(stock)
    if (isNaN(stockNum) || stockNum < 0) { setError('Invalid stock'); return }
    setSaving(true)
    const result = await updateBatch(batch.id, { stock: stockNum, expiresAt: expiresAt || null })
    setSaving(false)
    if ('error' in result) { setError(result.error); return }
    setEditing(false)
    setError('')
  }

  const del = async () => {
    if (!confirm(`Delete batch ${batch.batch_number}?`)) return
    await deleteBatch(batch.id)
  }

  if (editing) {
    return (
      <tr>
        <td className="mono" style={{ color: 'var(--pt-accent)', fontWeight: 500 }}>{batch.batch_number}</td>
        <td style={{ color: 'var(--pt-fg-3)' }}>{added}</td>
        <td>
          <input
            type="number" min="0" value={stock}
            onChange={e => setStock(e.target.value)}
            style={{ width: 60, fontSize: 12, padding: '2px 5px', borderRadius: 4, border: '0.5px solid var(--pt-accent)', background: 'var(--pt-bg-2)', color: 'var(--pt-fg)' }}
          />
        </td>
        <td>
          <input
            type="date" value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
            style={{ fontSize: 11, padding: '2px 5px', borderRadius: 4, border: '0.5px solid var(--pt-line)', background: 'var(--pt-bg-2)', color: 'var(--pt-fg)' }}
          />
        </td>
        <td style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="pt-link" style={{ fontSize: 11 }} onClick={save} disabled={saving}>{saving ? '…' : 'Save'}</button>
          <button className="pt-link" style={{ fontSize: 11, opacity: 0.5 }} onClick={() => { setEditing(false); setError(''); setStock(String(batch.stock)); setExpiresAt(batch.expires_at?.slice(0, 10) ?? '') }}>Cancel</button>
          {error && <span style={{ fontSize: 10, color: 'var(--pt-danger)' }}>{error}</span>}
        </td>
      </tr>
    )
  }

  const expires = batch.expires_at
    ? new Date(batch.expires_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    : '—'

  return (
    <tr>
      <td className="mono" style={{ color: 'var(--pt-accent)', fontWeight: 500 }}>{batch.batch_number}</td>
      <td style={{ color: 'var(--pt-fg-3)' }}>{added}</td>
      <td className="mono" style={{ fontWeight: 500 }}>{batch.stock}</td>
      <td style={{ color: 'var(--pt-fg-3)' }}>{expires}</td>
      <td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {batch.coa_path
          ? <button className="pt-od-coa" onClick={() => void openCoa(batch.coa_path!)}>View →</button>
          : <span style={{ color: 'var(--pt-fg-4)', fontSize: 11 }}>—</span>}
        <button className="pt-link" style={{ fontSize: 11 }} onClick={() => setEditing(true)}>Edit</button>
        <button className="pt-link" style={{ fontSize: 11, color: 'var(--pt-danger)' }} onClick={del}>Delete</button>
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
