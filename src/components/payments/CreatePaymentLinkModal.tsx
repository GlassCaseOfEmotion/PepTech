// src/components/payments/CreatePaymentLinkModal.tsx
'use client'

import { useState } from 'react'
import { createPaymentLink } from '@/app/payments/actions'
import type { CryptoPaymentLink } from '@/types/payments-crypto'

const TOKENS = [
  { id: 'btc',     label: 'BTC',  color: '#f7931a' },
  { id: 'eth',     label: 'ETH',  color: '#627eea' },
  { id: 'xrp',     label: 'XRP',  color: '#0095d9' },
  { id: 'sol',     label: 'SOL',  color: '#9945ff' },
  { id: 'usdcsol', label: 'USDC', color: '#2775ca' },
  { id: 'usdttrx', label: 'USDT', color: '#26a17b' },
]

export function CreatePaymentLinkModal({
  orderId,
  orderRef,
  amountUsd,
  onClose,
  onCreated,
}: {
  orderId?: string
  orderRef?: string
  amountUsd?: number
  onClose: () => void
  onCreated: (link: CryptoPaymentLink) => void
}) {
  const [inputOrderId, setInputOrderId] = useState(orderId ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!inputOrderId.trim()) { setError('Order ID is required'); return }
    setSubmitting(true)
    setError('')
    const result = await createPaymentLink(inputOrderId.trim())
    setSubmitting(false)
    if (result.error) { setError(result.error); return }
    if (result.link) onCreated(result.link)
  }

  return (
    <div className="pt-pay-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pt-pay-modal">
        <div className="pt-pay-modal-hd">
          <div className="pt-pay-modal-title">New payment link</div>
          <button className="pt-btn pt-btn-ghost" onClick={onClose}>&#x2715;</button>
        </div>

        <div className="pt-pay-modal-body">
          {/* Amount (read-only if pre-filled from order) */}
          {amountUsd != null && (
            <div className="pt-pay-field">
              <div className="pt-pay-field-label">Amount</div>
              <div className="pt-pay-field-val">${amountUsd.toFixed(2)} USD</div>
            </div>
          )}

          {/* Order reference */}
          <div className="pt-pay-field">
            <div className="pt-pay-field-label">Order</div>
            {orderRef
              ? <div className="pt-pay-field-val">{orderRef}</div>
              : (
                <input
                  className="pt-input"
                  placeholder="Order ID"
                  value={inputOrderId}
                  onChange={e => setInputOrderId(e.target.value)}
                />
              )
            }
          </div>

          {/* Accepted tokens */}
          <div className="pt-pay-field">
            <div className="pt-pay-field-label">Customer can pay with</div>
            <div className="pt-pay-token-grid">
              {TOKENS.map(t => (
                <div key={t.id} className="pt-pay-token active">
                  <span className="pt-pay-token-dot" style={{ background: t.color }} />
                  {t.label}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--pt-fg-4)', marginTop: '4px' }}>
              NOWPayments converts all tokens to USDC on receipt.
            </div>
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: 'var(--pt-danger)', padding: '8px 10px', background: 'oklch(from var(--pt-danger) l c h / 0.08)', borderRadius: '6px' }}>
              {error}
            </div>
          )}
        </div>

        <div className="pt-pay-modal-ft">
          <button className="pt-btn pt-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="pt-btn pt-btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Generate link →'}
          </button>
        </div>
      </div>
    </div>
  )
}
