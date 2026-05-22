// src/components/payments/PaymentsView.tsx
'use client'

import { useState } from 'react'
import { Icons } from '@/lib/icons'
import type { TenantCryptoWallet, CryptoPaymentLinkWithOrder, CryptoPaymentStatus, WalletTransaction } from '@/types/payments-crypto'
import { PaymentLinkDetail } from './PaymentLinkDetail'
import { CreateComposer } from './CreatePaymentLinkModal'

// ── Display helpers ──────────────────────────────────────────────────────────

function statusToState(status: CryptoPaymentStatus): string {
  if (status === 'waiting')                                                          return 'active'
  if (['confirming', 'confirmed', 'sending', 'partially_paid'].includes(status))    return 'pending'
  if (status === 'finished')                                                         return 'paid'
  if (status === 'failed')                                                           return 'cancelled'
  if (status === 'refunded')                                                         return 'refunded'
  if (status === 'expired')                                                          return 'expired'
  return 'draft'
}

function statusToLabel(status: CryptoPaymentStatus, paidToken: string | null): string {
  if (status === 'waiting')        return 'Waiting for payment'
  if (status === 'confirming')     return 'Confirming on-chain'
  if (status === 'confirmed')      return 'Confirmed on-chain'
  if (status === 'sending')        return 'Sending to wallet'
  if (status === 'partially_paid') return 'Partially paid'
  if (status === 'finished')       return paidToken ? `Paid · ${paidToken.toUpperCase()}` : 'Paid · settled'
  if (status === 'failed')         return 'Failed'
  if (status === 'refunded')       return 'Refunded'
  if (status === 'expired')        return 'Expired'
  return status
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60)   return `${mins}m`
  if (mins < 1440) return `${Math.floor(mins / 60)}h`
  return `${Math.floor(mins / 1440)}d`
}

function expiresDisplay(expiresAt: string | null, status: CryptoPaymentStatus): string {
  if (status === 'finished' || status === 'refunded') return 'settled'
  if (status === 'expired' || status === 'failed')    return status
  if (!expiresAt) return '—'
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  const hours = Math.floor(diff / 3600000)
  const mins  = Math.floor((diff % 3600000) / 60000)
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

function expiresState(expiresAt: string | null, status: CryptoPaymentStatus): 'ok' | 'soon' | 'gone' {
  if (['finished', 'refunded', 'failed', 'expired'].includes(status)) return 'gone'
  if (!expiresAt) return 'ok'
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0)              return 'gone'
  if (diff < 3 * 3600000)    return 'soon'
  return 'ok'
}

// ── KPI calculations ─────────────────────────────────────────────────────────

function computeKpis(links: CryptoPaymentLinkWithOrder[]) {
  const now = Date.now()
  const active    = links.filter(l => !['finished', 'failed', 'expired', 'refunded'].includes(l.status))
  const confirming = links.filter(l => ['confirming', 'confirmed', 'sending', 'partially_paid'].includes(l.status))
  const outstanding = active.reduce((s, l) => s + l.amount_usd, 0)

  const sevenDaysAgo = now - 7 * 86400000
  const settled7d    = links.filter(l => l.status === 'finished' && l.confirmed_at && new Date(l.confirmed_at).getTime() > sevenDaysAgo)
  const settled7dAmt = settled7d.reduce((s, l) => s + (l.usdc_received ?? l.amount_usd), 0)

  const thirtyDaysAgo  = now - 30 * 86400000
  const last30d        = links.filter(l => new Date(l.created_at).getTime() > thirtyDaysAgo)
  const last30resolved = last30d.filter(l => ['finished', 'failed', 'expired'].includes(l.status))
  const conversion     = last30resolved.length > 0
    ? Math.round(last30d.filter(l => l.status === 'finished').length / last30resolved.length * 100)
    : null

  const paidWithTime = links.filter(l => l.status === 'finished' && l.confirmed_at)
  let medianMins: number | null = null
  if (paidWithTime.length > 0) {
    const times = paidWithTime
      .map(l => (new Date(l.confirmed_at!).getTime() - new Date(l.created_at).getTime()) / 60000)
      .sort((a, b) => a - b)
    const mid = Math.floor(times.length / 2)
    medianMins = times.length % 2 === 0 ? (times[mid - 1] + times[mid]) / 2 : times[mid]
  }

  return { outstanding, activeCount: active.length, confirmingCount: confirming.length, settled7dAmt, settled7dCount: settled7d.length, conversion, medianMins }
}

// ── Tab definitions ──────────────────────────────────────────────────────────

const TAB_FILTERS: Record<string, (l: CryptoPaymentLinkWithOrder) => boolean> = {
  all:        () => true,
  awaiting:   l => l.status === 'waiting',
  confirming: l => ['confirming', 'confirmed', 'sending', 'partially_paid'].includes(l.status),
  paid:       l => l.status === 'finished',
  expired:    l => ['expired', 'failed'].includes(l.status),
  refunded:   l => l.status === 'refunded',
}

// ── Channel icon ─────────────────────────────────────────────────────────────

function ChannelIcon({ ch }: { ch: string }) {
  if (ch === 'wa') return <Icons.wa size={12} />
  if (ch === 'tg') return <Icons.tg size={12} />
  if (ch === 'em') return <Icons.em size={12} />
  return null
}

// ── Component ────────────────────────────────────────────────────────────────

export function PaymentsView({
  wallet,
  recentTransactions: _transactions,
  paymentLinks,
}: {
  wallet: TenantCryptoWallet | null
  recentTransactions: WalletTransaction[]
  paymentLinks: CryptoPaymentLinkWithOrder[]
}) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState('all')

  const filtered    = paymentLinks.filter(TAB_FILTERS[tab] ?? (() => true))
  const selectedLink = paymentLinks.find(l => l.id === selectedId) ?? null
  const kpi         = computeKpis(paymentLinks)

  const tabDefs = [
    { id: 'all',        label: 'All',        count: paymentLinks.length },
    { id: 'awaiting',   label: 'Awaiting',   count: paymentLinks.filter(TAB_FILTERS.awaiting).length },
    { id: 'confirming', label: 'Confirming', count: paymentLinks.filter(TAB_FILTERS.confirming).length },
    { id: 'paid',       label: 'Paid',       count: paymentLinks.filter(TAB_FILTERS.paid).length },
    { id: 'expired',    label: 'Expired',    count: paymentLinks.filter(TAB_FILTERS.expired).length },
    { id: 'refunded',   label: 'Refunded',   count: paymentLinks.filter(TAB_FILTERS.refunded).length },
  ]

  if (view === 'create') {
    return <CreateComposer onBack={() => setView('list')} />
  }

  if (view === 'detail' && selectedLink) {
    return <PaymentLinkDetail link={selectedLink} onBack={() => setView('list')} />
  }

  // ── Header subtitle ──────────────────────────────────────────────────────
  const activeCount  = kpi.activeCount
  const outstandingFmt = kpi.outstanding > 0 ? `$${kpi.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} outstanding` : 'no outstanding links'
  const settled7dFmt   = kpi.settled7dAmt > 0 ? `$${kpi.settled7dAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} settled (7d)` : ''

  return (
    <div className="pay-page">
      <div className="pay-page-hd">
        <div>
          <h1>Payments</h1>
          <p>
            {activeCount} active link{activeCount !== 1 ? 's' : ''} · {outstandingFmt}
            {settled7dFmt ? ` · ${settled7dFmt}` : ''}
          </p>
        </div>
        <div className="pay-page-hd-actions">
          <button className="pt-btn pt-btn-ghost"><Icons.doc size={12} /> Export</button>
          <button className="pt-btn pt-btn-ghost"><Icons.send size={12} /> Send reminder · {kpi.activeCount}</button>
          <button className="pt-btn pt-btn-primary" onClick={() => setView('create')}>
            <Icons.plus size={12} /> Request payment
          </button>
        </div>
      </div>

      <div className="pay-tabs">
        {tabDefs.map(t => (
          <button
            key={t.id}
            className={`pay-tab${tab === t.id ? ' is-on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label} <span className="pay-tab-num">{t.count}</span>
          </button>
        ))}
        <button className="pay-tab" style={{ marginLeft: 'auto', borderBottom: 'none' }}>
          <Icons.gear size={12} /> Checkout settings
        </button>
      </div>

      <div className="pay-strip">
        <div className="pay-kpi">
          <div className="pay-kpi-lbl">Outstanding</div>
          <div className="pay-kpi-val">${kpi.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="pay-kpi-sub">{kpi.activeCount} link{kpi.activeCount !== 1 ? 's' : ''}</div>
        </div>
        <div className="pay-kpi">
          <div className="pay-kpi-lbl">Confirming</div>
          <div className="pay-kpi-val">{kpi.confirmingCount}<span className="u">links</span></div>
          <div className="pay-kpi-sub">on-chain</div>
        </div>
        <div className="pay-kpi">
          <div className="pay-kpi-lbl">Settled · 7d</div>
          <div className="pay-kpi-val">${kpi.settled7dAmt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="pay-kpi-sub"><span className="ok">{kpi.settled7dCount} link{kpi.settled7dCount !== 1 ? 's' : ''}</span></div>
        </div>
        <div className="pay-kpi">
          <div className="pay-kpi-lbl">Conversion</div>
          <div className="pay-kpi-val">
            {kpi.conversion !== null ? <>{kpi.conversion}<span className="u">%</span></> : '—'}
          </div>
          <div className="pay-kpi-sub">paid / sent · 30d</div>
        </div>
        <div className="pay-kpi">
          <div className="pay-kpi-lbl">Median time-to-pay</div>
          <div className="pay-kpi-val">
            {kpi.medianMins !== null
              ? kpi.medianMins < 60
                ? <>{Math.round(kpi.medianMins)}<span className="u">m</span></>
                : <>{Math.round(kpi.medianMins / 60)}<span className="u">h</span></>
              : '—'}
          </div>
          <div className="pay-kpi-sub">{kpi.medianMins !== null ? `from ${paymentLinks.filter(l => l.status === 'finished').length} paid links` : 'no paid links yet'}</div>
        </div>
      </div>

      <div className="pay-listwrap">
        <section className="pay-list-card">
          <div className="pay-list-toolbar">
            <label className="pay-list-search">
              <Icons.search size={12} />
              <input placeholder="Search by link id, customer, order…" />
              <kbd>/</kbd>
            </label>
            <button className="pay-chip is-on">State: <span className="v">any</span> <Icons.arrowDn size={10} /></button>
            <button className="pay-chip">Asset: <span className="v">any</span> <Icons.arrowDn size={10} /></button>
            {/* DECISION NEEDED — "Channel" filter: channel not tracked per link. Show filter UI only. */}
            <button className="pay-chip">Channel: <span className="v">any</span> <Icons.arrowDn size={10} /></button>
            <button className="pay-chip">Created: <span className="v">last 30d</span> <Icons.arrowDn size={10} /></button>
            <button className="pay-chip"><Icons.plus size={11} /> Add filter</button>
          </div>
          <table className="pay-tt">
            <thead>
              <tr>
                <th style={{ width: 32 }}><input type="checkbox" /></th>
                <th>Link</th>
                <th>Customer</th>
                <th>Order</th>
                <th className="r">Amount</th>
                <th>Accepts</th>
                <th>State</th>
                {/* DECISION NEEDED — "Sent via": channel not tracked. Showing dash until tracked. */}
                <th>Sent via</th>
                <th className="r">Expires</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--pt-fg-4)', fontSize: '12.5px' }}>
                    {paymentLinks.length === 0 ? 'No payment links yet — click "Request payment" to create one' : 'No links match this filter'}
                  </td>
                </tr>
              )}
              {filtered.map(l => {
                const state    = statusToState(l.status)
                const stateLbl = statusToLabel(l.status, l.paid_token)
                const expiry   = expiresDisplay(l.expires_at, l.status)
                const expState = expiresState(l.expires_at, l.status)
                const customer = l.orders?.customers
                const orderRef = l.orders?.ref_number ?? null

                return (
                  <tr
                    key={l.id}
                    className={selectedId === l.id ? 'is-selected' : ''}
                    onClick={() => { setSelectedId(l.id); setView('detail') }}
                  >
                    <td><input type="checkbox" onClick={e => e.stopPropagation()} /></td>
                    <td>
                      <div className="pay-tt-link">
                        <div className="pay-tt-link-mark"><Icons.wallet size={13} /></div>
                        <div>
                          <div className="pay-tt-link-id">{l.nowpayments_id}</div>
                          <div className="pay-tt-link-note">{l.memo ?? orderRef ?? '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {/* DECISION NEEDED — customer.channel for icon: not stored. Showing name + handle only. */}
                      <div className="pay-tt-cust">
                        <span className="pay-tt-cust-name">{customer?.display_name ?? '—'}</span>
                        <span className="pay-tt-cust-meta">{customer?.display_handle ?? '—'}</span>
                      </div>
                    </td>
                    <td>
                      {orderRef
                        ? <span className="mono" style={{ fontSize: 11, color: 'var(--pt-fg-2)' }}>#{orderRef}</span>
                        : <span style={{ color: 'var(--pt-fg-4)' }}>—</span>}
                    </td>
                    <td className="r mono">${l.amount_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>
                      {/* DECISION NEEDED — accepted assets: not stored per link (NOWPayments accepts all). Showing paid token after payment, dash before. */}
                      <span className="pay-assets">
                        {l.paid_token
                          ? <span className="a" data-asset={l.paid_token.toUpperCase()}>{l.paid_token.toUpperCase()}</span>
                          : <span style={{ color: 'var(--pt-fg-4)', fontSize: 11 }}>—</span>}
                      </span>
                    </td>
                    <td><span className={`pay-state is-${state}`}>{stateLbl}</span></td>
                    <td>
                      {/* DECISION NEEDED — sent via: not tracked. Show dash until we add sent_via column. */}
                      <span style={{ color: 'var(--pt-fg-4)' }}>—</span>
                    </td>
                    <td className="r">
                      <span className={`pay-expires${expState === 'soon' ? ' is-soon' : expState === 'gone' ? ' is-gone' : ''}`}>
                        {expState !== 'gone' && <Icons.clock size={10} />}
                        {expiry}
                      </span>
                    </td>
                    <td>
                      <span className="pay-row-acts" onClick={e => e.stopPropagation()}>
                        <button className="pay-row-act" title="Copy URL"
                          onClick={() => navigator.clipboard.writeText(l.hosted_url)}>
                          <Icons.doc size={12} />
                        </button>
                        <button className="pay-row-act" title="Resend"><Icons.send size={12} /></button>
                        <button className="pay-row-act"><Icons.more size={12} /></button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
