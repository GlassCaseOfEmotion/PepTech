// src/components/payments/PaymentLinkDetail.tsx
'use client'

import { useState } from 'react'
import type { CryptoPaymentLink } from '@/types/payments-crypto'

const STEPS = ['Created', 'Sent', 'Opened', 'Paid', 'Settled'] as const

function stepIndex(status: string): number {
  if (status === 'waiting') return 0
  if (['confirming', 'confirmed', 'sending'].includes(status)) return 2
  if (status === 'finished') return 4
  return 0
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function PaymentLinkDetail({ link }: { link: CryptoPaymentLink }) {
  const [copied, setCopied] = useState(false)

  function copyUrl() {
    navigator.clipboard.writeText(link.hosted_url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const activeStep = stepIndex(link.status)

  const timelineEvents: { label: string; time: string; variant: 'ok' | 'warn' | 'default' }[] = [
    { label: 'Payment link created', time: link.created_at, variant: 'default' },
    ...(link.confirmed_at ? [{ label: `Payment received — ${link.paid_token ?? 'USDC'} → USDC`, time: link.confirmed_at, variant: 'ok' as const }] : []),
    ...(link.status === 'expired' ? [{ label: 'Payment link expired', time: link.expires_at ?? link.created_at, variant: 'warn' as const }] : []),
    ...(link.status === 'failed' ? [{ label: 'Payment failed', time: link.created_at, variant: 'warn' as const }] : []),
  ]

  return (
    <div className="pt-pay-detail">
      {/* Header */}
      <div className="pt-pay-detail-hd">
        <div className="pt-pay-detail-ref">Payment link</div>
        <div className="pt-pay-detail-amount">${link.amount_usd.toFixed(2)}</div>
        {link.usdc_received != null && (
          <div style={{ fontSize: '12px', color: 'var(--pt-fg-3)' }}>
            {link.usdc_received.toFixed(4)} USDC received
            {link.paid_token && link.paid_token !== 'usdcsol' && <> &middot; paid in {link.paid_token.toUpperCase()}</>}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="pt-pay-prog">
        {STEPS.map((step, i) => (
          <div key={step} style={{ display: 'contents' }}>
            <div className="pt-pay-prog-step">
              <div className={`pt-pay-prog-dot${i < activeStep ? ' done' : i === activeStep ? ' active' : ''}`} />
              <div className="pt-pay-prog-label">{step}</div>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`pt-pay-prog-connector${i < activeStep ? ' done' : ''}`} />
            )}
          </div>
        ))}
      </div>

      {/* Share URL */}
      {!['finished', 'failed', 'expired'].includes(link.status) && (
        <div className="pt-pay-share">
          <div className="pt-pay-share-label">Payment link</div>
          <div className="pt-pay-share-url">
            <span className="pt-pay-share-url-text">{link.hosted_url}</span>
            <button className="pt-pay-copy-btn" onClick={copyUrl}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="pt-pay-share-label" style={{ marginBottom: '8px' }}>Timeline</div>
      <div className="pt-pay-timeline">
        {timelineEvents.map((ev, i) => (
          <div key={i} className="pt-pay-timeline-item">
            <div className={`pt-pay-timeline-dot${ev.variant === 'ok' ? ' ok' : ev.variant === 'warn' ? ' warn' : ''}`} />
            <div className="pt-pay-timeline-body">
              <div className="pt-pay-timeline-label">{ev.label}</div>
              <div className="pt-pay-timeline-time">{fmt(ev.time)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Meta */}
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '11px', color: 'var(--pt-fg-4)' }}>
          NOWPayments ID: <span style={{ fontFamily: 'var(--pt-mono)' }}>{link.nowpayments_id}</span>
        </div>
        {link.expires_at && (
          <div style={{ fontSize: '11px', color: 'var(--pt-fg-4)' }}>
            Expires: {fmt(link.expires_at)}
          </div>
        )}
      </div>
    </div>
  )
}
