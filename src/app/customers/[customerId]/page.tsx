import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { Icons } from '@/lib/icons'
import { CustomerNewOrderButton } from '@/components/customers/CustomerNewOrderButton'

const CH_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'Email' }
const CH_KEY: Record<string, string> = { whatsapp: 'wa', telegram: 'tg', email: 'em' }

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0]]).join('')
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

// ─── Mock data for sections not yet backed by the DB ────────────────────────

const MOCK_CYCLES = [
  { product: 'BPC-157', start: 'Apr 1',  end: 'May 27', weeks: 8,  progress: 0.55 },
  { product: 'Reta',    start: 'Apr 18', end: 'Aug 8',  weeks: 16, progress: 0.18 },
  { product: 'Tirz',    start: 'Mar 11', end: 'Jun 3',  weeks: 12, progress: 0.55 },
]

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
  const [{ data: customer }, { data: notes }, { data: orders }] = await Promise.all([
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
      .select('id, ref_number, status, payment_asset, payment_amount, created_at, order_items(qty, unit_price_snapshot, products(name))')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false }),
  ])

  if (!customer) redirect('/customers')

  const primary = customer.customer_channels?.find(c => c.is_primary) ?? customer.customer_channels?.[0]
  const chKey = primary ? CH_KEY[primary.channel_type] ?? 'wa' : 'wa'
  const chLabel = primary ? CH_LABEL[primary.channel_type] ?? '—' : '—'
  const trustCls = customer.trust_score >= 85 ? 'hi' : customer.trust_score >= 65 ? 'md' : 'lo'
  const tags = customer.customer_tags?.map(t => t.tag) ?? []
  const realOrders = orders ?? []
  const totalOrders = realOrders.length
  const avgOrder = totalOrders > 0 ? Math.round(customer.ltv / totalOrders) : 0
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
            <button className="pt-btn pt-btn-ghost">Add note</button>
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
              <div className="val mono">${customer.ltv.toLocaleString()}</div>
            </div>
            <div className="pt-cu-stat">
              <div className="lbl">Orders</div>
              <div className="val mono">{totalOrders}</div>
            </div>
            <div className="pt-cu-stat">
              <div className="lbl">Avg order</div>
              <div className="val mono">${avgOrder}</div>
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
                  <div><h3>Order history</h3><p>{totalOrders} total · ${customer.ltv.toLocaleString()} LTV</p></div>
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
                          const itemsSummary = items.map(i => `${i.products?.name ?? '?'} ×${i.qty}`).join(', ') || '—'
                          return (
                            <tr key={o.id}>
                              <td className="mono">
                                <Link href={`/orders/${o.id}`} className="pt-link">#{o.ref_number}</Link>
                              </td>
                              <td>{fmtDate(o.created_at)}</td>
                              <td className="pt-cu-items">{itemsSummary}</td>
                              <td><span className="pt-pay-asset" data-asset={o.payment_asset}>{o.payment_asset}</span></td>
                              <td className="r mono">${o.payment_amount.toLocaleString()}</td>
                              <td><OrderState state={o.status} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              {/* Active cycles */}
              <section className="pt-card">
                <header className="pt-card-hd">
                  <div><h3>Active cycles</h3><p>Inferred from order cadence + product half-life</p></div>
                </header>
                <div className="pt-card-body" style={{ padding: 0 }}>
                  <ul className="pt-cu-cycles">
                    {MOCK_CYCLES.map((cy, i) => (
                      <li key={i} className="pt-cu-cycle">
                        <div className="pt-cu-cycle-prod">{cy.product}</div>
                        <div className="pt-cu-cycle-bar">
                          <div className="pt-cu-cycle-fill" style={{ width: `${cy.progress * 100}%` }} />
                          <span className="pt-cu-cycle-marker" style={{ left: `${cy.progress * 100}%` }} />
                        </div>
                        <div className="pt-cu-cycle-meta mono">
                          wk {Math.round(cy.progress * cy.weeks)}/{cy.weeks} · {cy.start}→{cy.end}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              {/* Notes */}
              <section className="pt-card">
                <header className="pt-card-hd">
                  <div><h3>Notes</h3><p>Internal — never sent to customer</p></div>
                  <button className="pt-link">+ Add note</button>
                </header>
                <div className="pt-card-body" style={{ padding: 0 }}>
                  <ul className="pt-cu-notes">
                    {notes && notes.length > 0 ? notes.map(n => (
                      <li key={n.id}>
                        <div className="pt-cu-note-at mono">{fmtDate(n.created_at)}</div>
                        <div className="pt-cu-note-text">{n.content}</div>
                      </li>
                    )) : (
                      <li style={{ padding: '12px 14px', color: 'var(--pt-fg-4)', fontSize: 12 }}>No notes yet</li>
                    )}
                  </ul>
                </div>
              </section>

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
