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
  isNewUpload = false,
  uploadStatus = 'done',
  uploadError = '',
}: {
  item: MediaItem
  products: { id: string; name: string }[]
  onClose: () => void
  onUpdated: (item: MediaItem) => void
  onDeleted: (id: string) => void
  isNewUpload?: boolean
  uploadStatus?: 'uploading' | 'done' | 'error'
  uploadError?: string
}) {
  const isPending = item.id === '__pending__'
  const isUploading = uploadStatus === 'uploading'
  const isError = uploadStatus === 'error'

  const [label, setLabel] = useState(item.label)
  const [fullSizeUrl, setFullSizeUrl] = useState<string | null>(item.thumbnailUrl ?? null)
  const [taggedIds, setTaggedIds] = useState<Set<string>>(new Set(item.productTags.map(t => t.productId)))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const prevItemIdRef = useRef(item.id)

  // When item.id changes: preserve taggedIds on pending→real transition, reset otherwise
  useEffect(() => {
    const prevId = prevItemIdRef.current
    prevItemIdRef.current = item.id

    if (prevId === '__pending__') return // Upload just completed — keep user's checkbox selections

    setLabel(item.label)
    setTaggedIds(new Set(item.productTags.map(t => t.productId)))
    setConfirmDelete(false)
    setError('')
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setFullSizeUrl(item.thumbnailUrl ?? null)
    if (isPending || item.type !== 'image') return
    void fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(item.storagePath)}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { url: string } | null) => { if (data?.url) setFullSizeUrl(data.url) })
  }, [item.id, item.type, item.storagePath, item.thumbnailUrl, isPending])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isUploading) onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, isUploading])

  function toggleProduct(productId: string) {
    setTaggedIds(prev => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError('')

    // Save label if changed
    if (label.trim() && label.trim() !== item.label) {
      const result = await updateMediaItemLabel(item.id, label.trim())
      if ('error' in result) { setSaving(false); setError(result.error); return }
    }

    // Diff tag changes
    const originalIds = new Set(item.productTags.map(t => t.productId))
    const toAdd = products.filter(p => taggedIds.has(p.id) && !originalIds.has(p.id))
    const toRemove = item.productTags.filter(t => !taggedIds.has(t.productId))

    if (toAdd.length > 0 || toRemove.length > 0) {
      const results = await Promise.all([
        ...toAdd.map(p => tagMediaItemToProduct(item.id, p.id)),
        ...toRemove.map(t => untagMediaItemFromProduct(item.id, t.productId)),
      ])
      if (results.some(r => 'error' in r)) {
        setSaving(false)
        setError('Some changes failed to save — please try again')
        return
      }
      const finalTags = [
        ...item.productTags.filter(t => taggedIds.has(t.productId)),
        ...toAdd.map(p => ({ productId: p.id, productName: p.name })),
      ]
      onUpdated({ ...item, label: label.trim() || item.label, productTags: finalTags })
    }

    onClose()
  }

  async function handleDelete() {
    const result = await deleteMediaItem(item.id, item.storagePath)
    if ('error' in result) { setError(result.error); return }
    onDeleted(item.id)
  }

  async function handleOpen() {
    const res = await fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(item.storagePath)}`)
    if (!res.ok) return
    const { url } = await res.json() as { url: string }
    window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="pt-lightbox" onClick={isUploading ? undefined : onClose}>
      <div className="pt-media-lib-modal" onClick={e => e.stopPropagation()}>

        {isUploading && (
          <div className="pt-media-lib-upload-bar">
            <div className="pt-media-lib-upload-bar-fill" />
          </div>
        )}

        {/* Preview */}
        <div className="pt-media-lib-modal-preview" style={{ position: 'relative' }}>
          {item.type === 'image' && fullSizeUrl ? (
            <img src={fullSizeUrl} alt={item.label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }} />
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
          {isUploading && (
            <div className="pt-media-lib-uploading-overlay">Uploading…</div>
          )}
        </div>

        {/* Details */}
        <div className="pt-media-lib-modal-body">
          {isNewUpload && (
            <div className={`pt-media-lib-modal-banner${isError ? ' is-error' : ''}`}>
              {isUploading
                ? 'Uploading — select products while you wait'
                : isError
                ? (uploadError || 'Upload failed — please try again')
                : 'Uploaded — assign to products below'}
            </div>
          )}

          <div className="pt-media-lib-modal-label">Name</div>
          <input
            className="pt-input"
            value={label}
            onChange={e => setLabel(e.target.value)}
            style={{ marginBottom: 16 }}
            disabled={isPending}
          />

          <div className="pt-media-lib-modal-label">Assign to products</div>
          {products.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--pt-fg-4)', padding: '4px 0' }}>No products yet</div>
          ) : (
            <div className="pt-media-lib-product-list">
              {products.map(p => (
                <label key={p.id} className="pt-media-lib-product-row">
                  <input
                    type="checkbox"
                    checked={taggedIds.has(p.id)}
                    onChange={() => toggleProduct(p.id)}
                  />
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
          )}

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
                {!isPending && (
                  <>
                    <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => setConfirmDelete(true)}>Delete</button>
                    <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => void handleOpen()}>Open ↗</button>
                  </>
                )}
                <button
                  className="pt-btn pt-btn-primary"
                  style={{ fontSize: 11, marginLeft: 'auto' }}
                  disabled={isUploading || saving}
                  onClick={() => void handleSave()}
                >
                  {saving ? 'Saving…' : isUploading ? 'Uploading…' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>

        {!isUploading && <button className="pt-lightbox-close" onClick={onClose}>✕</button>}
      </div>
    </div>
  )
}
