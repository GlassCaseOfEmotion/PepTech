'use client'

import { useRef, useState } from 'react'
import type { OrderAttachment } from '@/types/orders'
import {
  createOrderAttachmentUpload,
  confirmOrderAttachment,
  deleteOrderAttachment,
} from '@/app/orders/attachments-actions'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('video/')) return '🎥'
  return '📄'
}

function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
  const inputRef = useRef<HTMLInputElement>(null)

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

    // Upload directly to Supabase storage with XHR for progress
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

    const confirm = await confirmOrderAttachment(orderId, result.storagePath, file.name, file.type, file.size)
    if ('error' in confirm) { setError(confirm.error); setUploading(false); return }

    // Fetch full URL + thumbnail (images only) for the new attachment
    const isImage = confirm.data.mime_type.startsWith('image/')
    const [signedRes, thumbRes] = await Promise.all([
      fetch(`/api/attachments/signed-url?path=${encodeURIComponent(result.storagePath)}`),
      isImage
        ? fetch(`/api/attachments/signed-url?path=${encodeURIComponent(result.storagePath)}&width=80`)
        : Promise.resolve(null),
    ])
    if (signedRes.ok) {
      const signedData = await signedRes.json() as { url?: string }
      if (signedData.url) setSignedUrls(prev => ({ ...prev, [confirm.data.id]: signedData.url! }))
    }
    if (thumbRes?.ok) {
      const thumbData = await thumbRes.json() as { url?: string }
      if (thumbData.url) setThumbnailUrls(prev => ({ ...prev, [confirm.data.id]: thumbData.url! }))
    }

    setAttachments(prev => [confirm.data, ...prev])
    setUploading(false)
    setUploadName('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleDelete(attachment: OrderAttachment) {
    if (!confirm(`Delete "${attachment.file_name}"?`)) return
    const result = await deleteOrderAttachment(attachment.id)
    if ('error' in result) { setError(result.error); return }
    setAttachments(prev => prev.filter(a => a.id !== attachment.id))
    setSignedUrls(prev => { const next = { ...prev }; delete next[attachment.id]; return next })
    setThumbnailUrls(prev => { const next = { ...prev }; delete next[attachment.id]; return next })
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

  const hasContent = invoice || attachments.length > 0 || uploading

  return (
    <section className="pt-card">
      <header className="pt-card-hd">
        <div><h3>Attachments</h3></div>
        <button
          className="pt-btn pt-btn-ghost pt-btn-xs"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          + Add
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*,application/pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </header>
      <div className="pt-card-body" style={{ padding: 0 }}>
        {error && (
          <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--pt-danger)' }}>{error}</div>
        )}
        {!hasContent && (
          <div className="pt-od-attach-empty">No attachments yet</div>
        )}
        <ul className="pt-od-attach-list">
          {invoice && (
            <li className="pt-od-attach-row pt-od-attach-invoice">
              <span className="pt-od-attach-icon">📄</span>
              <span className="pt-od-attach-name">Invoice #{invoice.invoice_number}</span>
              <div className="pt-od-attach-actions">
                <a
                  href={invoice.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pt-od-attach-btn"
                  title="Download invoice"
                >↓</a>
              </div>
            </li>
          )}
          {uploading && (
            <li className="pt-od-attach-progress">
              <div style={{ fontSize: 11, color: 'var(--pt-fg-3)' }}>Uploading {uploadName}…</div>
              <div className="pt-od-attach-progress-bar">
                <div className="pt-od-attach-progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
            </li>
          )}
          {attachments.map(a => (
            <li key={a.id} className="pt-od-attach-row">
              <span className="pt-od-attach-icon">
                {a.mime_type.startsWith('image/') && thumbnailUrls[a.id]
                  ? <img src={thumbnailUrls[a.id]} alt={a.file_name} className="pt-od-attach-thumb" loading="lazy" />
                  : fileIcon(a.mime_type)
                }
              </span>
              <span className="pt-od-attach-name">{a.file_name}</span>
              <span className="pt-od-attach-size">{fmtSize(a.file_size)}</span>
              <div className="pt-od-attach-actions">
                {signedUrls[a.id] && (
                  <a
                    href={signedUrls[a.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pt-od-attach-btn"
                    title="Open file"
                  >↗</a>
                )}
                {conversationId && (
                  <button
                    className="pt-od-attach-btn"
                    title="Send to customer"
                    onClick={() => handleSend(a)}
                  >
                    {sentId === a.id ? '✓' : '→'}
                  </button>
                )}
                <button
                  className="pt-od-attach-btn is-danger"
                  title="Delete"
                  onClick={() => handleDelete(a)}
                >✕</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
