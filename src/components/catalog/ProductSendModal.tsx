'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatProductInfo } from '@/lib/product-info'
import type { ProductInfoIncludes } from '@/lib/product-info'
import type { CatalogProduct } from '@/types/catalog'
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

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
    if (!selected || !preview) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, content: preview }),
      })
      if (!res.ok) { setError('Failed to send — please try again'); return }
      setSent(true)
      setTimeout(onClose, 1400)
    } finally {
      setSending(false)
    }
  }, [selected, preview, onClose])

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
            disabled={!selected || !preview || sending || sent}
          >
            {sending ? 'Sending…' : sent ? 'Sent ✓' : 'Send →'}
          </button>
        </div>
      </div>
    </div>
  )
}
