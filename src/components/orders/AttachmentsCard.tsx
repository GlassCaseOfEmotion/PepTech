'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OrderAttachment } from '@/types/orders'
import {
  createOrderAttachmentUpload,
  confirmOrderAttachment,
  deleteOrderAttachment,
} from '@/app/orders/attachments-actions'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

type SendState = 'idle' | 'confirming' | 'sending' | 'sent'
type Lightbox = { url: string | null; type: 'image' | 'video'; loading: boolean }

function DocTile({ label, accent }: { label: string; accent: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accent}0d` }}>
      <svg width="52" height="64" viewBox="0 0 52 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="40" height="52" rx="3" fill="white" stroke={`${accent}30`} strokeWidth="1.5" />
        <path d="M30 2 L42 14 L30 14 Z" fill={`${accent}18`} />
        <path d="M30 2 L42 14" stroke={`${accent}50`} strokeWidth="1.5" strokeLinecap="round" />
        <rect x="8" y="22" width="24" height="2" rx="1" fill={`${accent}30`} />
        <rect x="8" y="28" width="28" height="2" rx="1" fill={`${accent}20`} />
        <rect x="8" y="34" width="20" height="2" rx="1" fill={`${accent}20`} />
        <rect x="8" y="40" width="26" height="2" rx="1" fill={`${accent}20`} />
        <rect x="0" y="46" width="52" height="18" rx="3" fill={accent} />
        <text x="26" y="59" textAnchor="middle" fill="white" fontSize="8.5" fontWeight="600" fontFamily="monospace" letterSpacing="0.08em">
          {label}
        </text>
      </svg>
    </div>
  )
}

function SendOverlay({ state, customerName, conversationId, onConfirm, onSend, onCancel, onNavigate }: {
  state: SendState
  customerName: string
  conversationId: string
  onConfirm: () => void
  onSend: () => void
  onCancel: () => void
  onNavigate: () => void
}) {
  if (state === 'idle') return (
    <button className="pt-od-send-bar" onClick={onConfirm}>
      Send to {customerName}
    </button>
  )
  if (state === 'confirming') return (
    <div className="pt-od-send-overlay">
      <div className="pt-od-send-overlay-inner">
        <div className="pt-od-send-to">Send to</div>
        <div className="pt-od-send-name">{customerName}</div>
        <div className="pt-od-send-btns">
          <button className="pt-od-send-confirm-btn" onClick={onSend}>Send</button>
          <button className="pt-od-send-cancel-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
  if (state === 'sending') return (
    <div className="pt-od-send-overlay">
      <div className="pt-od-send-overlay-inner">
        <div className="pt-od-send-to" style={{ marginBottom: 10 }}>Sending…</div>
        <div className="pt-od-send-progressbar">
          <div className="pt-od-send-progressbar-fill" />
        </div>
      </div>
    </div>
  )
  return (
    <div className="pt-od-send-overlay">
      <div className="pt-od-send-overlay-inner">
        <div className="pt-od-send-check">✓</div>
        <div className="pt-od-send-to" style={{ marginTop: 4 }}>Sent</div>
        <button className="pt-od-send-goto" onClick={onNavigate}>Go to chat →</button>
      </div>
    </div>
  )
}

type Props = {
  orderId: string
  conversationId: string | null
  customerName: string
  invoice: { id: string; invoice_number: string; pdf_path: string; signedUrl: string } | null
  initialAttachments: OrderAttachment[]
  attachmentSignedUrls: Record<string, string>
  attachmentThumbnailUrls: Record<string, string>
}

export function AttachmentsCard({ orderId, conversationId, customerName, invoice, initialAttachments, attachmentSignedUrls, attachmentThumbnailUrls }: Props) {
  const [attachments, setAttachments] = useState<OrderAttachment[]>(initialAttachments)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>(attachmentSignedUrls)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>(attachmentThumbnailUrls)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadName, setUploadName] = useState('')
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [sendStates, setSendStates] = useState<Record<string, SendState>>({})
  const [invoiceSendState, setInvoiceSendState] = useState<SendState>('idle')
  const [lightbox, setLightbox] = useState<Lightbox | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lightbox])

  function getSendState(id: string): SendState {
    return sendStates[id] ?? 'idle'
  }

  function setSendState(id: string, state: SendState) {
    setSendStates(prev => ({ ...prev, [id]: state }))
  }

  async function doSend(storagePath: string, bucket: string, id: string, setFn: (s: SendState) => void) {
    if (!conversationId) return
    setFn('sending')
    setError('')
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, storagePath, bucket }),
    })
    if (res.ok) {
      setFn('sent')
      setTimeout(() => setFn('idle'), 4000)
    } else {
      setFn('idle')
      setError('Send failed — please try again')
    }
  }

  function doSendAttachment(attachment: OrderAttachment) {
    return doSend(attachment.storage_path, 'media', attachment.id, (s) => setSendState(attachment.id, s))
  }

  function doSendInvoice() {
    if (!invoice) return
    return doSend(invoice.pdf_path, 'invoices', 'invoice', setInvoiceSendState)
  }

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
    if (existing) { setLightbox({ url: existing, type: isImage ? 'image' : 'video', loading: false }); return }
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
        ? fetch(`/api/attachments/signed-url?path=${encodeURIComponent(result.storagePath)}&width=300&height=300`)
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
                <a href={invoice.signedUrl} target="_blank" rel="noopener noreferrer" className="pt-media-tile-thumb" title={`Invoice #${invoice.invoice_number}`}>
                  <DocTile label={`#${invoice.invoice_number}`} accent="#3b6ef0" />
                </a>
                {conversationId && <SendOverlay
                  state={invoiceSendState}
                  customerName={customerName}
                  conversationId={conversationId}
                  onConfirm={() => setInvoiceSendState('confirming')}
                  onSend={() => void doSendInvoice()}
                  onCancel={() => setInvoiceSendState('idle')}
                  onNavigate={() => router.push(`/inbox?conversation=${conversationId}`)}
                />}
              </div>
            )}

            {/* Attachment tiles */}
            {attachments.map(a => {
              const isImage = a.mime_type.startsWith('image/')
              const isVideo = a.mime_type.startsWith('video/')
              const sendState = getSendState(a.id)

              return (
                <div key={a.id} className="pt-media-tile">
                  {/* Thumb */}
                  <button
                    className="pt-media-tile-thumb"
                    onClick={() => sendState === 'idle' ? void openAttachment(a) : undefined}
                    title={a.file_name}
                    style={{ cursor: sendState !== 'idle' ? 'default' : 'pointer' }}
                  >
                    {isImage && thumbnailUrls[a.id] ? (
                      <img src={thumbnailUrls[a.id]} alt={a.file_name} className="pt-media-thumb-img" loading="lazy" />
                    ) : isVideo ? (
                      <div className="pt-media-thumb-video">
                        <span className="pt-media-play-icon">▶</span>
                      </div>
                    ) : (
                      <DocTile label="PDF" accent="#e05c3a" />
                    )}
                  </button>

                  {/* Send flow — only when conversation exists */}
                  {conversationId && <SendOverlay
                    state={sendState}
                    customerName={customerName}
                    conversationId={conversationId}
                    onConfirm={() => setSendState(a.id, 'confirming')}
                    onSend={() => void doSendAttachment(a)}
                    onCancel={() => setSendState(a.id, 'idle')}
                    onNavigate={() => router.push(`/inbox?conversation=${conversationId}`)}
                  />}

                  {/* Delete — hidden during send flow */}
                  {sendState === 'idle' && (
                    confirmDeleteId === a.id ? (
                      <div className="pt-media-tile-confirm">
                        <span style={{ fontSize: 10, color: 'var(--pt-fg-3)' }}>Delete?</span>
                        <button className="pt-link" style={{ fontSize: 10, color: 'var(--pt-danger)' }} onClick={() => void handleDelete(a)}>Yes</button>
                        <button className="pt-link" style={{ fontSize: 10 }} onClick={() => setConfirmDeleteId(null)}>No</button>
                      </div>
                    ) : (
                      <button className="pt-media-tile-del" onClick={() => setConfirmDeleteId(a.id)} title="Delete">✕</button>
                    )
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
