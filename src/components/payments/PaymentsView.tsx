// src/components/payments/PaymentsView.tsx
'use client'

import { useState } from 'react'
import type { TenantCryptoWallet, CryptoPaymentLink, WalletTransaction } from '@/types/payments-crypto'
import { PaymentLinkDetail } from './PaymentLinkDetail'
import { CreatePaymentLinkModal } from './CreatePaymentLinkModal'

type FilterTab = 'all' | 'waiting' | 'confirming' | 'finished' | 'failed'

const STATUS_LABEL: Record<string, string> = {
  waiting: 'Waiting', confirming: 'Confirming', confirmed: 'Confirmed',
  sending: 'Sending', partially_paid: 'Partial', finished: 'Paid',
  failed: 'Failed', refunded: 'Refunded', expired: 'Expired',
}

function statusClass(status: string) {
  if (status === 'finished') return 'pt-pay-status-finished'
  if (status === 'confirming' || status === 'confirmed' || status === 'sending') return 'pt-pay-status-confirming'
  if (status === 'failed' || status === 'expired' || status === 'refunded') return 'pt-pay-status-failed'
  return 'pt-pay-status-waiting'
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

export function PaymentsView({
  wallet,
  recentTransactions,
  paymentLinks,
}: {
  wallet: TenantCryptoWallet | null
  recentTransactions: WalletTransaction[]
  paymentLinks: CryptoPaymentLink[]
}) {
  const [filter, setFilter] = useState<FilterTab>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [links, setLinks] = useState(paymentLinks)

  const filtered = filter === 'all'
    ? links
    : links.filter(l => {
        if (filter === 'waiting') return l.status === 'waiting'
        if (filter === 'confirming') return ['confirming', 'confirmed', 'sending'].includes(l.status)
        if (filter === 'finished') return l.status === 'finished'
        if (filter === 'failed') return ['failed', 'expired'].includes(l.status)
        return true
      })

  const selected = links.find(l => l.id === selectedId) ?? null

  const outstanding = links.filter(l => !['finished', 'failed', 'expired'].includes(l.status))
    .reduce((s, l) => s + l.amount_usd, 0)
  const settled7d = links.filter(l => l.status === 'finished' && l.confirmed_at && Date.now() - new Date(l.confirmed_at).getTime() < 7 * 86400000)
    .reduce((s, l) => s + (l.usdc_received ?? l.amount_usd), 0)
  const confirming = links.filter(l => ['confirming', 'confirmed', 'sending'].includes(l.status)).length

  function handleLinkCreated(link: CryptoPaymentLink) {
    setLinks(prev => [link, ...prev])
    setSelectedId(link.id)
    setShowCreate(false)
  }

  return (
    <div className="pt-pay">
      {/* Header */}
      <div className="pt-pay-hd">
        <div>
          <h1>Payments</h1>
          <p>
            {wallet
              ? <><strong className="mono">${wallet.balance_usdc.toFixed(2)}</strong> USDC balance &middot; {links.length} link{links.length !== 1 ? 's' : ''}</>
              : 'No wallet yet — create a payment link to activate'}
          </p>
        </div>
        <button className="pt-btn pt-btn-primary" onClick={() => setShowCreate(true)}>
          + New payment link
        </button>
      </div>

      {/* KPI strip */}
      <div className="pt-pay-kpi">
        <div className="pt-pay-kpi-item">
          <div className="pt-pay-kpi-label">Outstanding</div>
          <div className="pt-pay-kpi-val">${outstanding.toFixed(2)}</div>
          <div className="pt-pay-kpi-sub">awaiting payment</div>
        </div>
        <div className="pt-pay-kpi-item">
          <div className="pt-pay-kpi-label">Confirming</div>
          <div className="pt-pay-kpi-val">{confirming}</div>
          <div className="pt-pay-kpi-sub">links on-chain</div>
        </div>
        <div className="pt-pay-kpi-item">
          <div className="pt-pay-kpi-label">Settled 7d</div>
          <div className="pt-pay-kpi-val">${settled7d.toFixed(2)}</div>
          <div className="pt-pay-kpi-sub">USDC received</div>
        </div>
        <div className="pt-pay-kpi-item">
          <div className="pt-pay-kpi-label">Wallet balance</div>
          <div className="pt-pay-kpi-val">${wallet?.balance_usdc.toFixed(2) ?? '—'}</div>
          <div className="pt-pay-kpi-sub">USDC on Solana</div>
        </div>
      </div>

      {/* Body */}
      <div className="pt-pay-body">
        {/* Links list */}
        <div className="pt-pay-list-col">
          <div className="pt-pay-list-bar">
            <div className="pt-pay-list-bar-pills">
              {(['all', 'waiting', 'confirming', 'finished', 'failed'] as FilterTab[]).map(f => (
                <button
                  key={f}
                  className={`pt-pay-filter-pill${filter === f ? ' sel' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : STATUS_LABEL[f] ?? f}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-pay-list-scroll">
            <ul className="pt-pay-list">
              {filtered.map(link => (
                <li key={link.id}>
                  <div
                    className={`pt-pay-row${selectedId === link.id ? ' is-sel' : ''}`}
                    onClick={() => setSelectedId(link.id)}
                  >
                    <div>
                      <div className="pt-pay-row-ref">Order {link.order_id.slice(0, 8)}&hellip;</div>
                      <div className="pt-pay-row-meta">{timeAgo(link.created_at)}</div>
                    </div>
                    <span className={`pt-pay-status ${statusClass(link.status)}`}>
                      {STATUS_LABEL[link.status] ?? link.status}
                    </span>
                    <div className="pt-pay-row-amount">${link.amount_usd.toFixed(2)}</div>
                  </div>
                </li>
              ))}
              {filtered.length === 0 && (
                <li style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--pt-fg-4)', fontSize: '12.5px' }}>
                  No payment links yet
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Detail panel */}
        <div className="pt-pay-detail-col">
          {selected
            ? <PaymentLinkDetail link={selected} />
            : <div className="pt-pay-detail-empty">Select a payment link to view details</div>
          }
        </div>
      </div>

      {showCreate && (
        <CreatePaymentLinkModal
          onClose={() => setShowCreate(false)}
          onCreated={handleLinkCreated}
        />
      )}
    </div>
  )
}
