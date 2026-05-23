// src/components/payments/PaymentLinkDetail.tsx
'use client'

import type { CSSProperties, ReactElement } from 'react'
import QRCode from 'react-qr-code'
import { Icons } from '@/lib/icons'
import { formatAmount } from '@/lib/currency'
import type { CryptoPaymentLinkWithOrder, CryptoPaymentStatus } from '@/types/payments-crypto'
import { PaySendWidget } from './PaySendWidget'

function QrPlaceholder({ size = 124 }: { size?: number }) {
  const cells = 21
  const cellSize = size / cells
  const fixedPattern = (i: number, j: number) => {
    if ((i < 7 && j < 7) || (i < 7 && j > 13) || (i > 13 && j < 7)) {
      const xi = i > 13 ? i - 14 : i
      const xj = j > 13 ? j - 14 : j
      const ii = i > 13 ? xi : (i < 7 ? i : 0)
      const jj = j > 13 ? xj : (j < 7 ? j : 0)
      return (ii === 0 || ii === 6 || jj === 0 || jj === 6) ? 1
           : (ii >= 2 && ii <= 4 && jj >= 2 && jj <= 4) ? 1 : 0
    }
    return ((i * 31 + j * 17 + i * j * 3) % 7) < 3 ? 1 : 0
  }
  const rects: ReactElement[] = []
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      if (fixedPattern(i, j)) {
        rects.push(<rect key={`${i}-${j}`} x={j * cellSize} y={i * cellSize} width={cellSize + 0.3} height={cellSize + 0.3} fill="#111" />)
      }
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="#fff" />
      {rects}
      <rect x={size / 2 - 12} y={size / 2 - 12} width={24} height={24} fill="#fff" />
      <rect x={size / 2 - 9} y={size / 2 - 9} width={18} height={18} rx={4} fill="oklch(0.20 0.01 100)" />
    </svg>
  )
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function getProgressSteps(status: CryptoPaymentStatus, link: CryptoPaymentLinkWithOrder) {
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const isPaid       = ['confirming', 'confirmed', 'sending', 'partially_paid', 'finished'].includes(status)
  const isConfirming = ['confirming', 'confirmed', 'sending', 'partially_paid'].includes(status)
  const isFinished   = status === 'finished'

  return [
    { lbl: 'Created', at: fmt(link.created_at), done: true,        now: false        },
    // DECISION NEEDED — "Sent" step: no timestamp tracked for when the link was sent to customer
    { lbl: 'Sent',    at: '—',                  done: false,       now: false        },
    // DECISION NEEDED — "Opened" step: NOWPayments doesn't notify us when customer opens the URL
    { lbl: 'Opened',  at: '—',                  done: false,       now: false        },
    { lbl: 'Paid',    at: link.confirmed_at ? fmt(link.confirmed_at) : '—', done: isPaid, now: isConfirming },
    { lbl: 'Settled', at: isFinished && link.confirmed_at ? fmt(link.confirmed_at) : '—', done: isFinished, now: false },
  ]
}

// ── Timeline ─────────────────────────────────────────────────────────────────

type TlVariant = 'ok' | 'cool' | 'warn' | 'default'

function getTimeline(link: CryptoPaymentLinkWithOrder) {
  const fmtTs = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const events: { when: string; variant: TlVariant; icon: keyof typeof Icons; title: string; sub: string; meta: string }[] = []

  events.push({
    when: fmtTs(link.created_at),
    variant: 'ok',
    icon: 'plus',
    title: 'Link created',
    sub: `$${link.amount_usd.toFixed(2)} USD${link.memo ? ` · ${link.memo}` : ''}`,
    meta: 'create',
  })

  if (link.confirmed_at && ['confirming', 'confirmed', 'sending', 'partially_paid', 'finished'].includes(link.status)) {
    events.push({
      when: fmtTs(link.confirmed_at),
      variant: 'warn',
      icon: 'zap',
      title: 'Payment detected',
      sub: link.paid_amount && link.paid_token
        ? `${link.paid_amount} ${link.paid_token.toUpperCase()}${link.nowpayments_tx_id ? ` · tx: ${link.nowpayments_tx_id}` : ''}`
        : '—',
      meta: 'tx',
    })
  }

  if (link.status === 'finished' && link.confirmed_at) {
    events.push({
      when: fmtTs(link.confirmed_at),
      variant: 'ok',
      icon: 'check',
      title: 'Payment settled',
      sub: link.usdc_received ? `${link.usdc_received.toFixed(4)} USDC received to wallet` : '—',
      meta: 'settle',
    })
  }

  if (link.status === 'expired' && link.expires_at) {
    events.push({
      when: fmtTs(link.expires_at),
      variant: 'default',
      icon: 'clock',
      title: 'Link expired',
      sub: 'No payment received before expiry',
      meta: 'expire',
    })
  }

  if (link.status === 'failed') {
    events.push({
      when: '—',
      variant: 'warn',
      icon: 'x',
      title: 'Payment failed',
      sub: '—',
      meta: 'fail',
    })
  }

  return events
}

// ── State badge ──────────────────────────────────────────────────────────────

function stateBadgeStyle(status: CryptoPaymentStatus): CSSProperties {
  const base: CSSProperties = { fontSize: 12, padding: '6px 12px', borderRadius: 6 }
  if (['confirming', 'confirmed', 'sending', 'partially_paid'].includes(status))
    return { ...base, background: 'var(--pt-warn-soft)', color: 'var(--pt-warn)' }
  if (status === 'finished')
    return { ...base, background: 'var(--pt-ok-soft)', color: 'var(--pt-ok)' }
  if (status === 'waiting')
    return { ...base, background: 'var(--pt-cool-soft)', color: 'var(--pt-cool)' }
  return { ...base, background: 'oklch(from var(--pt-fg) l c h / 0.06)', color: 'var(--pt-fg-3)' }
}

function statusLabel(status: CryptoPaymentStatus, paidToken: string | null): string {
  if (status === 'waiting')        return 'Waiting for payment'
  if (status === 'confirming')     return 'Confirming on-chain'
  if (status === 'confirmed')      return 'Confirmed'
  if (status === 'sending')        return 'Sending to wallet'
  if (status === 'partially_paid') return 'Partially paid'
  if (status === 'finished')       return paidToken ? `Paid · ${paidToken.toUpperCase()}` : 'Paid · settled'
  if (status === 'expired')        return 'Expired'
  if (status === 'failed')         return 'Failed'
  if (status === 'refunded')       return 'Refunded'
  return status
}

// ── Timeline icon ─────────────────────────────────────────────────────────────

function TlIcon({ icon, variant }: { icon: keyof typeof Icons; variant: TlVariant }) {
  const cls = `pay-detail-timeline-ic${variant === 'ok' ? ' is-ok' : variant === 'cool' ? ' is-cool' : variant === 'warn' ? ' is-warn' : ''}`
  const Ic = Icons[icon] as (props: { size?: number }) => ReactElement
  return <span className={cls}><Ic size={11} /></span>
}

// ── Component ────────────────────────────────────────────────────────────────

export function PaymentLinkDetail({ link, onBack }: { link: CryptoPaymentLinkWithOrder; onBack: () => void }) {
  const steps    = getProgressSteps(link.status, link)
  const timeline = getTimeline(link)
  const orderRef = link.orders?.ref_number ?? null
  const customer = link.orders?.customers ?? null

  // Extract primary channel from extended order data
  const channels = link.orders?.customers?.customer_channels ?? []
  const primaryChannel = channels.find(c => c.is_primary) ?? channels[0] ?? null
  const customerId = link.orders?.customers?.id ?? null
  const customerName = link.orders?.customers?.display_name ?? null
  const channelType = primaryChannel?.channel_type ?? null
  const shareMessageText = `Hi ${customerName ?? 'there'}! Here's your payment link for ${link.memo ?? link.orders?.ref_number ?? 'your order'}:\n\n${link.hosted_url}`

  return (
    <div className="pay-detail">
      <div className="pay-detail-main">
        <div className="pay-detail-hd">
          <div>
            <button
              className="pt-btn pt-btn-ghost"
              onClick={onBack}
              style={{ padding: '3px 8px', fontSize: 11, marginBottom: 12 }}
            >
              ← Back
            </button>
            <div className="id">{link.nowpayments_id}</div>
            <div className="amt" style={{ marginTop: 10 }}>
              {/* Show tenant's currency as primary amount */}
              {link.amount_base && link.base_currency !== 'USD'
                ? formatAmount(link.amount_base, link.base_currency)
                : <><span className="cur">$</span>{link.amount_usd.toFixed(2)}</>}
            </div>
            {link.base_currency !== 'USD' && (
              <div style={{ fontSize: 11.5, color: 'var(--pt-fg-4)', marginTop: 3, fontFamily: 'var(--pt-mono)' }}>
                ≈ ${link.amount_usd.toFixed(2)} USD · sent to NOWPayments
              </div>
            )}
            <div style={{ fontSize: 12.5, color: 'var(--pt-fg-3)', marginTop: 6 }}>
              {link.memo ?? orderRef ?? '—'}
              {customer ? ` · for ${customer.display_name}` : ''}
              {orderRef ? ` · order #${orderRef}` : ''}
            </div>
          </div>
          <div className="pay-detail-hd-state">
            <span className={`pay-state is-${link.status === 'finished' ? 'paid' : link.status}`} style={stateBadgeStyle(link.status)}>
              {statusLabel(link.status, link.paid_token)}
            </span>
          </div>
        </div>

        <div className="pay-detail-progress">
          {steps.map((s, i) => (
            <div key={i} className={`pay-detail-step${s.done ? ' is-done' : ''}${s.now ? ' is-now' : ''}`}>
              <div className="bar" />
              <div className="lbl">{s.lbl}</div>
              <div className="at">{s.at}</div>
            </div>
          ))}
        </div>

        <div className="pay-detail-section">
          <h3>Details</h3>
          <dl className="pay-detail-grid">
            <div>
              <dt>Asset paid</dt>
              <dd className="mono">{link.paid_token ? link.paid_token.toUpperCase() : '—'}</dd>
            </div>
            <div>
              {/* DECISION NEEDED — locked rate not stored; NOWPayments calculates internally */}
              <dt>Locked rate</dt>
              <dd className="mono">—</dd>
            </div>
            <div>
              <dt>Amount paid</dt>
              <dd className="mono">
                {link.paid_amount && link.paid_token
                  ? `${link.paid_amount} ${link.paid_token.toUpperCase()}`
                  : '—'}
              </dd>
            </div>
            <div>
              {/* DECISION NEEDED — assigned crypto address not returned in NOWPayments webhook */}
              <dt>Address (assigned)</dt>
              <dd className="mono">—</dd>
            </div>
            <div>
              <dt>Tx hash</dt>
              <dd className="mono">{link.nowpayments_tx_id ?? '—'}</dd>
            </div>
            <div>
              {/* DECISION NEEDED — block confirmations count not stored; need NOWPayments polling to track */}
              <dt>Confirmations</dt>
              <dd className="mono">—</dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>{customer?.display_name ?? '—'}</dd>
            </div>
            <div>
              <dt>Order</dt>
              <dd className="mono">{orderRef ? `#${orderRef}` : '—'}</dd>
            </div>
            <div>
              <dt>Order amount</dt>
              <dd className="mono">
                {link.amount_base && link.base_currency !== 'USD'
                  ? formatAmount(link.amount_base, link.base_currency)
                  : `$${link.amount_usd.toFixed(2)}`}
              </dd>
            </div>
            <div>
              <dt>USD (gateway)</dt>
              <dd className="mono">${link.amount_usd.toFixed(2)}</dd>
            </div>
            <div>
              <dt>USDC received</dt>
              <dd className="mono">{link.usdc_received ? `${link.usdc_received.toFixed(4)} USDC` : '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="pay-detail-section">
          <h3>Timeline</h3>
          <ul className="pay-detail-timeline">
            {timeline.map((ev, i) => (
              <li key={i}>
                <span className="pay-detail-timeline-when">{ev.when}</span>
                <TlIcon icon={ev.icon} variant={ev.variant} />
                <div>
                  <div className="pay-detail-timeline-t">{ev.title}</div>
                  <div className="pay-detail-timeline-s">{ev.sub}</div>
                </div>
                <span className="pay-detail-timeline-meta">{ev.meta}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="pay-detail-side">
        <div>
          <h4>Checkout URL</h4>
          <div className="pay-detail-side-url">
            <div className="url">{link.hosted_url}</div>
            <PaySendWidget
              customerId={customerId}
              customerName={customerName}
              channelType={channelType}
              messageText={shareMessageText}
              url={link.hosted_url}
            />
          </div>
        </div>

        <div>
          <h4>QR</h4>
          <div style={{ background: '#fff', border: '0.5px solid var(--pt-line)', borderRadius: 8, padding: 14, display: 'flex', justifyContent: 'center' }}>
            <QRCode value={link.hosted_url} size={130} />
          </div>
        </div>

        <div>
          <h4>Linked records</h4>
          <div className="pay-detail-side-actions">
            {orderRef && <button><Icons.box size={12} /> Order #{orderRef}</button>}
            {customer && <button><Icons.user size={12} /> {customer.display_name} — open thread</button>}
            {link.status === 'finished' && (
              <button><Icons.vault size={12} /> Vault tx — settled</button>
            )}
          </div>
        </div>

        <div>
          <h4>Actions</h4>
          <div className="pay-detail-side-actions">
            {/* DECISION NEEDED — resend, extend, cancel, refund: API calls not yet implemented */}
            <button><Icons.send size={12} /> Resend reminder</button>
            <button><Icons.clock size={12} /> Extend expiry · +24h</button>
            <button className="is-danger"><Icons.x size={12} /> Cancel link</button>
            <button className="is-danger"><Icons.rotate size={12} /> Refund (after settle)</button>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', lineHeight: 1.5, marginTop: 'auto', paddingTop: 14, borderTop: '0.5px solid var(--pt-line-soft)' }}>
          Link ID: <span style={{ fontFamily: 'var(--pt-mono)' }}>{link.nowpayments_id}</span>
          <br />Payout wallet: <span style={{ fontFamily: 'var(--pt-mono)' }}>{link.payout_address.slice(0, 8)}…</span>
        </div>
      </div>
    </div>
  )
}
