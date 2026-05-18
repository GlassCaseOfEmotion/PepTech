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
  const [fullSizeUrl, setFullSizeUrl] = useState<string | null>(item.thumbnailUrl ?? null)
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
    setFullSizeUrl(item.thumbnailUrl ?? null)
    if (item.type !== 'image') return
    void fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(item.storagePath)}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { url: string } | null) => { if (data?.url) setFullSizeUrl(data.url) })
  }, [item.id, item.type, item.storagePath, item.thumbnailUrl])

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

  async function handleOpen() {
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
                <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={() => void handleOpen()}>Open ↗</button>
              </>
            )}
          </div>
        </div>

        <button className="pt-lightbox-close" onClick={onClose}>✕</button>
      </div>
    </div>
  )
}
