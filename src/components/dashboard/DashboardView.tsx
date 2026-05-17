'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { formatAmount, formatAmountCompact } from '@/lib/currency'
import { createClient } from '@/lib/supabase/client'
import type { ReorderSignal } from '@/lib/reorder-signals'
import type { ShipmentRow } from '@/types/orders'
import type { InboxThread, DbConversation } from '@/types/inbox'
import { dbConversationToThread } from '@/types/inbox'
import type { CatalogProduct } from '@/types/catalog'
import type { DashboardStats, PendingOrder, PackingOrder, ActivityItem } from '@/types/dashboard'
import { initials } from '@/types/inbox'
import { PAYMENT_BADGE } from '@/types/payments'
import { OnboardingChecklist } from './OnboardingChecklist'
import { EmptyState } from '@/components/ui/EmptyState'

const ACTIVE_STATUSES = new Set(['new', 'needs_reply', 'in_progress', 'snoozed'])

const CONV_SELECT = `
  id, status, unread_count, last_message_at, last_message_snippet,
  channel_type, channel_identifier,
  customers (
    id, display_name, trust_score, ltv,
    customer_tags (tag),
    customer_channels (channel_type, display_handle, is_primary)
  )
`

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMins(m: number) {
  if (m < 60) return `${m}m`
  if (m < 60 * 24) return `${Math.floor(m / 60)}h`
  return `${Math.floor(m / 60 / 24)}d`
}

// ─── Sparkline ──────────────────────────────────────────────────────────────

function Spark({ data }: { data: number[] }) {
  const max = Math.max(...data), min = Math.min(...data)
  const w = 56, h = 18
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / Math.max(1, max - min)) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pt-spark">
      <polyline points={pts} fill="none" stroke="var(--pt-accent)" strokeWidth="1.25"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Trust pill ─────────────────────────────────────────────────────────────

function TrustPill({ score }: { score: number }) {
  const cls = score >= 85 ? 'hi' : score >= 65 ? 'md' : 'lo'
  return <div className={`pt-trust-pill pt-trust-${cls}`}>{score}</div>
}

function TrustBlock({ score }: { score: number }) {
  const cls = score >= 85 ? 'hi' : score >= 65 ? 'md' : 'lo'
  return (
    <div className={`pt-trust pt-trust-${cls}`}>
      <div className="pt-trust-num">{score}</div>
      <div className="pt-trust-lbl">trust</div>
    </div>
  )
}

// ─── Card shell ─────────────────────────────────────────────────────────────

function DashCard({ title, subtitle, action, span, footer, scroll, children }: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  span?: string
  footer?: React.ReactNode
  scroll?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={`pt-card ${span ? `pt-span-${span}` : ''}`}>
      <header className="pt-card-hd">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={`pt-card-body ${scroll ? 'is-scroll' : ''}`} style={{ padding: 0 }}>{children}</div>
      {footer && <footer className="pt-card-ft">{footer}</footer>}
    </section>
  )
}

// ─── KPI strip ──────────────────────────────────────────────────────────────

function KpiRow({ active, needsReply, reordersDue7d, highConf, stats, baseCurrency }: { active: number; needsReply: number; reordersDue7d: number; highConf: number; stats: DashboardStats; baseCurrency: string }) {
  const { revenue7d, revenuePrev7d, revenue90dDaily, pendingOrders, pendingTotal } = stats
  const spark7d = revenue90dDaily.slice(-7).map(d => d.v)
  const delta = revenuePrev7d > 0
    ? Math.round(((revenue7d - revenuePrev7d) / revenuePrev7d) * 100 * 10) / 10
    : null
  const confirming = pendingOrders.filter(o => o.status === 'confirming').length
  const awaiting   = pendingOrders.filter(o => o.status === 'awaiting').length

  const kpis = [
    {
      label: 'Revenue · 7d',
      value: formatAmountCompact(revenue7d, baseCurrency),
      delta,
      spark: spark7d,
    },
    {
      label: 'Pending crypto',
      value: formatAmountCompact(pendingTotal, baseCurrency),
      delta: null,
      sub: pendingOrders.length === 0
        ? 'None outstanding'
        : `${confirming} confirming · ${awaiting} pending`,
    },
    {
      label: 'Active conversations',
      value: String(active),
      delta: null,
      sub: `${needsReply} need reply`,
    },
    { label: 'Reorders due · 7d', value: String(reordersDue7d), delta: null, sub: `${highConf} high-confidence` },
  ]
  return (
    <div className="pt-kpis">
      {kpis.map((k, i) => (
        <div className="pt-kpi" key={i}>
          <div className="pt-kpi-lbl">{k.label}</div>
          <div className="pt-kpi-val-row">
            <div className="pt-kpi-val">{k.value}</div>
            {k.delta != null && (
              <span className={`pt-kpi-delta ${k.delta >= 0 ? 'up' : 'dn'}`}>
                {k.delta >= 0 ? '▲' : '▼'} {Math.abs(k.delta)}%
              </span>
            )}
            {k.spark && <div className="pt-revenue-spark"><Spark data={k.spark} /></div>}
          </div>
          {k.sub && <div className="pt-kpi-sub">{k.sub}</div>}
        </div>
      ))}
    </div>
  )
}

// ─── Inbox card ─────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, React.FC<{ size?: number }>> = {
  wa: Icons.wa, tg: Icons.tg, em: Icons.em,
}

function InboxCard({ threads, connectedChannels }: { threads: InboxThread[]; connectedChannels: string[] }) {
  const [filter, setFilter] = useState('needs_reply')
  const filters = [
    { id: 'needs_reply', label: 'Needs reply', count: threads.filter(t => t.status === 'needs_reply').length },
    { id: 'all',         label: 'All',         count: threads.length },
    { id: 'new',         label: 'New',         count: threads.filter(t => t.status === 'new').length },
    { id: 'snoozed',     label: 'Snoozed',     count: threads.filter(t => t.status === 'snoozed').length },
  ]
  const shown = filter === 'all' ? threads : threads.filter(t => t.status === filter)

  return (
    <DashCard
      title="Inbox"
      subtitle="Live across WhatsApp, Telegram, Email"
      span="2"
      scroll
      action={
        <div className="pt-pillbar">
          {filters.map(f => (
            <button key={f.id} className={`pt-pill ${filter === f.id ? 'is-on' : ''}`}
              onClick={() => setFilter(f.id)}>
              {f.label}<span className="pt-pill-num">{f.count}</span>
            </button>
          ))}
        </div>
      }
      footer={<Link href="/inbox" className="pt-link" style={{ fontSize: 12 }}>Open inbox →</Link>}
    >
      <ul className="pt-thread-list">
        {shown.map(t => {
          const ChIcon = CHANNEL_ICONS[t.channel]
          return (
            <Link key={t.id} href={`/inbox?conversation=${t.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'contents' }}>
              <li className={`pt-thread ${t.unread ? 'is-unread' : ''}`}>
                <div className="pt-thread-av" data-channel={t.channel}>
                  <span>{initials(t.name)}</span>
                  <i className={`pt-thread-ch pt-ch-${t.channel}`}>{ChIcon && <ChIcon size={9} />}</i>
                </div>
                <div className="pt-thread-mid">
                  <div className="pt-thread-row1">
                    <span className="pt-thread-name">{t.name}</span>
                    {t.tags.includes('vip') && <span className="pt-tag pt-tag-vip">VIP</span>}
                    {t.tags.includes('new') && <span className="pt-tag pt-tag-new">new</span>}
                    {t.tags.includes('waitlist') && <span className="pt-tag">waitlist</span>}
                    {t.tags.includes('payment') && <span className="pt-tag pt-tag-warn">payment</span>}
                    {t.tags.includes('repeat') && !t.tags.includes('vip') && <span className="pt-tag pt-tag-soft">repeat</span>}
                  </div>
                  <div className="pt-thread-snip">{t.snippet}</div>
                </div>
                <div className="pt-thread-meta">
                  <div className="pt-thread-time">{fmtMins(t.minsAgo)}</div>
                  {t.unread > 0
                    ? <div className="pt-thread-unread">{t.unread}</div>
                    : <TrustPill score={t.trust} />}
                </div>
              </li>
            </Link>
          )
        })}
        {shown.length === 0 && (
          <li>
            <div className="pt-empty-box">
              {connectedChannels.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="6" width="22" height="16" rx="2.5"/>
                      <path d="M3 11l11 7 11-7" strokeWidth="1"/>
                      <circle cx="21" cy="7" r="4" fill="var(--pt-warn-soft)" stroke="var(--pt-warn)" strokeWidth="1"/>
                      <line x1="21" y1="5.5" x2="21" y2="8" stroke="var(--pt-warn)" strokeWidth="1.2"/>
                      <circle cx="21" cy="9.2" r="0.6" fill="var(--pt-warn)" stroke="none"/>
                    </svg>
                  }
                  title="No channels connected"
                  body="Connect WhatsApp, Telegram or email to start receiving messages."
                  action={{ label: 'Connect a channel →', href: '/settings/channels' }}
                />
              ) : (
                <EmptyState
                  size="sm"
                  icon={
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="6" width="22" height="16" rx="2.5"/>
                      <path d="M3 11l11 7 11-7" strokeWidth="1"/>
                    </svg>
                  }
                  title="No conversations"
                  body="Messages will appear here when customers reach out."
                  action={{
                    label: 'Compose a message →',
                    onClick: () => window.dispatchEvent(new CustomEvent('pt:compose:open')),
                  }}
                />
              )}
            </div>
          </li>
        )}
      </ul>
    </DashCard>
  )
}

// ─── Payments card ──────────────────────────────────────────────────────────

function fmtAge(mins: number) {
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}


function PaymentsCard({ orders, baseCurrency }: { orders: PendingOrder[]; baseCurrency: string }) {
  return (
    <DashCard title="Payments" subtitle="Awaiting confirmation"
      action={<Link href="/orders" className="pt-link">View all →</Link>}>
      <ul className="pt-pay-list">
        {orders.length === 0 && (
          <li>
            <div className="pt-empty-box">
              <EmptyState
                size="sm"
                icon={
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                    <circle cx="14" cy="14" r="10"/>
                    <path d="M14 9v10M11 11.5h4a2 2 0 0 1 0 4h-3a2 2 0 0 0 0 4h4.5"/>
                  </svg>
                }
                title="No pending payments"
              />
            </div>
          </li>
        )}
        {orders.map(o => {
          const badge = PAYMENT_BADGE[o.asset] ?? { label: o.asset, key: 'other' }
          return (
          <li key={o.id} className={`pt-pay pt-pay-${o.status === 'confirming' ? 'confirming' : 'pending'}`}>
            <div className="pt-pay-asset" data-asset={badge.key}>{badge.label}</div>
            <div className="pt-pay-mid">
              <div className="pt-pay-who">{o.customerName}</div>
              <div className="pt-pay-state">
                {o.status === 'confirming'
                  ? <><span className="pt-dot pt-dot-warn" /> confirming · {fmtAge(o.minsAgo)}</>
                  : <><span className="pt-dot pt-dot-cool" /> awaiting tx hash · {fmtAge(o.minsAgo)}</>}
              </div>
            </div>
            <div className="pt-pay-amt-col">
              <div className="pt-pay-amt">{formatAmountCompact(o.amount, baseCurrency)}</div>
              <Link href={`/orders/${o.id}`} className="pt-pay-act">{o.refNumber}</Link>
            </div>
          </li>
        )})}
      </ul>
    </DashCard>
  )
}

// ─── Revenue card ────────────────────────────────────────────────────────────

const PERIOD_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

function RevenueCard({ daily90d, baseCurrency }: { daily90d: { d: string; v: number }[]; baseCurrency: string }) {
  const [period, setPeriod] = useState('7d')
  const data = daily90d.slice(-PERIOD_DAYS[period])
  const max = Math.max(...data.map(d => d.v), 1)
  const total = data.reduce((s, d) => s + d.v, 0)

  // For 30d/90d, only show every Nth label to avoid crowding
  const labelEvery = period === '7d' ? 1 : period === '30d' ? 5 : 15

  return (
    <DashCard
      title="Revenue"
      subtitle={`Last ${period} · ${formatAmountCompact(total, baseCurrency)} total`}
      action={
        <div className="pt-segctl">
          {['7d', '30d', '90d'].map(p => (
            <button key={p} className={period === p ? 'is-on' : ''} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      }>
      <div className="pt-bars">
        {data.map((d, i) => (
          <div className="pt-bar-col" key={i}>
            <div className="pt-bar-track">
              <div className="pt-bar-fill" style={{ height: `${(d.v / max) * 100}%` }}>
                {d.v > 0 && <span className="pt-bar-tip">{formatAmount(d.v, baseCurrency)}</span>}
              </div>
            </div>
            <div className="pt-bar-lbl">{i % labelEvery === 0 ? d.d : ''}</div>
          </div>
        ))}
      </div>
    </DashCard>
  )
}

// ─── Reorders card ──────────────────────────────────────────────────────────

function ReordersCard({ reorders }: { reorders: ReorderSignal[] }) {
  return (
    <DashCard title="Reorder signals" subtitle="Protocol-driven · dosing schedule"
      action={<Link href="/catalog" className="pt-link" style={{ fontSize: 11 }}>Configure →</Link>}>
      {reorders.length === 0 && (
        <div className="pt-empty-box">
          <EmptyState
            size="sm"
            icon={
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 14a9 9 0 0 1 16-5.7"/>
                <path d="M23 14a9 9 0 0 1-16 5.7"/>
                <path d="M21 8.3l.8-4-3 1.5"/>
                <path d="M7 19.7l-.8 4 3-1.5"/>
              </svg>
            }
            title="All customers stocked"
            body="Reorder signals appear when supply is running low."
          />
        </div>
      )}
      <ul className="pt-reorder-list">
        {reorders.map((r, i) => (
          <Link key={i} href={`/customers/${r.customerId}`} style={{ textDecoration: 'none', color: 'inherit', display: 'contents' }}>
          <li className="pt-reorder">
            <div className="pt-reorder-due">
              <div className={`pt-reorder-when ${r.dueIn === 'now' ? 'is-now' : ''}`}>{r.dueIn}</div>
              <div className="pt-reorder-cycle">{r.cycle}</div>
            </div>
            <div className="pt-reorder-mid">
              <div className="pt-reorder-who">{r.who}</div>
              <div className="pt-reorder-prod">{r.product}</div>
            </div>
            <div className="pt-reorder-conf">
              <div className="pt-confbar">
                <div className="pt-confbar-fill" style={{ width: `${r.conf * 100}%` }} />
              </div>
              <div className="pt-reorder-pct">{Math.round(r.conf * 100)}%</div>
            </div>
            <button className="pt-reorder-act" title="Send pre-written reorder ping" onClick={e => e.preventDefault()}>
              <Icons.send size={12} />
            </button>
          </li>
          </Link>
        ))}
      </ul>
    </DashCard>
  )
}

// ─── Stock card ─────────────────────────────────────────────────────────────

function StockCard({ products, velocity7dByProduct }: { products: CatalogProduct[]; velocity7dByProduct: Record<string, number> }) {
  return (
    <DashCard title="Stock" subtitle="On-hand by SKU"
      action={<Link href="/catalog" className="pt-link">Catalog →</Link>}
      scroll>
      <table className="pt-stock">
        <thead>
          <tr><th>Product</th><th className="r">On-hand</th><th className="r">7d Δ</th></tr>
        </thead>
        <tbody>
          {products.length === 0 && (
            <tr>
              <td colSpan={5}>
                <div className="pt-empty-box" style={{ margin: '4px' }}>
                  <EmptyState
                    size="sm"
                    icon={
                      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                        <rect x="10" y="5" width="8" height="18" rx="4"/>
                        <line x1="10" y1="12" x2="18" y2="12" strokeWidth="0.9" opacity="0.45"/>
                        <rect x="19.5" y="9" width="5.5" height="14" rx="2.75" opacity="0.45"/>
                        <rect x="3" y="11" width="5.5" height="12" rx="2.75" opacity="0.35"/>
                      </svg>
                    }
                    title="No products in catalog"
                    body="Seed your catalog during onboarding, or add products manually."
                    action={{ label: 'Go to catalog →', href: '/catalog' }}
                  />
                </div>
              </td>
            </tr>
          )}
          {products.map(p => {
            const isOut = p.totalStock === 0
            const isLow = !isOut && p.totalStock < 15
            const sold7d = velocity7dByProduct[p.id] ?? 0
            return (
              <tr key={p.sku} className={isOut ? 'is-out' : isLow ? 'is-low' : ''}>
                <td>
                  <Link href={`/catalog?product=${p.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="pt-reorder-who">{p.name}</span>
                    <span className="pt-sku" style={{ opacity: 0.5 }}>{p.sku}</span>
                  </Link>
                </td>
                <td className="r mono">
                  {isOut
                    ? <span className="pt-out">OUT</span>
                    : <>{p.totalStock}<span className="pt-stock-unit">u</span></>}
                </td>
                <td className="r mono" style={{ color: sold7d > 0 ? 'var(--pt-fg-2)' : 'var(--pt-fg-4)' }}>
                  {sold7d > 0 ? <>{sold7d}<span className="pt-stock-unit">u</span></> : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </DashCard>
  )
}

// ─── Shipments card ──────────────────────────────────────────────────────────

const SHIP_LABELS: Record<string, string> = {
  shipped: 'In transit',
  delivered: 'Delivered',
}

function isSafeUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

function ShipmentsCard({ shipments }: { shipments: ShipmentRow[] }) {
  return (
    <DashCard title="Shipments" subtitle="Carrier tracking"
      action={<button className="pt-link">All →</button>}>
      <ul className="pt-ship-list">
        {shipments.map(s => {
          const step = s.status === 'delivered' ? 4 : 3
          const statusCls = s.status === 'delivered' ? 'pt-ship-delivered' : 'pt-ship-in_transit'
          const eta = s.estimatedDelivery
            ? new Date(s.estimatedDelivery).toLocaleDateString('en', { month: 'short', day: 'numeric' })
            : s.deliveredAt ? 'Delivered' : null
          return (
            <Link key={s.id} href={`/orders/${s.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'contents' }}>
              <li className={`pt-ship ${statusCls}`} style={{ cursor: 'pointer' }}>
                <div className="pt-ship-icon"><Icons.truck size={14} /></div>
                <div>
                  <div className="pt-ship-row1">
                    <span className="pt-ship-to">→ {s.to}</span>
                    {s.carrier && <span className="pt-ship-carrier">{s.carrier}</span>}
                    {s.trackingNumber && (
                      s.trackingUrl && isSafeUrl(s.trackingUrl)
                        ? <button
                            className="pt-ship-id"
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textDecoration: 'underline' }}
                            onClick={e => { e.preventDefault(); e.stopPropagation(); window.open(s.trackingUrl!, '_blank', 'noreferrer noopener') }}
                          >{s.trackingNumber} ↗</button>
                        : <span className="pt-ship-id">{s.trackingNumber}</span>
                    )}
                    {!s.trackingNumber && s.trackingUrl && isSafeUrl(s.trackingUrl) && (
                      <button
                        className="pt-ship-id"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textDecoration: 'underline' }}
                        onClick={e => { e.preventDefault(); e.stopPropagation(); window.open(s.trackingUrl!, '_blank', 'noreferrer noopener') }}
                      >Track ↗</button>
                    )}
                  </div>
                  <div className="pt-ship-track">
                    {[1,2,3,4].map(i => (
                      <span key={i} className={`pt-ship-step${i <= step ? ' on' : ''}`} />
                    ))}
                    <span className="pt-ship-status">
                      {SHIP_LABELS[s.status] ?? s.status}{eta ? ` · ETA ${eta}` : ''}
                    </span>
                  </div>
                </div>
              </li>
            </Link>
          )
        })}
        {shipments.length === 0 && (
          <li>
            <div className="pt-empty-box">
              <EmptyState
                size="sm"
                icon={
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 9l10-5 10 5v11L14 25 4 20V9z"/>
                    <path d="M4 9l10 6 10-6M14 15v10"/>
                  </svg>
                }
                title="No active shipments"
              />
            </div>
          </li>
        )}
      </ul>
    </DashCard>
  )
}

// ─── Right rail ──────────────────────────────────────────────────────────────

const CH_NAMES: Record<string, string> = { wa: 'WhatsApp', tg: 'Telegram', em: 'Email' }

export function DashboardRightRail({
  focusThread,
  baseCurrency,
  pendingOrders,
  needsReplyThreads,
  reordersDueSoon,
  packingOrders,
  activityItems,
}: {
  focusThread: InboxThread | null
  baseCurrency: string
  pendingOrders: PendingOrder[]
  needsReplyThreads: InboxThread[]
  reordersDueSoon: ReorderSignal[]
  packingOrders: PackingOrder[]
  activityItems: ActivityItem[]
}) {
  const t = focusThread

  const agendaItems: { bullet: string; title: string; sub: string; href: string }[] = []
  pendingOrders.filter(o => o.status === 'confirming').forEach(o => {
    agendaItems.push({ bullet: 'pt-bul-warn', title: `Confirm ${o.asset} from ${o.customerName}`, sub: formatAmount(o.amount, baseCurrency), href: `/orders/${o.id}` })
  })
  packingOrders.forEach(o => {
    agendaItems.push({ bullet: 'pt-bul-cool', title: `Ship #${o.refNumber} for ${o.customerName}`, sub: 'Ready to ship', href: `/orders/${o.id}` })
  })
  needsReplyThreads.forEach(t => {
    agendaItems.push({ bullet: '', title: `Reply to ${t.name}`, sub: t.snippet ?? '', href: `/inbox?conversation=${t.id}` })
  })
  reordersDueSoon.forEach(r => {
    agendaItems.push({ bullet: '', title: `Reorder ${r.product}`, sub: r.dueIn === 'now' ? 'Due now' : `Due in ${r.dueIn}`, href: `/customers/${r.customerId}` })
  })

  return (
    <aside className="pt-right">
      <div className="pt-right-section">
        <div className="pt-right-hd"><span>Today</span></div>
        <ul className="pt-agenda">
          {agendaItems.length === 0 && (
            <li>
              <EmptyState
                size="sm"
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                    <circle cx="12" cy="12" r="4"/>
                    <line x1="12" y1="3" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21"/>
                    <line x1="3" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21" y2="12"/>
                    <line x1="5.6" y1="5.6" x2="7" y2="7"/><line x1="17" y1="17" x2="18.4" y2="18.4"/>
                    <line x1="18.4" y1="5.6" x2="17" y2="7"/><line x1="7" y1="17" x2="5.6" y2="18.4"/>
                  </svg>
                }
                title="All caught up"
                body="Enjoy the quiet."
              />
            </li>
          )}
          {agendaItems.slice(0, 6).map((item, i) => (
            <Link key={i} href={item.href} style={{ textDecoration: 'none', color: 'inherit', display: 'contents' }}>
              <li className="pt-agenda-i">
                <i className={`pt-agenda-bullet ${item.bullet}`} />
                <div>
                  <div className="pt-agenda-t">{item.title}</div>
                  {item.sub && <div className="pt-agenda-s">{item.sub}</div>}
                </div>
              </li>
            </Link>
          ))}
        </ul>
      </div>

      {t && (
        <div className="pt-right-section">
          <div className="pt-right-hd">
            <span>Focus customer</span>
            <Link href="/inbox" className="pt-link">Open →</Link>
          </div>
          <Link href={`/customers/${t.customerId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="pt-cust">
              <div className="pt-cust-hd">
                <div className="pt-cust-av" data-channel={t.channel}>{initials(t.name)}</div>
                <div className="pt-cust-id">
                  <div className="pt-cust-name">{t.name}</div>
                  <div className="pt-cust-handle mono">{t.handle}</div>
                </div>
                <TrustBlock score={t.trust} />
              </div>
              <div className="pt-cust-stats">
                <div><div className="lbl">LTV</div><div className="val mono">{formatAmount(t.ltv, baseCurrency)}</div></div>
                <div><div className="lbl">Channel</div><div className="val">{CH_NAMES[t.channel]}</div></div>
              </div>
              <div className="pt-cust-tags">
                {t.tags.map(tag => <span key={tag} className="pt-tag pt-tag-soft">{tag}</span>)}
              </div>
              {t.snippet && (
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8, fontStyle: 'italic' }}>
                  &ldquo;{t.snippet}&rdquo;
                </div>
              )}
            </div>
          </Link>
        </div>
      )}

      <div className="pt-right-section">
        <div className="pt-right-hd"><span>Activity</span></div>
        <ul className="pt-agenda">
          {activityItems.length === 0 && (
            <li>
              <EmptyState
                size="sm"
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                    <line x1="9" y1="4" x2="9" y2="20" strokeWidth="0.8" opacity="0.3"/>
                    <circle cx="9" cy="8" r="2" fill="currentColor" stroke="none"/>
                    <line x1="13" y1="8" x2="20" y2="8"/>
                    <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" opacity="0.35"/>
                    <line x1="13" y1="14" x2="18" y2="14" opacity="0.35"/>
                    <circle cx="9" cy="19" r="1.2" fill="currentColor" stroke="none" opacity="0.18"/>
                    <line x1="13" y1="19" x2="17" y2="19" opacity="0.18"/>
                  </svg>
                }
                title="No recent activity"
              />
            </li>
          )}
          {activityItems.map(item => (
            <Link key={item.id} href={item.href} style={{ textDecoration: 'none', color: 'inherit', display: 'contents' }}>
              <li className="pt-agenda-i">
                <i className={`pt-agenda-bullet ${item.type === 'message' ? 'pt-bul-cool' : ''}`} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="pt-agenda-t" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </div>
                  {item.detail && (
                    <div className="pt-agenda-s" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.detail}
                    </div>
                  )}
                </div>
                <span className="pt-agenda-time" style={{ flexShrink: 0 }}>{fmtAge(item.minsAgo)}</span>
              </li>
            </Link>
          ))}
        </ul>
      </div>
    </aside>
  )
}

// ─── Dashboard page content ──────────────────────────────────────────────────

function greeting(name: string) {
  const h = new Date().getHours()
  const tod = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return `${tod}, ${name}`
}

export function DashboardView({ threads: initialThreads, stockProducts, stats, reorderSignals, baseCurrency, displayName, shipments, packingOrders, activityItems, onboardingStatus, connectedChannels }: { threads: InboxThread[]; stockProducts: CatalogProduct[]; stats: DashboardStats; reorderSignals: ReorderSignal[]; baseCurrency: string; displayName: string; shipments: ShipmentRow[]; packingOrders: PackingOrder[]; activityItems: ActivityItem[]; onboardingStatus?: { hasProducts: boolean; hasChannel: boolean; hasPayment: boolean } | null; connectedChannels: string[] }) {
  const [threads, setThreads] = useState(initialThreads)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const channel = supabase
      .channel(`dashboard:convs-${Math.random()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
        const u = payload.new as {
          id: string; status: string; unread_count: number
          last_message_snippet: string | null; last_message_at: string | null
        }
        setThreads(prev => {
          const inList = prev.some(t => t.id === u.id)
          if (!ACTIVE_STATUSES.has(u.status)) {
            return inList ? prev.filter(t => t.id !== u.id) : prev
          }
          if (inList) {
            return prev.map(t => t.id !== u.id ? t : {
              ...t,
              status: u.status as InboxThread['status'],
              unread: u.unread_count,
              snippet: u.last_message_snippet ?? t.snippet,
              minsAgo: u.last_message_at
                ? Math.floor((Date.now() - new Date(u.last_message_at).getTime()) / 60000)
                : t.minsAgo,
            })
          }
          return prev
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, (payload) => {
        const ins = payload.new as { id: string; status: string }
        if (!ACTIVE_STATUSES.has(ins.status)) return
        void supabase.from('conversations').select(CONV_SELECT).eq('id', ins.id).single()
          .then(({ data }) => {
            if (data) setThreads(prev =>
              prev.some(t => t.id === ins.id) ? prev
                : [dbConversationToThread(data as unknown as DbConversation), ...prev]
            )
          })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  const active = threads.length
  const needsReply = threads.filter(t => t.status === 'needs_reply').length
  const reordersDue7d = reorderSignals.filter(s => s.daysRemaining <= 7).length
  const highConf = reorderSignals.filter(s => s.conf >= 0.8).length

  return (
    <div className="pt-page">
      <div className="pt-page-hd">
        <div>
          <h1>{greeting(displayName)}</h1>
          <p>{active} active threads · {needsReply} need a reply · {reordersDue7d} reorders due in &lt;7d</p>
        </div>
        <div className="pt-page-actions">
          <button className="pt-btn pt-btn-ghost">Daily summary</button>
          <Link href="/broadcasts" className="pt-btn pt-btn-primary">
            <Icons.send size={12} /> New broadcast
          </Link>
        </div>
      </div>

      <KpiRow active={active} needsReply={needsReply} reordersDue7d={reordersDue7d} highConf={highConf} stats={stats} baseCurrency={baseCurrency} />

      <div className="pt-grid">
        {onboardingStatus && (
          <OnboardingChecklist
            hasProducts={onboardingStatus.hasProducts}
            hasChannel={onboardingStatus.hasChannel}
            hasPayment={onboardingStatus.hasPayment}
          />
        )}
        <div className="pt-dash-card-inbox pt-span-2"><InboxCard threads={threads} connectedChannels={connectedChannels} /></div>
        <PaymentsCard orders={stats.pendingOrders} baseCurrency={baseCurrency} />
        <RevenueCard daily90d={stats.revenue90dDaily} baseCurrency={baseCurrency} />
        <div className="pt-dash-card-reorder"><ReordersCard reorders={reorderSignals} /></div>
        <div className="pt-dash-card-stock"><StockCard products={stockProducts} velocity7dByProduct={stats.velocity7dByProduct} /></div>
        <div className="pt-dash-card-shipments"><ShipmentsCard shipments={shipments} /></div>
      </div>

      <footer className="pt-foot">
        <span className="mono">v0.5.0</span>
        <span className="pt-foot-mid">For research use only · Not for human consumption.</span>
        <span className="mono">⌘K to search · ⌘N new msg</span>
      </footer>
    </div>
  )
}
