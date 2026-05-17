'use client'

import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatAmount, formatAmountCompact } from '@/lib/currency'
import { createProduct, createBatch, saveBatchCoaPath, upsertProtocol, updateProduct, updateBatch, deleteBatch, createProductMedia, saveProductMediaPath, deleteProductMedia } from '@/app/catalog/actions'
import type { CatalogProduct, DbBatch } from '@/types/catalog'
import type { ProductMediaItem } from '@/types/catalog'
import { grossMargin } from '@/types/catalog'
import { FREQUENCY_LABELS, FREQUENCY_OPTIONS } from '@/types/protocols'
import type { ProductProtocol, Frequency } from '@/types/protocols'
import { createClient } from '@/lib/supabase/client'
import { ProductSendModal } from '@/components/catalog/ProductSendModal'

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
async function openCoa(coaPath: string) {
  const res = await fetch(`/api/catalog/coa-url?path=${encodeURIComponent(coaPath)}`)
  if (!res.ok) return
  const { url } = await res.json() as { url: string }
  window.open(url, '_blank', 'noopener')
}

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

// ── Product media section ────────────────────────────────────────────────────
function ProductMediaSection({ productId, media: initialMedia }: { productId: string; media: ProductMediaItem[] }) {
  const [items, setItems] = useState<ProductMediaItem[]>(initialMedia)
  const [pendingFile, setPendingFile] = useState<{ file: File; type: 'image' | 'video' } | null>(null)
  const [labelInput, setLabelInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    const images = items.filter(m => m.type === 'image' && !thumbnailUrls[m.id])
    if (images.length === 0) return
    void Promise.all(
      images.map(async m => {
        const res = await fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(m.storage_path)}`)
        if (!res.ok) return null
        const { url } = await res.json() as { url: string }
        return { id: m.id, url }
      })
    ).then(results => {
      const updates: Record<string, string> = {}
      for (const r of results) { if (r) updates[r.id] = r.url }
      setThumbnailUrls(prev => ({ ...prev, ...updates }))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') {
    const file = e.target.files?.[0]
    if (!file) return
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
    setLabelInput(baseName)
    setPendingFile({ file, type })
    e.target.value = ''
  }

  async function upload() {
    if (!pendingFile || !labelInput.trim()) return
    setUploading(true)
    setUploadError('')
    try {
      const ext = pendingFile.file.name.split('.').pop() ?? (pendingFile.type === 'image' ? 'jpg' : 'mp4')
      const result = await createProductMedia(productId, labelInput.trim(), pendingFile.type, ext)
      if ('error' in result) { setUploadError(result.error); return }
      const putRes = await fetch(result.uploadUrl, {
        method: 'PUT',
        body: pendingFile.file,
        headers: { 'Content-Type': pendingFile.file.type },
      })
      if (!putRes.ok) { setUploadError('Upload failed — please try again'); return }
      const saveResult = await saveProductMediaPath(result.id, result.storagePath)
      if ('error' in saveResult) { setUploadError(saveResult.error); return }
      const newItem: ProductMediaItem = {
        id: result.id,
        label: labelInput.trim(),
        type: pendingFile.type,
        storage_path: result.storagePath,
        sort_order: items.length,
      }
      setItems(prev => [...prev, newItem])
      setPendingFile(null)
      setLabelInput('')
    } finally {
      setUploading(false)
    }
  }

  async function openItem(item: ProductMediaItem) {
    const res = await fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(item.storage_path)}`)
    if (!res.ok) return
    const { url } = await res.json() as { url: string }
    window.open(url, '_blank', 'noopener')
  }

  async function confirmDelete(item: ProductMediaItem) {
    const result = await deleteProductMedia(item.id, item.storage_path)
    if ('error' in result) return
    setItems(prev => prev.filter(m => m.id !== item.id))
    setThumbnailUrls(prev => { const n = { ...prev }; delete n[item.id]; return n })
    setConfirmDeleteId(null)
  }

  return (
    <section className="pt-card pt-cat-section">
      <header className="pt-card-hd">
        <div>
          <h3>Media</h3>
          <p>{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => onFilePick(e, 'image')} />
          <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" style={{ display: 'none' }} onChange={e => onFilePick(e, 'video')} />
          <button className="pt-link" onClick={() => imageInputRef.current?.click()}>+ Image</button>
          <button className="pt-link" onClick={() => videoInputRef.current?.click()}>+ Video</button>
        </div>
      </header>

      {pendingFile && (
        <div className="pt-media-upload-row">
          <div className="pt-media-upload-icon">{pendingFile.type === 'image' ? '🖼' : '▶'}</div>
          <div className="pt-media-upload-info">
            <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginBottom: 4 }}>{pendingFile.file.name}</div>
            <input
              className="pt-input"
              style={{ fontSize: 12, padding: '4px 8px', height: 'auto' }}
              placeholder="Label…"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={() => void upload()} disabled={uploading || !labelInput.trim()}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => { setPendingFile(null); setLabelInput(''); setUploadError('') }}>Cancel</button>
          </div>
          {uploadError && <div className="pt-media-upload-error">{uploadError}</div>}
        </div>
      )}

      {items.length === 0 && !pendingFile ? (
        <div className="pt-media-empty">
          <div className="pt-media-empty-icon">◈</div>
          <div style={{ fontSize: 12, color: 'var(--pt-fg-4)' }}>No media yet — upload an image or video</div>
        </div>
      ) : (
        <div className="pt-media-grid">
          {items.map(item => (
            <div key={item.id} className="pt-media-tile">
              <button className="pt-media-tile-thumb" onClick={() => void openItem(item)} title={`Open ${item.label}`}>
                {item.type === 'image' && thumbnailUrls[item.id] ? (
                  <img src={thumbnailUrls[item.id]} alt={item.label} className="pt-media-thumb-img" />
                ) : (
                  <div className="pt-media-thumb-video">
                    <span className="pt-media-play-icon">▶</span>
                  </div>
                )}
              </button>
              <div className="pt-media-tile-label">{item.label}</div>
              {confirmDeleteId === item.id ? (
                <div className="pt-media-tile-confirm">
                  <span style={{ fontSize: 10, color: 'var(--pt-fg-3)' }}>Delete?</span>
                  <button className="pt-link" style={{ fontSize: 10, color: 'var(--pt-danger, oklch(0.55 0.22 25))' }} onClick={() => void confirmDelete(item)}>Yes</button>
                  <button className="pt-link" style={{ fontSize: 10 }} onClick={() => setConfirmDeleteId(null)}>No</button>
                </div>
              ) : (
                <button className="pt-media-tile-del" onClick={() => setConfirmDeleteId(item.id)} title="Delete">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Product detail panel ─────────────────────────────────────────────────────
function CatalogDetail({ product, products, protocol, baseCurrency }: {
  product: CatalogProduct
  products: CatalogProduct[]
  protocol: ProductProtocol | null
  baseCurrency: string
}) {
  const [showAddBatch, setShowAddBatch] = useState(false)
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

  const flag = stockFlag(product.totalStock)
  const barPct = Math.min(100, (product.totalStock / BAR_MAX) * 100)
  const thrPct = (LOW_THRESHOLD / BAR_MAX) * 100

  const supabase = useMemo(() => createClient(), [])
  const [coProducts, setCoProducts] = useState<{ product: CatalogProduct; count: number }[]>([])
  const [coLoading, setCoLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setCoLoading(true)
    setCoProducts([])
    async function load() {
      // Find all orders containing this product
      const { data: orderRows } = await supabase
        .from('order_items')
        .select('order_id')
        .eq('product_id', product.id)
      if (cancelled || !orderRows || orderRows.length === 0) {
        if (!cancelled) setCoLoading(false)
        return
      }
      const orderIds = [...new Set(orderRows.map(r => r.order_id))]
      // Find all other products in those orders
      const { data: coRows } = await supabase
        .from('order_items')
        .select('product_id')
        .in('order_id', orderIds)
        .neq('product_id', product.id)
      if (cancelled || !coRows) {
        if (!cancelled) setCoLoading(false)
        return
      }
      // Count co-occurrence frequency
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

      {!coLoading && (
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
      )}

      <ProtocolSection productId={product.id} protocol={protocol} />
      <ProductMediaSection productId={product.id} media={product.media} />

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
          <EmptyState
            size="sm"
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                <circle cx="12" cy="12" r="9"/>
                <line x1="12" y1="8" x2="12" y2="13"/>
                <circle cx="12" cy="16" r="0.8" fill="currentColor" stroke="none"/>
              </svg>
            }
            title="No protocol configured"
            body="Add a protocol to enable automatic reorder signals."
          />
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
