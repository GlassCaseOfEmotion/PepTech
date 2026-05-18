'use client'

import { useState, useEffect, useRef } from 'react'
import { createProductMedia, saveProductMediaPath, deleteProductMedia } from '@/app/catalog/actions'
import type { ProductMediaItem } from '@/types/catalog'

function ProductMediaSection({ productId, media: initialMedia }: { productId: string; media: ProductMediaItem[] }) {
  const [items, setItems] = useState<ProductMediaItem[]>(initialMedia)
  const [pendingFile, setPendingFile] = useState<{ file: File; type: 'image' | 'video' | 'pdf' } | null>(null)
  const [labelInput, setLabelInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string | null; type: 'image' | 'video' | 'pdf'; loading: boolean } | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lightbox])

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'pdf') {
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
      const ext = pendingFile.file.name.split('.').pop() ?? (pendingFile.type === 'image' ? 'jpg' : pendingFile.type === 'video' ? 'mp4' : 'pdf')
      const result = await createProductMedia(productId, labelInput.trim(), pendingFile.type, ext)
      if ('error' in result) { setUploadError(result.error); return }
      const putRes = await fetch(result.uploadUrl, {
        method: 'PUT',
        body: pendingFile.file,
        headers: { 'Content-Type': pendingFile.file.type },
      })
      if (!putRes.ok) {
        setUploadError('Upload failed — please try again')
        void deleteProductMedia(result.id, result.storagePath)
        return
      }
      const saveResult = await saveProductMediaPath(result.id, result.storagePath)
      if ('error' in saveResult) {
        setUploadError(saveResult.error)
        setPendingFile(null)
        setLabelInput('')
        return
      }
      let thumbnailUrl: string | undefined
      if (pendingFile.type === 'image') {
        const res = await fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(result.storagePath)}&width=400`)
        if (res.ok) {
          const { url } = await res.json() as { url: string }
          thumbnailUrl = url
        }
      }
      const newItem: ProductMediaItem = {
        id: result.id,
        label: labelInput.trim(),
        type: pendingFile.type,
        storage_path: result.storagePath,
        sort_order: items.length,
        thumbnailUrl,
      }
      setItems(prev => [...prev, newItem])
      setPendingFile(null)
      setLabelInput('')
    } finally {
      setUploading(false)
    }
  }

  async function openItem(item: ProductMediaItem) {
    // Show lightbox immediately — images use the thumbnail as placeholder, videos show a spinner
    setLightbox({
      url: item.type === 'image' ? (item.thumbnailUrl ?? null) : null,
      type: item.type,
      loading: true,
    })
    const res = await fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(item.storage_path)}`)
    if (!res.ok) { setLightbox(prev => prev ? { ...prev, loading: false } : null); return }
    const { url } = await res.json() as { url: string }
    setLightbox({ url, type: item.type, loading: false })
  }

  async function confirmDelete(item: ProductMediaItem) {
    const result = await deleteProductMedia(item.id, productId)
    if ('error' in result) return
    setItems(prev => prev.filter(m => m.id !== item.id))
    setConfirmDeleteId(null)
  }

  return (
    <section className="pt-card pt-cat-section">
      <header className="pt-card-hd">
        <div>
          <h3>Media</h3>
          <p>{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href={`/media?product=${productId}`} className="pt-link" style={{ fontSize: 11 }}>
            Manage in library →
          </a>
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => onFilePick(e, 'image')} />
          <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" style={{ display: 'none' }} onChange={e => onFilePick(e, 'video')} />
          <input ref={pdfInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => onFilePick(e, 'pdf')} />
          <button className="pt-link" onClick={() => imageInputRef.current?.click()}>+ Image</button>
          <button className="pt-link" onClick={() => videoInputRef.current?.click()}>+ Video</button>
          <button className="pt-link" onClick={() => pdfInputRef.current?.click()}>+ PDF</button>
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
                {item.type === 'image' && item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt={item.label} className="pt-media-thumb-img" loading="lazy" />
                ) : item.type === 'video' ? (
                  <div className="pt-media-thumb-video">
                    <span className="pt-media-play-icon">▶</span>
                  </div>
                ) : (
                  <div className="pt-media-thumb-pdf">
                    <span className="pt-media-pdf-icon">PDF</span>
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
      {lightbox && (
        <div className="pt-lightbox" onClick={() => setLightbox(null)}>
          {lightbox.url === null || (lightbox.type === 'video' && lightbox.loading) ? (
            <div className="pt-lightbox-spinner" onClick={e => e.stopPropagation()} />
          ) : lightbox.type === 'image' ? (
            <img src={lightbox.url} alt="Full size" className="pt-lightbox-img" onClick={e => e.stopPropagation()} />
          ) : (
            // TODO (Task 8): add PDF lightbox — pdf currently falls through to video branch, but no pdf upload exists yet
            <video src={lightbox.url} className="pt-lightbox-img" controls autoPlay onClick={e => e.stopPropagation()} />
          )}
          <button className="pt-lightbox-close" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}
    </section>
  )
}

export { ProductMediaSection as CatalogDetailMedia }
