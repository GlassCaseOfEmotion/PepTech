'use client'

import { useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createMediaItem, saveMediaItemPath } from '@/app/media/actions'
import { MediaItemModal } from '@/components/media/MediaItemModal'
import type { MediaItem } from '@/types/media'

type FilterType = 'all' | 'image' | 'video' | 'pdf' | 'untagged'

const TYPE_LABELS: Record<FilterType, string> = {
  all: 'All',
  image: 'Images',
  video: 'Videos',
  pdf: 'PDFs',
  untagged: 'Untagged',
}

export function MediaLibraryView({
  items: initialItems,
  products,
}: {
  items: MediaItem[]
  products: { id: string; name: string }[]
}) {
  const searchParams = useSearchParams()

  const [items, setItems] = useState<MediaItem[]>(initialItems)
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [productFilter, setProductFilter] = useState<string>(searchParams.get('product') ?? 'all')
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const [isNewUpload, setIsNewUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const filtered = items.filter(item => {
    if (typeFilter === 'untagged') return item.productTags.length === 0
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (productFilter !== 'all' && !item.productTags.some(t => t.productId === productFilter)) return false
    return true
  })

  async function handleUpload(file: File) {
    const type: 'image' | 'video' | 'pdf' = file.type.startsWith('image/') ? 'image'
      : file.type.startsWith('video/') ? 'video'
      : 'pdf'
    const label = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
    const ext = file.name.split('.').pop() ?? (type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : 'pdf')
    setUploading(true)
    setUploadError('')
    try {
      const result = await createMediaItem(label, type, ext)
      if ('error' in result) { setUploadError(result.error); return }
      const putRes = await fetch(result.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!putRes.ok) {
        setUploadError('Upload failed — please try again')
        return
      }
      await saveMediaItemPath(result.id, result.storagePath)
      const newItem: MediaItem = {
        id: result.id,
        label,
        type,
        storagePath: result.storagePath,
        sortOrder: items.length,
        createdAt: new Date().toISOString(),
        productTags: [],
        thumbnailUrl: type === 'image' ? URL.createObjectURL(file) : undefined,
      }
      setItems(prev => [newItem, ...prev])
      setIsNewUpload(true)
      setSelectedItem(newItem)
    } finally {
      setUploading(false)
    }
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleUpload(file)
    e.target.value = ''
  }

  function handleItemUpdated(updated: MediaItem) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
    setSelectedItem(updated)
  }

  function handleItemDeleted(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    setSelectedItem(null)
  }

  function handleModalClose() {
    setSelectedItem(null)
    setIsNewUpload(false)
  }

  return (
    <div className="pt-media-lib">
      {/* Filter bar */}
      <div className="pt-media-lib-bar">
        <div className="pt-media-lib-pills">
          {(['all', 'image', 'video', 'pdf', 'untagged'] as FilterType[]).map(f => (
            <button
              key={f}
              className={`pt-media-lib-pill${typeFilter === f ? ' is-on' : ''}`}
              onClick={() => setTypeFilter(f)}
            >
              {TYPE_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="pt-media-lib-bar-right">
          <select
            className="pt-select"
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
          >
            <option value="all">All products</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,application/pdf"
            style={{ display: 'none' }}
            onChange={onFilePick}
          />
          <button
            className="pt-btn pt-btn-primary"
            disabled={uploading}
            onClick={() => !uploading && uploadInputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : '↑ Upload'}
          </button>
        </div>
      </div>

      {uploadError && (
        <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--pt-danger)' }}>{uploadError}</div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="pt-media-empty">
          <div className="pt-media-empty-icon">◈</div>
          <div style={{ fontSize: 12, color: 'var(--pt-fg-4)' }}>
            {typeFilter === 'untagged' ? 'No untagged items' : 'No media yet — upload an image, video, or PDF'}
          </div>
        </div>
      ) : (
        <div className="pt-media-lib-grid">
          {filtered.map(item => (
            <div key={item.id} className="pt-media-tile">
              <button
                className="pt-media-tile-thumb"
                onClick={() => { setIsNewUpload(false); setSelectedItem(item) }}
                title={item.label}
              >
                {item.type === 'image' && item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt={item.label} className="pt-media-thumb-img" loading="lazy" />
                ) : item.type === 'video' ? (
                  <div className="pt-media-thumb-video">
                    <span className="pt-media-play-icon">▶</span>
                  </div>
                ) : item.type === 'image' ? (
                  <div className="pt-media-thumb-video" style={{ color: 'var(--pt-fg-4)' }}>
                    <span style={{ fontSize: 20 }}>🖼</span>
                  </div>
                ) : (
                  <div className="pt-media-thumb-pdf">
                    <span className="pt-media-pdf-icon">PDF</span>
                  </div>
                )}
              </button>
              <div className="pt-media-tile-label">{item.label}</div>
              {item.productTags.length > 0 && (
                <div className="pt-media-lib-tag-hint">
                  {item.productTags.length === 1
                    ? item.productTags[0].productName
                    : `${item.productTags.length} products`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedItem && (
        <MediaItemModal
          item={selectedItem}
          products={products}
          onClose={handleModalClose}
          onUpdated={handleItemUpdated}
          onDeleted={handleItemDeleted}
          isNewUpload={isNewUpload}
        />
      )}
    </div>
  )
}
