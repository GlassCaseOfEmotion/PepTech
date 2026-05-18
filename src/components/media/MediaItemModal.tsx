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

  // Collects tag selections made while upload is in progress (item.id === '__pending__')
  const pendingTagsRef = useRef<Map<string, string>>(new Map())
  const prevItemIdRef = useRef(item.id)
  const itemRef = useRef(item)
  itemRef.current = item
  const onUpdatedRef = useRef(onUpdated)
  onUpdatedRef.current = onUpdated

  // When item.id transitions from __pending__ to real, apply queued tags
  useEffect(() => {
    const prevId = prevItemIdRef.current
    prevItemIdRef.current = item.id

    if (prevId === '__pending__' && item.id !== '__pending__') {
      // Upload just completed — apply any tags the user selected during upload
      if (pendingTagsRef.current.size > 0) {
        const toApply = new Map(pendingTagsRef.current)
        pendingTagsRef.current = new Map()
        const snapshot = itemRef.current
        void Promise.all(
          [...toApply.keys()].map(productId => tagMediaItemToProduct(snapshot.id, productId))
        ).then(results => {
          const succeeded = [...toApply.entries()].filter((_, i) => !('error' in results[i]))
          if (succeeded.length > 0) {
            onUpdatedRef.current({
              ...snapshot,
              productTags: [
                ...snapshot.productTags,
                ...succeeded.map(([productId, productName]) => ({ productId, productName })),
              ],
            })
          }
        })
      }
      return // Keep taggedIds as-is — user's selections remain visible
    }

    // Normal item open or switch — reset to item's current state
    setLabel(item.label)
    setTaggedIds(new Set(item.productTags.map(t => t.productId)))
    setConfirmDelete(false)
    setError('')
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch full-size URL for images (skip while pending — we already have the object URL)
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

  async function handleLabelBlur() {
    if (isPending || label.trim() === item.label || !label.trim()) return
    setSaving(true)
    const result = await updateMediaItemLabel(item.id, label.trim())
    setSaving(false)
    if ('error' in result) { setError(result.error); return }
    onUpdated({ ...item, label: label.trim() })
  }

  function toggleProduct(productId: string, productName: string) {
    const isTagged = taggedIds.has(productId)

    // Optimistic UI — always instant
    setTaggedIds(prev => {
      const next = new Set(prev)
      if (isTagged) next.delete(productId)
      else next.add(productId)
      return next
    })

    if (isPending) {
      // Queue for after upload completes
      if (isTagged) pendingTagsRef.current.delete(productId)
      else pendingTagsRef.current.set(productId, productName)
      return
    }

    // Real item — fire API in background, revert on error
    void (async () => {
      const result = isTagged
        ? await untagMediaItemFromProduct(item.id, productId)
        : await tagMediaItemToProduct(item.id, productId)

      if ('error' in result) {
        setError(result.error)
        setTaggedIds(prev => {
          const next = new Set(prev)
          if (isTagged) next.add(productId)
          else next.delete(productId)
          return next
        })
        return
      }

      onUpdated({
        ...item,
        productTags: isTagged
          ? item.productTags.filter(t => t.productId !== productId)
          : [...item.productTags, { productId, productName }],
      })
    })()
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

        {/* Indeterminate progress bar across top of modal */}
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
            onBlur={() => void handleLabelBlur()}
            style={{ marginBottom: 16 }}
            disabled={saving || isPending}
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
                    onChange={() => toggleProduct(p.id, p.name)}
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
                  disabled={isUploading}
                  onClick={isUploading ? undefined : onClose}
                >
                  {isUploading ? 'Uploading…' : 'Save'}
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
