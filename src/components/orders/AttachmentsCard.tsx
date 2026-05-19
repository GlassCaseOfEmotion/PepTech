'use client'

import { useEffect, useRef, useState } from 'react'
import type { OrderAttachment } from '@/types/orders'
import {
  createOrderAttachmentUpload,
  confirmOrderAttachment,
  deleteOrderAttachment,
} from '@/app/orders/attachments-actions'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

type Lightbox = { url: string | null; type: 'image' | 'video'; loading: boolean }

type Props = {
  orderId: string
  conversationId: string | null
  invoice: { id: string; invoice_number: string; pdf_path: string; signedUrl: string } | null
  initialAttachments: OrderAttachment[]
  attachmentSignedUrls: Record<string, string>
  attachmentThumbnailUrls: Record<string, string>
}

export function AttachmentsCard({ orderId, conversationId, invoice, initialAttachments, attachmentSignedUrls, attachmentThumbnailUrls }: Props) {
  const [attachments, setAttachments] = useState<OrderAttachment[]>(initialAttachments)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>(attachmentSignedUrls)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>(attachmentThumbnailUrls)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadName, setUploadName] = useState('')
  const [error, setError] = useState('')
  const [sentId, setSentId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<Lightbox | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lightbox])

  async function openAttachment(a: OrderAttachment) {
    const isImage = a.mime_type.startsWith('image/')
    const isVideo = a.mime_type.startsWith('video/')

    if (!isImage && !isVideo) {
      const url = signedUrls[a.id]
      if (url) window.open(url, '_blank', 'noopener')
      return
    }

    setLightbox({ url: isImage ? (thumbnailUrls[a.id] ?? null) : null, type: isImage ? 'image' : 'video', loading: true })

    const existing = signedUrls[a.id]
    if (existing) {
      setLightbox({ url: existing, type: isImage ? 'image' : 'video', loading: false })
      return
    }
    const res = await fetch(`/api/attachments/signed-url?path=${encodeURIComponent(a.storage_path)}`)
    if (!res.ok) { setLightbox(prev => prev ? { ...prev, loading: false } : null); return }
    const { url } = await res.json() as { url: string }
    setSignedUrls(prev => ({ ...prev, [a.id]: url }))
    setLightbox({ url, type: isImage ? 'image' : 'video', loading: false })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) { setError('File too large — max 5 MB'); return }

    setError('')
    setUploading(true)
    setUploadProgress(0)
    setUploadName(file.name)

    const result = await createOrderAttachmentUpload(orderId, file.name, file.type)
    if ('error' in result) { setError(result.error); setUploading(false); return }

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', ev => {
          if (ev.lengthComputable) setUploadProgress(Math.round(ev.loaded / ev.total * 100))
        })
        xhr.addEventListener('load', () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)))
        xhr.addEventListener('error', () => reject(new Error('Upload failed')))
        xhr.open('PUT', result.signedUploadUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setUploading(false)
      setUploadProgress(0)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    const confirmed = await confirmOrderAttachment(orderId, result.storagePath, file.name, file.type, file.size)
    if ('error' in confirmed) { setError(confirmed.error); setUploading(false); return }

    const isImage = confirmed.data.mime_type.startsWith('image/')
    const [signedRes, thumbRes] = await Promise.all([
      fetch(`/api/attachments/signed-url?path=${encodeURIComponent(result.storagePath)}`),
      isImage
        ? fetch(`/api/attachments/signed-url?path=${encodeURIComponent(result.storagePath)}&width=300`)
        : Promise.resolve(null),
    ])
    if (signedRes.ok) {
      const { url } = await signedRes.json() as { url?: string }
      if (url) setSignedUrls(prev => ({ ...prev, [confirmed.data.id]: url }))
    }
    if (thumbRes?.ok) {
      const { url } = await thumbRes.json() as { url?: string }
      if (url) setThumbnailUrls(prev => ({ ...prev, [confirmed.data.id]: url }))
    }

    setAttachments(prev => [confirmed.data, ...prev])
    setUploading(false)
    setUploadName('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleDelete(attachment: OrderAttachment) {
    const result = await deleteOrderAttachment(attachment.id)
    if ('error' in result) { setError(result.error); return }
    setAttachments(prev => prev.filter(a => a.id !== attachment.id))
    setSignedUrls(prev => { const next = { ...prev }; delete next[attachment.id]; return next })
    setThumbnailUrls(prev => { const next = { ...prev }; delete next[attachment.id]; return next })
    setConfirmDeleteId(null)
  }

  async function handleSend(attachment: OrderAttachment) {
    if (!conversationId) return
    setError('')
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, storagePath: attachment.storage_path, bucket: 'media' }),
    })
    if (res.ok) {
      setSentId(attachment.id)
      setTimeout(() => setSentId(null), 2000)
    } else {
      setError('Send failed')
    }
  }

  const hasItems = invoice || attachments.length > 0

  return (
    <section className="pt-card">
      <header className="pt-card-hd">
        <div><h3>Attachments</h3></div>
        <button className="pt-btn pt-btn-ghost pt-btn-xs" onClick={() => inputRef.current?.click()} disabled={uploading}>
          + Add
        </button>
        <input ref={inputRef} type="file" accept="image/*,video/*,application/pdf" style={{ display: 'none' }} onChange={handleFileChange} />
      </header>

      <div className="pt-card-body" style={{ padding: 0 }}>
        {error && <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--pt-danger)' }}>{error}</div>}

        {uploading && (
          <div style={{ padding: '8px 14px', borderTop: '0.5px solid var(--pt-line-soft)' }}>
            <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 5 }}>Uploading {uploadName}…</div>
            <div className="pt-od-attach-progress-bar">
              <div className="pt-od-attach-progress-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {!hasItems && !uploading && (
          <div className="pt-od-attach-empty">No attachments yet</div>
        )}

        {hasItems && (
          <div className="pt-media-grid">

            {/* Invoice tile */}
            {invoice && (
              <div className="pt-media-tile">
                <a
                  href={invoice.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pt-media-tile-thumb"
                  title={`Invoice #${invoice.invoice_number}`}
                >
                  <div className="pt-media-thumb-pdf">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span className="pt-media-pdf-icon">PDF</span>
                      <span style={{ fontSize: 9, color: 'var(--pt-fg-4)', fontFamily: 'var(--pt-mono)' }}>#{invoice.invoice_number}</span>
                    </div>
                  </div>
                </a>
              </div>
            )}

            {/* Attachment tiles */}
            {attachments.map(a => {
              const isImage = a.mime_type.startsWith('image/')
              const isVideo = a.mime_type.startsWith('video/')
              return (
                <div key={a.id} className="pt-media-tile">
                  <button className="pt-media-tile-thumb" onClick={() => void openAttachment(a)} title={a.file_name}>
                    {isImage && thumbnailUrls[a.id] ? (
                      <img src={thumbnailUrls[a.id]} alt={a.file_name} className="pt-media-thumb-img" loading="lazy" />
                    ) : isVideo ? (
                      <div className="pt-media-thumb-video">
                        <span className="pt-media-play-icon">▶</span>
                      </div>
                    ) : (
                      <div className="pt-media-thumb-pdf">
                        <span className="pt-media-pdf-icon">PDF</span>
                      </div>
                    )}
                  </button>

                  {/* Send overlay — top-left, only with linked conversation */}
                  {conversationId && (
                    <button className="pt-od-tile-send" title="Send to customer" onClick={() => handleSend(a)}>
                      {sentId === a.id ? '✓' : '→'}
                    </button>
                  )}

                  {/* Delete overlay — top-right */}
                  {confirmDeleteId === a.id ? (
                    <div className="pt-media-tile-confirm">
                      <span style={{ fontSize: 10, color: 'var(--pt-fg-3)' }}>Delete?</span>
                      <button className="pt-link" style={{ fontSize: 10, color: 'var(--pt-danger)' }} onClick={() => void handleDelete(a)}>Yes</button>
                      <button className="pt-link" style={{ fontSize: 10 }} onClick={() => setConfirmDeleteId(null)}>No</button>
                    </div>
                  ) : (
                    <button className="pt-media-tile-del" onClick={() => setConfirmDeleteId(a.id)} title="Delete">✕</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {lightbox && (
        <div className="pt-lightbox" onClick={() => setLightbox(null)}>
          {lightbox.url === null || (lightbox.type === 'video' && lightbox.loading) ? (
            <div className="pt-lightbox-spinner" onClick={e => e.stopPropagation()} />
          ) : lightbox.type === 'image' ? (
            <img src={lightbox.url} alt="Full size" className="pt-lightbox-img" onClick={e => e.stopPropagation()} />
          ) : (
            <video src={lightbox.url} className="pt-lightbox-img" controls autoPlay onClick={e => e.stopPropagation()} />
          )}
          <button className="pt-lightbox-close" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}
    </section>
  )
}
