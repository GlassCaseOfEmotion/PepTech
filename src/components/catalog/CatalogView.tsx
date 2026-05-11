'use client'

import { useState, useTransition, useMemo } from 'react'
import { Icons } from '@/lib/icons'
import { createProduct, createBatch, saveBatchCoaPath, upsertProtocol } from '@/app/catalog/actions'
import type { CatalogProduct, DbBatch } from '@/types/catalog'
import { grossMargin } from '@/types/catalog'
import { FREQUENCY_LABELS, FREQUENCY_OPTIONS } from '@/types/protocols'
import type { ProductProtocol, Frequency } from '@/types/protocols'

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
function AddProductForm({ onDone, knownFamilies }: { onDone: () => void; knownFamilies: string[] }) {
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
              <label className="pt-sku-lbl">Sale price <span className="pt-sku-lbl-opt">USD</span></label>
              <input className="pt-sku-input mono" placeholder="0.00" type="number" min="0" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} />
            </div>

            <div className="pt-sku-field">
              <label className="pt-sku-lbl">Cost price <span className="pt-sku-lbl-opt">USD · optional</span></label>
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
function CatalogDetail({ product, products, protocol }: {
  product: CatalogProduct
  products: CatalogProduct[]
  protocol: ProductProtocol | null
}) {
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
          <div className="pt-cat-stat-sub">
            {product.costPrice != null ? `cost $${product.costPrice.toFixed(0)}` : 'cost —'}
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

      <ProtocolSection productId={product.id} protocol={protocol} />
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

// ── Protocol section ─────────────────────────────────────────────────────────
function ProtocolSection({ productId, protocol }: { productId: string; protocol: ProductProtocol | null }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    vialStrength: protocol?.vial_strength ?? '',
    reconstitutionMl: protocol?.reconstitution_ml?.toString() ?? '',
    drawVolumeMl: protocol?.draw_volume_ml?.toString() ?? '',
    frequency: (protocol?.frequency ?? 'once_daily') as Frequency,
    timing: protocol?.timing ?? '',
    cycleLengthWeeks: protocol?.cycle_length_weeks?.toString() ?? '',
    storage: protocol?.storage ?? '',
    notes: protocol?.notes ?? '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const recon = parseFloat(form.reconstitutionMl)
  const draw = parseFloat(form.drawVolumeMl)
  const dosesPerVial = !isNaN(recon) && !isNaN(draw) && draw > 0 ? Math.round(recon / draw) : null

  const startEdit = () => {
    setForm({
      vialStrength: protocol?.vial_strength ?? '',
      reconstitutionMl: protocol?.reconstitution_ml?.toString() ?? '',
      drawVolumeMl: protocol?.draw_volume_ml?.toString() ?? '',
      frequency: (protocol?.frequency ?? 'once_daily') as Frequency,
      timing: protocol?.timing ?? '',
      cycleLengthWeeks: protocol?.cycle_length_weeks?.toString() ?? '',
      storage: protocol?.storage ?? '',
      notes: protocol?.notes ?? '',
    })
    setError('')
    setEditing(true)
  }

  const save = () => {
    setError('')
    const reconstitutionMl = parseFloat(form.reconstitutionMl)
    const drawVolumeMl = parseFloat(form.drawVolumeMl)
    if (isNaN(reconstitutionMl) || reconstitutionMl <= 0) { setError('Reconstitution volume is required'); return }
    if (isNaN(drawVolumeMl) || drawVolumeMl <= 0) { setError('Draw volume is required'); return }
    startTransition(async () => {
      const result = await upsertProtocol({
        productId,
        vialStrength: form.vialStrength || undefined,
        reconstitutionMl,
        drawVolumeMl,
        frequency: form.frequency,
        timing: form.timing || undefined,
        cycleLengthWeeks: form.cycleLengthWeeks ? parseInt(form.cycleLengthWeeks) : null,
        storage: form.storage || undefined,
        notes: form.notes || undefined,
      })
      if ('error' in result) { setError(result.error); return }
      setEditing(false)
    })
  }

  return (
    <section className="pt-card pt-cat-section">
      <header className="pt-card-hd">
        <div>
          <h3>Protocol</h3>
          <p>Dosage &amp; usage instructions</p>
        </div>
        {!editing && (
          <button className="pt-link" onClick={startEdit}>
            {protocol ? 'Edit' : '+ Add protocol'}
          </button>
        )}
      </header>
      <div className="pt-card-body" style={{ padding: editing ? '12px 14px' : 0 }}>
        {!protocol && !editing && (
          <div className="pt-cat-empty">
            <span>No protocol configured. Add one to enable supply tracking.</span>
          </div>
        )}
        {protocol && !editing && (
          <dl className="pt-cat-proto-dl">
            {protocol.vial_strength && <><dt>Vial strength</dt><dd className="mono">{protocol.vial_strength}</dd></>}
            <dt>Reconstitution</dt><dd className="mono">{protocol.reconstitution_ml} mL</dd>
            <dt>Draw volume</dt>
            <dd className="mono">
              {protocol.draw_volume_ml} mL
              <span className="pt-cat-proto-derived"> → {Math.round(protocol.reconstitution_ml / protocol.draw_volume_ml)} doses/vial</span>
            </dd>
            <dt>Frequency</dt><dd>{FREQUENCY_LABELS[protocol.frequency as Frequency] ?? protocol.frequency}</dd>
            {protocol.timing && <><dt>Timing</dt><dd style={{ color: 'var(--pt-fg-3)' }}>{protocol.timing}</dd></>}
            {protocol.cycle_length_weeks && <><dt>Cycle</dt><dd style={{ color: 'var(--pt-fg-3)' }}>{protocol.cycle_length_weeks} weeks</dd></>}
            {protocol.storage && <><dt>Storage</dt><dd style={{ color: 'var(--pt-fg-3)' }}>{protocol.storage}</dd></>}
            {protocol.notes && <><dt>Notes</dt><dd style={{ color: 'var(--pt-fg-3)' }}>{protocol.notes}</dd></>}
          </dl>
        )}
        {editing && (
          <div className="pt-cat-proto-form">
            <div className="pt-cat-proto-grid">
              <div>
                <label className="pt-sku-lbl">Vial strength</label>
                <input className="pt-input" placeholder="e.g. 5mg" value={form.vialStrength} onChange={set('vialStrength')} />
              </div>
              <div>
                <label className="pt-sku-lbl">Frequency <span style={{ color: 'var(--pt-danger)' }}>*</span></label>
                <select className="pt-input" value={form.frequency} onChange={set('frequency')}>
                  {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                </select>
              </div>
              <div>
                <label className="pt-sku-lbl">Reconstitution volume (mL) <span style={{ color: 'var(--pt-danger)' }}>*</span></label>
                <input className="pt-input" type="number" step="0.1" min="0" placeholder="e.g. 2.0" value={form.reconstitutionMl} onChange={set('reconstitutionMl')} />
              </div>
              <div>
                <label className="pt-sku-lbl">Draw volume per injection (mL) <span style={{ color: 'var(--pt-danger)' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <input className="pt-input" type="number" step="0.01" min="0" placeholder="e.g. 0.1" value={form.drawVolumeMl} onChange={set('drawVolumeMl')} />
                  {dosesPerVial !== null && (
                    <span className="pt-cat-proto-derived" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      → {dosesPerVial} doses/vial
                    </span>
                  )}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="pt-sku-lbl">Timing</label>
                <input className="pt-input" placeholder="e.g. nightly, empty stomach" value={form.timing} onChange={set('timing')} />
              </div>
              <div>
                <label className="pt-sku-lbl">Cycle length (weeks)</label>
                <input className="pt-input" type="number" min="1" placeholder="e.g. 12" value={form.cycleLengthWeeks} onChange={set('cycleLengthWeeks')} />
              </div>
              <div>
                <label className="pt-sku-lbl">Storage</label>
                <input className="pt-input" placeholder="e.g. refrigerate after reconstituting" value={form.storage} onChange={set('storage')} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="pt-sku-lbl">Usage notes</label>
                <textarea className="pt-input" rows={2} placeholder="Needle type, preloading tips, etc." value={form.notes} onChange={set('notes')} style={{ resize: 'vertical' }} />
              </div>
            </div>
            {error && <div className="pt-cat-form-err" style={{ marginTop: 8 }}>{error}</div>}
            <div className="pt-cat-form-actions">
              <button className="pt-btn pt-btn-ghost" onClick={() => setEditing(false)} disabled={pending}>Cancel</button>
              <button className="pt-btn pt-btn-primary" onClick={save} disabled={pending}>
                {pending ? 'Saving…' : 'Save protocol'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Main catalog view ────────────────────────────────────────────────────────
export function CatalogView({ products, protocols }: { products: CatalogProduct[]; protocols: ProductProtocol[] }) {
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? '')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [familyFilter, setFamilyFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('attention')

  const protocolByProduct = Object.fromEntries(protocols.map(p => [p.product_id, p]))

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
          <button className="pt-btn pt-btn-primary" onClick={() => setShowAddProduct(true)}>
            <Icons.plus size={12} /> New SKU
          </button>
        </div>
      </div>

      {showAddProduct && (
        <AddProductForm onDone={() => setShowAddProduct(false)} knownFamilies={allFamilies} />
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
            <div className="pt-cat-cell-margin">Margin</div>
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
                      <div className="pt-cat-cell-margin">
                        {(() => {
                          const m = grossMargin(p.unitPrice, p.costPrice)
                          return m !== null
                            ? <span className={`mono pt-cat-margin ${m >= 50 ? 'is-hi' : m >= 25 ? 'is-md' : 'is-lo'}`}>{m.toFixed(0)}%</span>
                            : <span style={{ color: 'var(--pt-fg-4)' }}>—</span>
                        })()}
                      </div>
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
        {selected && <CatalogDetail product={selected} products={products} protocol={protocolByProduct[selected.id] ?? null} />}
      </div>
    </div>
  )
}
