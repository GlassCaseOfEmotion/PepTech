'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatProductInfo } from '@/lib/product-info'
import type { ProductInfoIncludes } from '@/lib/product-info'
import type { CatalogProduct } from '@/types/catalog'
import type { ProductProtocol } from '@/types/protocols'
import { Icons } from '@/lib/icons'

type ConvResult = { id: string; name: string; channel: string }

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
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [include, setInclude] = useState<ProductInfoIncludes>({
    description: !!product.description,
    protocol: !!protocol,
    resources: product.resources.length > 0,
  })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Search conversations by customer display_name
  useEffect(() => {
    if (query.length < 1) { setConversations([]); return }
    const q = query.toLowerCase()
    // Fetches up to 50 recent conversations ordered by recency, then filters client-side.
    // PostgREST does not support ilike on joined columns, so server-side text search on
    // the joined customers.display_name is not available via the REST API.
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
    if (!selectedConvId || !preview) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selectedConvId, content: preview }),
      })
      if (!res.ok) { setError('Failed to send — please try again'); return }
      setSent(true)
      setTimeout(onClose, 1200)
    } finally {
      setSending(false)
    }
  }, [selectedConvId, preview, onClose])

  return (
    <div className="pt-modal-backdrop" onClick={onClose}>
      <div className="pt-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="pt-modal-hd">
          <h3>Send product info — {product.name}</h3>
          <button className="pt-iconbtn" onClick={onClose}><Icons.x size={14} /></button>
        </div>
        <div className="pt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Conversation search */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--pt-fg-3)', marginBottom: 6 }}>Send to</div>
            <input
              className="pt-input"
              autoFocus
              placeholder="Search customer name…"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedConvId(null) }}
            />
            {conversations.length > 0 && (
              <div style={{ marginTop: 4, border: '0.5px solid var(--pt-line)', borderRadius: 'var(--pt-radius)', overflow: 'hidden' }}>
                {conversations.map(c => (
                  <button
                    key={c.id}
                    className={`pt-tpl-item ${selectedConvId === c.id ? 'is-selected' : ''}`}
                    onClick={() => { setSelectedConvId(c.id); setQuery(c.name) }}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginLeft: 8 }}>{c.channel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Content toggles */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--pt-fg-3)', marginBottom: 6 }}>Include</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {product.description && (
                <label style={{ display: 'flex', gap: 7, fontSize: 12, cursor: 'pointer', alignItems: 'center' }}>
                  <input type="checkbox" checked={include.description} onChange={e => setInclude(v => ({ ...v, description: e.target.checked }))} />
                  Description
                </label>
              )}
              {protocol && (
                <label style={{ display: 'flex', gap: 7, fontSize: 12, cursor: 'pointer', alignItems: 'center' }}>
                  <input type="checkbox" checked={include.protocol} onChange={e => setInclude(v => ({ ...v, protocol: e.target.checked }))} />
                  Protocol (dosing instructions)
                </label>
              )}
              {product.resources.length > 0 && (
                <label style={{ display: 'flex', gap: 7, fontSize: 12, cursor: 'pointer', alignItems: 'center' }}>
                  <input type="checkbox" checked={include.resources} onChange={e => setInclude(v => ({ ...v, resources: e.target.checked }))} />
                  Resources ({product.resources.length} link{product.resources.length !== 1 ? 's' : ''})
                </label>
              )}
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div style={{ fontSize: 11.5, color: 'var(--pt-fg-3)', background: 'var(--pt-bg)', borderRadius: 'var(--pt-radius)', padding: '8px 10px', whiteSpace: 'pre-wrap', fontFamily: 'var(--pt-mono)', lineHeight: 1.5, maxHeight: 160, overflow: 'auto' }}>
              {preview}
            </div>
          )}

          {error && <p style={{ fontSize: 12, color: 'var(--pt-danger)', margin: 0 }}>{error}</p>}
          {sent && <p style={{ fontSize: 12, color: 'var(--pt-ok)', margin: 0 }}>&#x2713; Sent</p>}
        </div>
        <div className="pt-modal-ft" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="pt-btn pt-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="pt-btn pt-btn-primary"
            onClick={() => void send()}
            disabled={!selectedConvId || !preview || sending || sent}
          >
            {sending ? 'Sending…' : sent ? 'Sent ✓' : 'Send →'}
          </button>
        </div>
      </div>
    </div>
  )
}
