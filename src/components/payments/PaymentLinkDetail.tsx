// src/components/payments/PaymentLinkDetail.tsx
'use client'

import type { CSSProperties, ReactElement } from 'react'
import { Icons } from '@/lib/icons'
import type { MockPayLink } from './PaymentsView'

export type { MockPayLink }

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

const DETAIL_STEPS = [
  { lbl: 'Created',  at: '15:22', done: true,  now: false },
  { lbl: 'Sent (wa)', at: '15:22', done: true,  now: false },
  { lbl: 'Opened',   at: '15:24', done: true,  now: false },
  { lbl: 'Paid',     at: '15:31', done: true,  now: true  },
  { lbl: 'Settled',  at: '~5m',   done: false, now: false },
]

type TlVariant = 'ok' | 'cool' | 'warn' | 'default'

const DETAIL_TIMELINE: { when: string; variant: TlVariant; icon: keyof typeof Icons; title: string; sub: string; meta: string }[] = [
  { when: '15:22:08', variant: 'ok',      icon: 'plus',   title: 'Link created',                    sub: 'by dr_peptide · accepts USDT, BTC',                                          meta: 'create'  },
  { when: '15:22:11', variant: 'cool',    icon: 'send',   title: 'Sent via WhatsApp',                sub: 'Inline rich card to +1 ••• 4421 · message id wamid.HBg…',                    meta: 'share'   },
  { when: '15:24:02', variant: 'cool',    icon: 'user',   title: 'Customer opened link',             sub: 'IP 76.•.•.18 · iOS Safari · selected USDT-TRC20',                            meta: 'view'    },
  { when: '15:24:48', variant: 'default', icon: 'wallet', title: 'Receiving address assigned',       sub: 'TQrZ8jH2vN3rL5kPMXfQ7yT8mK4n9pXabc from hot pool · auto-rotates after this payment', meta: 'addr' },
  { when: '15:31:14', variant: 'warn',    icon: 'zap',    title: 'Inbound transaction detected',     sub: '329.90 USDT · hash 0x71c4…ae93 · waiting on confirmations',                  meta: 'tx'      },
  { when: '15:31:48', variant: 'warn',    icon: 'clock',  title: 'Confirmation 2 / 12',              sub: 'ETA to settled: ~5 min · funds released to vault://hot/usdt-trc on full confirm', meta: 'confirm' },
]

function TlIcon({ icon, variant }: { icon: keyof typeof Icons; variant: TlVariant }) {
  const cls = `pay-detail-timeline-ic${variant === 'ok' ? ' is-ok' : variant === 'cool' ? ' is-cool' : variant === 'warn' ? ' is-warn' : ''}`
  const Ic = Icons[icon] as (props: { size?: number }) => ReactElement
  return <span className={cls}><Ic size={11} /></span>
}

function detailStateBadgeStyle(state: string): CSSProperties {
  const base: CSSProperties = { fontSize: 12, padding: '6px 12px', borderRadius: 6 }
  if (state === 'pending')                     return { ...base, background: 'var(--pt-warn-soft)', color: 'var(--pt-warn)' }
  if (state === 'paid')                        return { ...base, background: 'var(--pt-ok-soft)',   color: 'var(--pt-ok)'   }
  if (state === 'active' || state === 'viewed') return { ...base, background: 'var(--pt-cool-soft)', color: 'var(--pt-cool)' }
  return { ...base, background: 'oklch(from var(--pt-fg) l c h / 0.06)', color: 'var(--pt-fg-3)' }
}

export function PaymentLinkDetail({ link, onBack }: { link: MockPayLink; onBack: () => void }) {
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
            <div className="id">{link.id}</div>
            <div className="amt" style={{ marginTop: 10 }}>
              <span className="cur">$</span>{link.amt.toLocaleString()}{' '}
              <span style={{ fontFamily: 'var(--pt-mono)', fontSize: 14, color: 'var(--pt-fg-3)', fontWeight: 500, marginLeft: 4 }}>{link.ccy}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--pt-fg-3)', marginTop: 6 }}>
              {link.note} · for {link.customer.name}{link.order ? ` · order #${link.order}` : ''}
            </div>
          </div>
          <div className="pay-detail-hd-state">
            <span className={`pay-state is-${link.state}`} style={detailStateBadgeStyle(link.state)}>
              {link.stateLbl}
            </span>
          </div>
        </div>

        <div className="pay-detail-progress">
          {DETAIL_STEPS.map((s, i) => (
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
            <div><dt>Asset</dt><dd className="mono">USDT · TRC-20</dd></div>
            <div><dt>Locked rate</dt><dd className="mono">1 USDT = $1.0003</dd></div>
            <div><dt>Crypto due</dt><dd className="mono">329.90 USDT</dd></div>
            <div><dt>Address (assigned)</dt><dd className="mono">TQrZ8jH2…mK4n9pX</dd></div>
            <div><dt>Tx hash</dt><dd className="mono">0x71c4…ae93</dd></div>
            <div><dt>Confirmations</dt><dd className="mono">2 / 12</dd></div>
            <div><dt>Customer</dt><dd>{link.customer.name}</dd></div>
            <div><dt>Order</dt><dd className="mono">{link.order ? `#${link.order}` : '—'}</dd></div>
            <div><dt>Created by</dt><dd>dr_peptide</dd></div>
          </dl>
        </div>

        <div className="pay-detail-section">
          <h3>Timeline</h3>
          <ul className="pay-detail-timeline">
            {DETAIL_TIMELINE.map((ev, i) => (
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
            <div className="url">https://pay.peptech.app/dr_peptide/{link.id}</div>
            <div className="pay-detail-share">
              <button><Icons.doc size={11} /> Copy</button>
              <button><Icons.wa size={11} style={{ color: 'var(--pt-wa)' }} /> WhatsApp</button>
              <button><Icons.tg size={11} style={{ color: 'var(--pt-tg)' }} /> Telegram</button>
              <button><Icons.em size={11} /> Email</button>
            </div>
          </div>
        </div>

        <div>
          <h4>QR</h4>
          <div style={{ background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)', borderRadius: 8, padding: 14, display: 'flex', justifyContent: 'center' }}>
            <QrPlaceholder size={130} />
          </div>
        </div>

        <div>
          <h4>Linked records</h4>
          <div className="pay-detail-side-actions">
            {link.order && <button><Icons.box size={12} /> Order #{link.order}</button>}
            <button><Icons.user size={12} /> {link.customer.name} — open thread</button>
            <button><Icons.vault size={12} /> Vault tx — when settled</button>
          </div>
        </div>

        <div>
          <h4>Actions</h4>
          <div className="pay-detail-side-actions">
            <button><Icons.send size={12} /> Resend reminder</button>
            <button><Icons.clock size={12} /> Extend expiry · +24h</button>
            <button className="is-danger"><Icons.x size={12} /> Cancel link</button>
            <button className="is-danger"><Icons.rotate size={12} /> Refund (after settle)</button>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', lineHeight: 1.5, marginTop: 'auto', paddingTop: 14, borderTop: '0.5px solid var(--pt-line-soft)' }}>
          Address auto-rotates after this payment settles. Refunds available for 30d post-settle.
        </div>
      </div>
    </div>
  )
}
