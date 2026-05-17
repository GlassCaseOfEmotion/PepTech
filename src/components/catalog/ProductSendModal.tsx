'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatProductInfo } from '@/lib/product-info'
import type { ProductInfoIncludes } from '@/lib/product-info'
import type { CatalogProduct, ProductMediaItem } from '@/types/catalog'
import type { ProductProtocol } from '@/types/protocols'
import { Icons } from '@/lib/icons'

type ConvResult = { id: string; name: string; channel: string }

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  email:    'Email',
}

export function ProductSendModal({
  product,
  protocol,
  onClose,
}: {
  product: CatalogProduct
  protocol: ProductProtocol | null
  onClose: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [query, setQuery] = useState('')
  const [conversations, setConversations] = useState<ConvResult[]>([])
  const [selected, setSelected] = useState<ConvResult | null>(null)
  const [include, setInclude] = useState<ProductInfoIncludes>({
    description: !!product.description,
    protocol: !!protocol,
    resources: product.resources.length > 0,
  })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [selectedMedia, setSelectedMedia] = useState<ProductMediaItem | null>(null)
  const [mediaThumbnails, setMediaThumbnails] = useState<Record<string, string>>({})

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (product.media.length === 0) return
    setMediaThumbnails(current => {
      const images = product.media.filter(m => m.type === 'image' && !current[m.id])
      if (images.length === 0) return current
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
        if (Object.keys(updates).length > 0) {
          setMediaThumbnails(prev => ({ ...prev, ...updates }))
        }
      })
      return current
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (query.length < 1) { setConversations([]); return }
    const q = query.toLowerCase()
    supabase
      .from('conversations')
      .select('id, channel_type, last_message_at, customers(display_name)')
      .not('status', 'eq', 'resolved')
      .order('last_message_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!data) return
        const results = (data as Record<string, unknown>[])
          .filter(c => {
            const name = (c.customers as { display_name: string } | null)?.display_name ?? ''
            return name.toLowerCase().includes(q) || (c.channel_type as string).includes(q)
          })
          .map(c => ({
            id: c.id as string,
            name: (c.customers as { display_name: string } | null)?.display_name ?? 'Unknown',
            channel: c.channel_type as string,
          }))
        setConversations(results)
      })
  }, [query, supabase])

  const preview = formatProductInfo(product, protocol, include)

  const send = useCallback(async () => {
    if (!selected || (!preview && !selectedMedia)) return
    setSending(true)
    setError('')
    try {
      if (preview) {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: selected.id, content: preview }),
        })
        if (!res.ok) { setError('Failed to send message — please try again'); return }
      }
      if (selectedMedia) {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: selected.id,
            storagePath: selectedMedia.storage_path,
            bucket: 'product-media',
          }),
        })
        if (!res.ok) { setError('Message sent but media failed — please try again'); return }
      }
      setSent(true)
      setTimeout(onClose, 1400)
    } finally {
      setSending(false)
    }
  }, [selected, preview, selectedMedia, onClose])

  const sendLabel = sending ? 'Sending…'
    : sent ? 'Sent ✓'
    : (!!preview && !!selectedMedia) ? 'Send message + media →'
    : 'Send →'

  function selectConv(c: ConvResult) {
    setSelected(c)
    setQuery('')
    setConversations([])
  }

  function clearSelected() {
    setSelected(null)
    setQuery('')
  }

  return (
    <div className="pt-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pt-psm" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="pt-pip-hd">
          <div className="pt-pip-hd-title">
            <span className="pt-pip-hd-icon">⬡</span>
            Send product info
          </div>
          <button className="pt-pip-close" onClick={onClose} aria-label="Close">
            <Icons.x size={12} />
          </button>
        </div>

        <div className="pt-psm-body">
          {/* Product pill */}
          <div className="pt-psm-product-pill">
            <span className="pt-psm-product-pill-name">{product.name}</span>
            <span className="pt-psm-product-pill-sku">{product.sku}</span>
          </div>

          {/* Recipient */}
          <div className="pt-psm-section">
            <div className="pt-psm-label">Send to</div>
            {selected ? (
              <div className="pt-psm-recipient">
                <div className="pt-psm-recipient-info">
                  <span className="pt-psm-recipient-name">{selected.name}</span>
                  <span className={`pt-psm-channel pt-psm-channel-${selected.channel}`}>
                    {CHANNEL_LABELS[selected.channel] ?? selected.channel}
                  </span>
                </div>
                <button className="pt-psm-recipient-clear" onClick={clearSelected} title="Change">
                  <Icons.x size={10} />
                </button>
              </div>
            ) : (
              <div className="pt-psm-search-wrap">
                <input
                  className="pt-psm-search"
                  autoFocus
                  placeholder="Search customer name…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                {conversations.length > 0 && (
                  <div className="pt-psm-results">
                    {conversations.map(c => (
                      <button
                        key={c.id}
                        className="pt-psm-result"
                        onClick={() => selectConv(c)}
                      >
                        <span className="pt-psm-result-name">{c.name}</span>
                        <span className={`pt-psm-channel pt-psm-channel-${c.channel}`}>
                          {CHANNEL_LABELS[c.channel] ?? c.channel}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content toggles */}
          <div className="pt-psm-section">
            <div className="pt-psm-label">Include in message</div>
            <div className="pt-pip-toggles" style={{ padding: 0 }}>
              {product.description && (
                <button
                  className={`pt-pip-toggle${include.description ? ' is-on' : ''}`}
                  onClick={() => setInclude(v => ({ ...v, description: !v.description }))}
                >
                  <span className="pt-pip-toggle-icon">≡</span>
                  <div className="pt-pip-toggle-info">
                    <div className="pt-pip-toggle-name">Description</div>
                    <div className="pt-pip-toggle-hint">Product overview text</div>
                  </div>
                  <span className="pt-pip-toggle-check">{include.description ? '✓' : '+'}</span>
                </button>
              )}
              {protocol && (
                <button
                  className={`pt-pip-toggle${include.protocol ? ' is-on' : ''}`}
                  onClick={() => setInclude(v => ({ ...v, protocol: !v.protocol }))}
                >
                  <span className="pt-pip-toggle-icon">⊕</span>
                  <div className="pt-pip-toggle-info">
                    <div className="pt-pip-toggle-name">Protocol</div>
                    <div className="pt-pip-toggle-hint">Dosing, frequency &amp; storage</div>
                  </div>
                  <span className="pt-pip-toggle-check">{include.protocol ? '✓' : '+'}</span>
                </button>
              )}
              {product.resources.length > 0 && (
                <button
                  className={`pt-pip-toggle${include.resources ? ' is-on' : ''}`}
                  onClick={() => setInclude(v => ({ ...v, resources: !v.resources }))}
                >
                  <span className="pt-pip-toggle-icon">⊘</span>
                  <div className="pt-pip-toggle-info">
                    <div className="pt-pip-toggle-name">Resources</div>
                    <div className="pt-pip-toggle-hint">
                      {product.resources.length} link{product.resources.length !== 1 ? 's' : ''}
                      {product.resources[0] && ` · ${product.resources[0].label}`}
                    </div>
                  </div>
                  <span className="pt-pip-toggle-check">{include.resources ? '✓' : '+'}</span>
                </button>
              )}
            </div>
          </div>

          {product.media.length > 0 && (
            <div className="pt-psm-section">
              <div className="pt-psm-label">
                Media · {product.media.length} item{product.media.length !== 1 ? 's' : ''}
              </div>
              <div className="pt-pip-media-grid" style={{ padding: 0 }}>
                {product.media.map(m => (
                  <button
                    key={m.id}
                    className={`pt-pip-media-tile${selectedMedia?.id === m.id ? ' is-selected' : ''}`}
                    onClick={() => setSelectedMedia(prev => prev?.id === m.id ? null : m)}
                    title={m.label}
                  >
                    {m.type === 'image' && mediaThumbnails[m.id] ? (
                      <img src={mediaThumbnails[m.id]} alt={m.label} className="pt-pip-media-img" />
                    ) : (
                      <div className="pt-pip-media-video"><span style={{ fontSize: 14 }}>▶</span></div>
                    )}
                    <div className="pt-pip-media-label">{m.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="pt-psm-section">
              <div className="pt-psm-label">Preview</div>
              <div className="pt-pip-preview-wrap" style={{ padding: 0, maxHeight: 160 }}>
                <div className="pt-pip-bubble">{preview}</div>
              </div>
            </div>
          )}

          {error && <div className="pt-psm-error">{error}</div>}
        </div>

        {/* Footer */}
        <div className="pt-pip-actions">
          <button className="pt-btn pt-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="pt-btn pt-btn-primary"
            onClick={() => void send()}
            disabled={!selected || (!preview && !selectedMedia) || sending || sent}
          >
            {sendLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
