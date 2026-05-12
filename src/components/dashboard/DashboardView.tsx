'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import {
  MOCK_REORDERS, MOCK_SHIPMENTS,
  type MockReorder, type MockShipment,
} from '@/lib/mock-data'
import type { InboxThread } from '@/types/inbox'
import type { CatalogProduct } from '@/types/catalog'
import type { DashboardStats, PendingOrder } from '@/types/dashboard'
import { initials } from '@/types/inbox'
import { PAYMENT_BADGE } from '@/types/payments'

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

function KpiRow({ active, needsReply, stats }: { active: number; needsReply: number; stats: DashboardStats }) {
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
      value: `$${revenue7d.toLocaleString()}`,
      delta,
      spark: spark7d,
    },
    {
      label: 'Pending crypto',
      value: `$${pendingTotal.toLocaleString()}`,
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
    { label: 'Reorders due · 7d', value: '11', delta: null, sub: '3 high-confidence' },
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
            {k.spark && <Spark data={k.spark} />}
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

function InboxCard({ threads }: { threads: InboxThread[] }) {
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
          <li className="pt-thread" style={{ opacity: 0.5, fontSize: 13 }}>No conversations</li>
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


function PaymentsCard({ orders }: { orders: PendingOrder[] }) {
  return (
    <DashCard title="Payments" subtitle="Awaiting confirmation"
      action={<Link href="/orders" className="pt-link">View all →</Link>}>
      <ul className="pt-pay-list">
        {orders.length === 0 && (
          <li className="pt-pay" style={{ opacity: 0.5, fontSize: 12 }}>No pending payments</li>
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
              <div className="pt-pay-amt">${o.amount.toLocaleString()}</div>
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

function RevenueCard({ daily90d }: { daily90d: { d: string; v: number }[] }) {
  const [period, setPeriod] = useState('7d')
  const data = daily90d.slice(-PERIOD_DAYS[period])
  const max = Math.max(...data.map(d => d.v), 1)
  const total = data.reduce((s, d) => s + d.v, 0)

  // For 30d/90d, only show every Nth label to avoid crowding
  const labelEvery = period === '7d' ? 1 : period === '30d' ? 5 : 15

  return (
    <DashCard
      title="Revenue"
      subtitle={`Last ${period} · $${total.toLocaleString()} total`}
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
                {d.v > 0 && <span className="pt-bar-tip">${d.v.toLocaleString()}</span>}
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

function ReordersCard({ reorders }: { reorders: MockReorder[] }) {
  return (
    <DashCard title="Reorder signals" subtitle="Cycle-end approaching · ML guess"
      action={<button className="pt-link">Configure →</button>}>
      <ul className="pt-reorder-list">
        {reorders.map((r, i) => (
          <li key={i} className="pt-reorder">
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
            <button className="pt-reorder-act" title="Send pre-written reorder ping">
              <Icons.send size={12} />
            </button>
          </li>
        ))}
      </ul>
    </DashCard>
  )
}

// ─── Stock card ─────────────────────────────────────────────────────────────

function StockCard({ products }: { products: CatalogProduct[] }) {
  return (
    <DashCard title="Stock" subtitle="On-hand by SKU"
      action={<Link href="/catalog" className="pt-link">Catalog →</Link>}
      scroll>
      <table className="pt-stock">
        <thead>
          <tr><th>SKU</th><th>Lot</th><th className="r">On-hand</th><th className="r">7d Δ</th></tr>
        </thead>
        <tbody>
          {products.map(p => {
            const latestBatch = p.batches[0]
            const isOut = p.totalStock === 0
            const isLow = !isOut && p.totalStock < 15
            return (
              <tr key={p.sku} className={isOut ? 'is-out' : isLow ? 'is-low' : ''}>
                <td>
                  <div className="pt-sku">{p.sku}</div>
                  <div className="pt-sku-name">{p.name}</div>
                </td>
                <td className="mono">{latestBatch?.batch_number ?? '—'}</td>
                <td className="r mono">
                  {isOut
                    ? <span className="pt-out">OUT</span>
                    : <>{p.totalStock}<span className="pt-stock-unit">u</span></>}
                </td>
                <td className="r mono" style={{ color: 'var(--pt-fg-4)' }}>—</td>
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
  label_made: 'Label', in_transit: 'In transit', customs: 'Customs', delivered: 'Delivered',
}

function ShipmentsCard({ shipments }: { shipments: MockShipment[] }) {
  return (
    <DashCard title="Shipments" subtitle="Carrier tracking"
      action={<button className="pt-link">All →</button>}>
      <ul className="pt-ship-list">
        {shipments.map(s => (
          <li key={s.id} className={`pt-ship pt-ship-${s.status}`}>
            <div className="pt-ship-icon"><Icons.truck size={13} /></div>
            <div className="pt-ship-mid">
              <div className="pt-ship-row1">
                <span className="pt-ship-to">→ {s.to}</span>
                <span className="pt-ship-carrier">{s.carrier}</span>
                <span className="pt-ship-id mono">{s.id}</span>
              </div>
              <div className="pt-ship-track">
                {[1,2,3,4].map(n => <i key={n} className={`pt-ship-step ${n <= s.step ? 'on' : ''}`} />)}
                <span className="pt-ship-status">{SHIP_LABELS[s.status]} · ETA {s.eta}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </DashCard>
  )
}

// ─── Right rail ──────────────────────────────────────────────────────────────

const CH_NAMES: Record<string, string> = { wa: 'WhatsApp', tg: 'Telegram', em: 'Email' }

export function DashboardRightRail({ focusThread }: { focusThread: InboxThread | null }) {
  const t = focusThread
  return (
    <aside className="pt-right">
      <div className="pt-right-section">
        <div className="pt-right-hd">
          <span>Today</span>
          <button className="pt-right-add"><Icons.plus size={11} /></button>
        </div>
        <ul className="pt-agenda">
          <li className="pt-agenda-i">
            <i className="pt-agenda-bullet pt-bul-warn" />
            <div>
              <div className="pt-agenda-t">Confirm USDT from K.</div>
              <div className="pt-agenda-s">2/3 conf · ~9 min away</div>
            </div>
            <span className="pt-agenda-time">11:42</span>
          </li>
          <li className="pt-agenda-i">
            <i className="pt-agenda-bullet pt-bul-cool" />
            <div>
              <div className="pt-agenda-t">Drop pkg at USPS</div>
              <div className="pt-agenda-s">3 labels printed · cutoff 4pm</div>
            </div>
            <span className="pt-agenda-time">14:00</span>
          </li>
          <li className="pt-agenda-i">
            <i className="pt-agenda-bullet" />
            <div>
              <div className="pt-agenda-t">Re-up tirz from supplier</div>
              <div className="pt-agenda-s">9 vials left · 4 backorders</div>
            </div>
            <span className="pt-agenda-time pt-agenda-empty" />
          </li>
          <li className="pt-agenda-i">
            <i className="pt-agenda-bullet" />
            <div>
              <div className="pt-agenda-t">Reply to swolepriest</div>
              <div className="pt-agenda-s">2wk old · risk of churn</div>
            </div>
            <span className="pt-agenda-time pt-agenda-empty" />
          </li>
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
                <div><div className="lbl">LTV</div><div className="val mono">${t.ltv.toLocaleString()}</div></div>
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
        <div className="pt-right-hd"><span>Quick replies</span></div>
        <div className="pt-quicks">
          {['send wallet addr', 'tracking uploaded', 'out of stock — eta?', 'first-time how-to', 'dosing protocol', 'discount: repeat 10%'].map(q => (
            <button key={q} className="pt-quick">{q}</button>
          ))}
        </div>
      </div>
    </aside>
  )
}

// ─── Dashboard page content ──────────────────────────────────────────────────

export function DashboardView({ threads, stockProducts, stats }: { threads: InboxThread[]; stockProducts: CatalogProduct[]; stats: DashboardStats }) {
  const active = threads.length
  const needsReply = threads.filter(t => t.status === 'needs_reply').length

  return (
    <div className="pt-page">
      <div className="pt-page-hd">
        <div>
          <h1>Dashboard</h1>
          <p>{active} active threads · {needsReply} need a reply · 3 reorders due in &lt;48h</p>
        </div>
        <div className="pt-page-actions">
          <button className="pt-btn pt-btn-ghost">Daily summary</button>
          <Link href="/broadcasts" className="pt-btn pt-btn-primary">
            <Icons.send size={12} /> New broadcast
          </Link>
        </div>
      </div>

      <KpiRow active={active} needsReply={needsReply} stats={stats} />

      <div className="pt-grid">
        <InboxCard threads={threads} />
        <PaymentsCard orders={stats.pendingOrders} />
        <RevenueCard daily90d={stats.revenue90dDaily} />
        <ReordersCard reorders={MOCK_REORDERS} />
        <StockCard products={stockProducts} />
        <ShipmentsCard shipments={MOCK_SHIPMENTS} />
      </div>

      <footer className="pt-foot">
        <span className="mono">v0.5.0</span>
        <span className="pt-foot-mid">For research use only · Not for human consumption.</span>
        <span className="mono">⌘K to search · ⌘N new msg</span>
      </footer>
    </div>
  )
}
