import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { Icons } from '@/lib/icons'
import { CustomerNewOrderButton } from '@/components/customers/CustomerNewOrderButton'
import { CustomerNoteCard } from '@/components/customers/CustomerNoteCard'
import { ActiveCyclesCard } from '@/components/customers/ActiveCyclesCard'
import { computeSupply } from '@/types/protocols'
import { formatAmount } from '@/lib/currency'
import type { ProductProtocol, CustomerProtocolOverride, CycleEntry } from '@/types/protocols'

const CH_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'Email' }
const CH_KEY: Record<string, string> = { whatsapp: 'wa', telegram: 'tg', email: 'em' }

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0]]).join('')
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const PAY_BADGE: Record<string, { label: string; key: string }> = {
  usdt_trc20:       { label: 'USDT',  key: 'usdt'  },
  btc:              { label: 'BTC',   key: 'btc'   },
  eth:              { label: 'ETH',   key: 'eth'   },
  usdc_erc20:       { label: 'USDC',  key: 'usdc'  },
  ltc:              { label: 'LTC',   key: 'ltc'   },
  xmr:              { label: 'XMR',   key: 'xmr'   },
  bank_transfer:    { label: 'Bank',  key: 'bank'  },
  customer_chooses: { label: 'Multi', key: 'multi' },
  cash:             { label: 'Cash',  key: 'cash'  },
  USDT:             { label: 'USDT',  key: 'usdt'  },
  BTC:              { label: 'BTC',   key: 'btc'   },
  Cash:             { label: 'Cash',  key: 'cash'  },
  Other:            { label: 'Other', key: 'other' },
}

// ─── Mock data for sections not yet backed by the DB ────────────────────────

const MOCK_TRUST_FACTORS = [
  { label: 'On-time payments',    v: 14, of: 14, w: 30, neg: false },
  { label: 'Repeat ordering',     v: 11, of: 12, w: 24, neg: false },
  { label: 'Address consistency', v: 1,  of: 1,  w: 16, neg: false },
  { label: 'Acct age (20mo)',     v: 20, of: 24, w: 12, neg: false },
  { label: 'Disputes/refunds',    v: 0,  of: 0,  w: 10, neg: true  },
]

const MOCK_ACTIVITY = [
  { dot: 'cool', bold: 'USDT received', rest: ' · $330 · 4m ago' },
  { dot: '',     bold: 'Order #A-2241 placed', rest: ' · today 13:18' },
  { dot: '',     bold: 'Replied to broadcast "restock"', rest: ' · yesterday' },
  { dot: 'warn', bold: 'Reorder ping sent', rest: ' · 4d ago' },
  { dot: '',     bold: 'Order #A-2188 delivered', rest: ' · Apr 2' },
]

const MOCK_PAY_METHODS = ['USDT (TRC20)', 'BTC', 'Cash']

function OrderState({ state }: { state: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    awaiting:   { cls: 'warn', label: 'Awaiting'   },
    confirming: { cls: 'warn', label: 'Confirming' },
    packing:    { cls: 'cool', label: 'Packing'    },
    shipped:    { cls: 'cool', label: 'Shipped'    },
    delivered:  { cls: 'ok',   label: 'Delivered'  },
    cancelled:  { cls: '',     label: 'Cancelled'  },
  }
  const s = map[state] ?? { cls: '', label: state }
  return <span className={`pt-cu-state pt-cu-state-${s.cls}`}><i />{s.label}</span>
}

export default async function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [{ data: customer }, { data: notes }, { data: orders }, { data: tenantRow }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, display_name, trust_score, ltv, created_at, customer_channels(channel_type, display_handle, is_primary), customer_tags(tag)')
      .eq('id', customerId)
      .single(),
    supabase
      .from('notes')
      .select('id, content, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('orders')
      .select('id, ref_number, status, payment_asset, payment_amount, created_at, delivered_at, order_items(product_id, qty, unit_price_snapshot, products(name))')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('tenants')
      .select('base_currency')
      .single(),
  ])

  if (!customer) redirect('/customers')

  const baseCurrency = (tenantRow?.base_currency as string | null) ?? 'USD'

  const primary = customer.customer_channels?.find(c => c.is_primary) ?? customer.customer_channels?.[0]
  const chKey = primary ? CH_KEY[primary.channel_type] ?? 'wa' : 'wa'
  const chLabel = primary ? CH_LABEL[primary.channel_type] ?? '—' : '—'
  const trustCls = customer.trust_score >= 85 ? 'hi' : customer.trust_score >= 65 ? 'md' : 'lo'
  const tags = customer.customer_tags?.map(t => t.tag) ?? []
  const realOrders = orders ?? []

  // ── Compute active cycles ─────────────────────────────────────────────────
  type LatestItem = { productId: string; productName: string; qty: number; orderDate: string | null }
  const seenProducts = new Set<string>()
  const latestItems: LatestItem[] = []

  for (const order of realOrders) {
    const items = order.order_items as { product_id: string; qty: number; products: { name: string } | null }[]
    for (const item of items ?? []) {
      if (!item.product_id || seenProducts.has(item.product_id)) continue
      seenProducts.add(item.product_id)
      const o = order as { status: string; created_at: string; delivered_at?: string | null }
      // Use delivered_at if set; fall back to created_at for pre-existing delivered orders
      const orderDate = o.delivered_at ?? (o.status === 'delivered' ? o.created_at : null)
      latestItems.push({
        productId: item.product_id,
        productName: item.products?.name ?? '—',
        qty: item.qty,
        orderDate,
      })
    }
  }

  const productIds = latestItems.map(i => i.productId)
  const cycles: CycleEntry[] = []

  if (productIds.length > 0) {
    const [{ data: protocols }, { data: overrides }] = await Promise.all([
      supabase.from('product_protocols').select('*').in('product_id', productIds),
      supabase.from('customer_protocol_overrides').select('*').eq('customer_id', customerId).in('product_id', productIds),
    ])

    const protocolMap = Object.fromEntries(((protocols ?? []) as ProductProtocol[]).map(p => [p.product_id, p]))
    const overrideMap = Object.fromEntries(((overrides ?? []) as CustomerProtocolOverride[]).map(o => [o.product_id, o]))

    for (const item of latestItems) {
      const protocol = protocolMap[item.productId]
      if (!protocol) {
        cycles.push({ productId: item.productId, productName: item.productName })
        continue
      }
      // Clock starts at delivery — if not yet delivered, supply hasn't started
      if (!item.orderDate) {
        cycles.push({ productId: item.productId, productName: item.productName, pendingDelivery: true })
        continue
      }
      cycles.push(computeSupply({
        productId: item.productId,
        productName: item.productName,
        unitsOrdered: item.qty,
        orderDate: item.orderDate,
        protocol,
        override: overrideMap[item.productId] ?? null,
      }))
    }
  }

  const totalOrders = realOrders.length
  const avgOrder = totalOrders > 0 ? customer.ltv / totalOrders : 0
  const lastOrderDate = realOrders[0]?.created_at
    ? new Date(realOrders[0].created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—'
  const joined = customer.created_at ? new Date(customer.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : '—'
  const ChIcon = chKey === 'wa' ? Icons.wa : chKey === 'tg' ? Icons.tg : Icons.em

  return (
    <Shell section="Customers">
      <div className="pt-cu">

        {/* ── Header ── */}
        <div className="pt-cu-hd">
          <Link href="/customers" className="pt-ix-back" title="Back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6"/>
            </svg>
          </Link>
          <div className="pt-cu-hd-id">
            <div className="pt-cu-hd-av" data-channel={chKey}>{initials(customer.display_name)}</div>
            <div>
              <div className="pt-cu-hd-name">
                {customer.display_name}
                {tags.includes('vip')      && <span className="pt-tag pt-tag-vip">VIP</span>}
                {tags.includes('waitlist') && <span className="pt-tag">waitlist</span>}
                {tags.includes('new')      && <span className="pt-tag pt-tag-new">new</span>}
              </div>
              <div className="pt-cu-hd-handle mono">
                {primary?.display_handle ?? '—'} · {chLabel} · joined {joined}
              </div>
            </div>
          </div>
          <div className="pt-cu-hd-actions">
            <a href="#notes" className="pt-btn pt-btn-ghost">Add note</a>
            <button className="pt-btn pt-btn-ghost">Add tag</button>
            <button className="pt-btn pt-btn-ghost">
              <ChIcon size={12} /> Message
            </button>
            <CustomerNewOrderButton customerId={customer.id} customerName={customer.display_name} />
          </div>
        </div>

        <div className="pt-cu-body">

          {/* ── Stats strip ── */}
          <div className="pt-cu-strip">
            <div className="pt-cu-stat">
              <div className="lbl">LTV</div>
              <div className="val mono">{formatAmount(customer.ltv, baseCurrency)}</div>
            </div>
            <div className="pt-cu-stat">
              <div className="lbl">Orders</div>
              <div className="val mono">{totalOrders}</div>
            </div>
            <div className="pt-cu-stat">
              <div className="lbl">Avg order</div>
              <div className="val mono">{formatAmount(avgOrder, baseCurrency)}</div>
            </div>
            <div className="pt-cu-stat">
              <div className="lbl">Last order</div>
              <div className="val">{lastOrderDate}</div>
            </div>
            <div className="pt-cu-stat">
              <div className="lbl">Channel</div>
              <div className="val pt-cu-stat-ch"><ChIcon size={11} /> {chLabel}</div>
            </div>
            <div className={`pt-cu-stat pt-cu-trust pt-trust-${trustCls}`}>
              <div className="lbl">Trust</div>
              <div className="val mono">{customer.trust_score}<span>/100</span></div>
            </div>
          </div>

          <div className="pt-cu-grid">

            {/* ── Left column ── */}
            <div className="pt-cu-col">

              {/* Order history */}
              <section className="pt-card">
                <header className="pt-card-hd">
                  <div><h3>Order history</h3><p>{totalOrders} total · {formatAmount(customer.ltv, baseCurrency)} LTV</p></div>
                </header>
                <div className="pt-card-body" style={{ padding: 0 }}>
                  {realOrders.length === 0 ? (
                    <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--pt-fg-4)' }}>No orders yet</div>
                  ) : (
                    <table className="pt-cu-orders">
                      <thead>
                        <tr><th>Order</th><th>Date</th><th>Items</th><th>Pay</th><th className="r">Amount</th><th>State</th></tr>
                      </thead>
                      <tbody>
                        {realOrders.map(o => {
                          const items = (o.order_items as { qty: number; products: { name: string } | null }[]) ?? []
                          const badge = PAY_BADGE[o.payment_asset] ?? { label: o.payment_asset, key: 'other' }
                          return (
                            <tr key={o.id}>
                              <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                                <Link href={`/orders/${o.id}`} className="pt-link pt-cu-order-link">#{o.ref_number}</Link>
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(o.created_at)}</td>
                              <td className="pt-cu-items">
                                {items.slice(0, 2).map((i, idx) => (
                                  <span key={idx} className="pt-cu-item-chip">
                                    {i.products?.name ?? '?'} ×{i.qty}
                                  </span>
                                ))}
                                {items.length > 2 && (
                                  <span className="pt-cu-item-more">+{items.length - 2} more</span>
                                )}
                                {items.length === 0 && '—'}
                              </td>
                              <td><span className="pt-pay-asset" data-asset={badge.key}>{badge.label}</span></td>
                              <td className="r mono">{formatAmount(Number(o.payment_amount), baseCurrency)}</td>
                              <td><OrderState state={o.status} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              <ActiveCyclesCard cycles={cycles} customerId={customer.id} />

              {/* Notes */}
              <CustomerNoteCard customerId={customer.id} initialNotes={notes ?? []} />

            </div>

            {/* ── Right column ── */}
            <div className="pt-cu-col">

              {/* Trust score */}
              <section className="pt-card">
                <header className="pt-card-hd">
                  <div><h3>Trust score</h3><p>Weighted factors</p></div>
                  <div className={`pt-trust pt-trust-${trustCls}`}>
                    <div className="pt-trust-num">{customer.trust_score}</div>
                    <div className="pt-trust-lbl">TRUST</div>
                  </div>
                </header>
                <div className="pt-card-body" style={{ padding: 0 }}>
                  <ul className="pt-cu-factors">
                    {MOCK_TRUST_FACTORS.map((f, i) => {
                      const pct = Math.min(1, f.v / Math.max(1, f.of || f.v || 1))
                      return (
                        <li key={i}>
                          <div className="pt-cu-factor-row1">
                            <span className="pt-cu-factor-lbl">{f.label}</span>
                            <span className="pt-cu-factor-v mono">{f.v}{f.of ? `/${f.of}` : ''}</span>
                            <span className="pt-cu-factor-w mono">×{f.w}</span>
                          </div>
                          <div className="pt-cu-factor-bar">
                            <div className={`pt-cu-factor-fill${f.neg && f.v > 0 ? ' is-neg' : ''}`}
                                 style={{ width: `${pct * 100}%` }} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </section>

              {/* Details */}
              <section className="pt-card">
                <header className="pt-card-hd"><div><h3>Details</h3></div></header>
                <div className="pt-card-body" style={{ padding: 0 }}>
                  <dl className="pt-cu-dl">
                    <dt>Tags</dt>
                    <dd className="pt-cu-tags">
                      {tags.length > 0
                        ? tags.map(tg => <span key={tg} className="pt-tag pt-tag-soft">{tg}</span>)
                        : <span style={{ color: 'var(--pt-fg-4)', fontSize: 12 }}>None</span>}
                      <button className="pt-cu-add-tag">+</button>
                    </dd>
                    <dt>Address</dt>
                    <dd>K. — REDACTED, IL 60•••</dd>
                    <dt>Pay methods</dt>
                    <dd>
                      <ul className="pt-cu-pay-list">
                        {MOCK_PAY_METHODS.map(p => <li key={p} className="mono">{p}</li>)}
                      </ul>
                    </dd>
                    <dt>Joined</dt>
                    <dd>{joined}</dd>
                  </dl>
                </div>
              </section>

              {/* Activity */}
              <section className="pt-card">
                <header className="pt-card-hd"><div><h3>Activity</h3><p>Recent events</p></div></header>
                <div className="pt-card-body" style={{ padding: 0 }}>
                  <ul className="pt-cu-act">
                    {MOCK_ACTIVITY.map((a, i) => (
                      <li key={i}>
                        <i className={`pt-cu-act-dot${a.dot ? ` pt-bul-${a.dot}` : ''}`} />
                        <div><b>{a.bold}</b>{a.rest}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}
