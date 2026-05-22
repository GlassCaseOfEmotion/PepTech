// src/components/payments/PaymentsView.tsx
'use client'

import { useState } from 'react'
import { Icons } from '@/lib/icons'
import type { TenantCryptoWallet, CryptoPaymentLink, WalletTransaction } from '@/types/payments-crypto'
import { PaymentLinkDetail } from './PaymentLinkDetail'
import { CreateComposer } from './CreatePaymentLinkModal'

export type MockPayLink = {
  id: string
  amt: number
  ccy: string
  note: string
  customer: { name: string; handle: string; channel: string }
  order: string | null
  assets: string[]
  state: string
  stateLbl: string
  sentVia: string | null
  created: string
  expires: string
  expiresState: 'ok' | 'soon' | 'gone'
}

const PAY_LINKS: MockPayLink[] = [
  { id: 'pl_4Q9F', amt: 330, ccy: 'USD', note: 'Reta 10mg ×2 — gymrat_84',
    customer: { name: 'K. (gymrat_84)', handle: '+1 ••• 4421', channel: 'wa' },
    order: 'A-2244', assets: ['USDT', 'BTC'], state: 'pending', stateLbl: 'Paid · confirming 2/12',
    sentVia: 'wa', created: '2m', expires: '23h 58m', expiresState: 'ok' },
  { id: 'pl_4Q8R', amt: 720, ccy: 'USD', note: 'Bulk reorder · Tirz + Sema',
    customer: { name: 'T.B.', handle: '+1 ••• 9082', channel: 'wa' },
    order: 'A-2243', assets: ['USDT', 'BTC', 'XMR'], state: 'viewed', stateLbl: 'Opened · not paid',
    sentVia: 'wa', created: '18m', expires: '5h 12m', expiresState: 'soon' },
  { id: 'pl_4Q8K', amt: 165, ccy: 'USD', note: 'GHK-Cu 50mg',
    customer: { name: 'swolepriest', handle: '@swolepriest', channel: 'tg' },
    order: 'A-2242', assets: ['USDT', 'XMR'], state: 'active', stateLbl: 'Sent · awaiting open',
    sentVia: 'tg', created: '34m', expires: '23h 26m', expiresState: 'ok' },
  { id: 'pl_4Q7Z', amt: 480, ccy: 'USD', note: 'Sema 10mg ×3',
    customer: { name: 'ladyswole', handle: '@ladyswole', channel: 'tg' },
    order: null, assets: ['USDT', 'BTC'], state: 'paid', stateLbl: 'Paid · settled',
    sentVia: 'tg', created: '2h', expires: 'settled', expiresState: 'gone' },
  { id: 'pl_4Q7B', amt: 1240, ccy: 'USD', note: 'Retainer · Q2 research',
    customer: { name: 'Dr. M. Wills', handle: 'm.wills@…', channel: 'em' },
    order: null, assets: ['USDT', 'BTC'], state: 'paid', stateLbl: 'Paid · settled',
    sentVia: 'em', created: '4h', expires: 'settled', expiresState: 'gone' },
  { id: 'pl_4Q6D', amt: 220, ccy: 'USD', note: 'BPC-157 5mg · deposit',
    customer: { name: 'marcus_r', handle: '+1 ••• 3014', channel: 'wa' },
    order: 'A-2239', assets: ['USDT', 'BTC', 'XMR'], state: 'expired', stateLbl: 'Expired',
    sentVia: 'wa', created: '2d', expires: 'expired', expiresState: 'gone' },
  { id: 'pl_4Q5N', amt: 95, ccy: 'USD', note: 'MOTS-c 10mg',
    customer: { name: 'anon_2k', handle: '@anon2k', channel: 'tg' },
    order: 'A-2238', assets: ['XMR'], state: 'refunded', stateLbl: 'Refunded',
    sentVia: 'tg', created: '3d', expires: 'refunded', expiresState: 'gone' },
  { id: 'pl_4Q5A', amt: 55, ccy: 'USD', note: 'GHK-Cu top-up (custom)',
    customer: { name: 'rxqueen', handle: '@rxqueen', channel: 'tg' },
    order: null, assets: ['USDT'], state: 'draft', stateLbl: 'Draft',
    sentVia: null, created: 'draft', expires: '—', expiresState: 'gone' },
]

const TABS = [
  { id: 'all',        label: 'All',        count: PAY_LINKS.length },
  { id: 'awaiting',   label: 'Awaiting',   count: PAY_LINKS.filter(l => ['active', 'viewed', 'draft'].includes(l.state)).length },
  { id: 'confirming', label: 'Confirming', count: PAY_LINKS.filter(l => l.state === 'pending').length },
  { id: 'paid',       label: 'Paid',       count: PAY_LINKS.filter(l => l.state === 'paid').length },
  { id: 'expired',    label: 'Expired',    count: PAY_LINKS.filter(l => l.state === 'expired').length },
  { id: 'refunded',   label: 'Refunded',   count: PAY_LINKS.filter(l => l.state === 'refunded').length },
]

function ChannelIcon({ ch }: { ch: string }) {
  if (ch === 'wa') return <Icons.wa size={12} />
  if (ch === 'tg') return <Icons.tg size={12} />
  if (ch === 'em') return <Icons.em size={12} />
  return null
}

function channelLabel(ch: string) {
  if (ch === 'wa') return 'WhatsApp'
  if (ch === 'tg') return 'Telegram'
  if (ch === 'em') return 'Email'
  return ch
}

function filterLinks(tab: string): MockPayLink[] {
  if (tab === 'awaiting')   return PAY_LINKS.filter(l => ['active', 'viewed', 'draft'].includes(l.state))
  if (tab === 'confirming') return PAY_LINKS.filter(l => l.state === 'pending')
  if (tab === 'paid')       return PAY_LINKS.filter(l => l.state === 'paid')
  if (tab === 'expired')    return PAY_LINKS.filter(l => l.state === 'expired')
  if (tab === 'refunded')   return PAY_LINKS.filter(l => l.state === 'refunded')
  return PAY_LINKS
}

export function PaymentsView({
  wallet: _wallet,
  recentTransactions: _transactions,
  paymentLinks: _paymentLinks,
}: {
  wallet: TenantCryptoWallet | null
  recentTransactions: WalletTransaction[]
  paymentLinks: CryptoPaymentLink[]
}) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState('all')

  const filtered = filterLinks(tab)
  const selectedLink = PAY_LINKS.find(l => l.id === selectedId) ?? null

  if (view === 'create') {
    return <CreateComposer onBack={() => setView('list')} />
  }

  if (view === 'detail' && selectedLink) {
    return <PaymentLinkDetail link={selectedLink} onBack={() => setView('list')} />
  }

  return (
    <div className="pay-page">
      <div className="pay-page-hd">
        <div>
          <h1>Payments</h1>
          <p>14 active links · $3,420 outstanding · $8,940 settled (7d)</p>
        </div>
        <div className="pay-page-hd-actions">
          <button className="pt-btn pt-btn-ghost"><Icons.doc size={12} /> Export</button>
          <button className="pt-btn pt-btn-ghost"><Icons.send size={12} /> Send reminder · 2</button>
          <button className="pt-btn pt-btn-primary" onClick={() => setView('create')}>
            <Icons.plus size={12} /> Request payment
          </button>
        </div>
      </div>

      <div className="pay-tabs">
        {TABS.map(t => (
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
          <div className="pay-kpi-val">$3,420</div>
          <div className="pay-kpi-sub">5 links · oldest 18m</div>
        </div>
        <div className="pay-kpi">
          <div className="pay-kpi-lbl">Confirming</div>
          <div className="pay-kpi-val">$330<span className="u">USDT</span></div>
          <div className="pay-kpi-sub"><span className="warn">2/12 confirmations</span> · 1 link</div>
        </div>
        <div className="pay-kpi">
          <div className="pay-kpi-lbl">Settled · 7d</div>
          <div className="pay-kpi-val">$8,940</div>
          <div className="pay-kpi-sub"><span className="ok">+22% wow</span> · 17 links</div>
        </div>
        <div className="pay-kpi">
          <div className="pay-kpi-lbl">Conversion</div>
          <div className="pay-kpi-val">78<span className="u">%</span></div>
          <div className="pay-kpi-sub">paid / sent · 30d</div>
        </div>
        <div className="pay-kpi">
          <div className="pay-kpi-lbl">Median time-to-pay</div>
          <div className="pay-kpi-val">14<span className="u">m</span></div>
          <div className="pay-kpi-sub">p95: 2h 18m</div>
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
                <th>Sent via</th>
                <th className="r">Expires</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
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
                        <div className="pay-tt-link-id">{l.id}</div>
                        <div className="pay-tt-link-note">{l.note}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="pay-tt-cust">
                      <span className="pay-tt-cust-name">{l.customer.name}</span>
                      <span className="pay-tt-cust-meta">{l.customer.handle}</span>
                    </div>
                  </td>
                  <td>
                    {l.order
                      ? <span className="mono" style={{ fontSize: 11, color: 'var(--pt-fg-2)' }}>#{l.order}</span>
                      : <span style={{ color: 'var(--pt-fg-4)' }}>—</span>}
                  </td>
                  <td className="r mono">${l.amt.toLocaleString()}</td>
                  <td>
                    <span className="pay-assets">
                      {l.assets.map(a => <span key={a} className="a" data-asset={a}>{a}</span>)}
                    </span>
                  </td>
                  <td><span className={`pay-state is-${l.state}`}>{l.stateLbl}</span></td>
                  <td>
                    {l.sentVia
                      ? (
                        <span className="pay-ch">
                          <ChannelIcon ch={l.sentVia} />
                          <span style={{ color: 'var(--pt-fg-3)' }}>{channelLabel(l.sentVia)}</span>
                        </span>
                      )
                      : <span style={{ color: 'var(--pt-fg-4)' }}>—</span>}
                  </td>
                  <td className="r">
                    <span className={`pay-expires${l.expiresState === 'soon' ? ' is-soon' : l.expiresState === 'gone' ? ' is-gone' : ''}`}>
                      {l.expiresState !== 'gone' && <Icons.clock size={10} />}
                      {l.expires}
                    </span>
                  </td>
                  <td>
                    <span className="pay-row-acts" onClick={e => e.stopPropagation()}>
                      <button className="pay-row-act" title="Copy URL"><Icons.doc size={12} /></button>
                      <button className="pay-row-act" title="Resend"><Icons.send size={12} /></button>
                      <button className="pay-row-act"><Icons.more size={12} /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
