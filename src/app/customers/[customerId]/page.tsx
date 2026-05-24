import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { Icons } from '@/lib/icons'
import { CustomerNewOrderButton, CustomerOrderEmptyState } from '@/components/customers/CustomerNewOrderButton'
import { CustomerNoteCard, AddNoteHeaderButton } from '@/components/customers/CustomerNoteCard'
import { CustomerTagsField, AddTagHeaderButton } from '@/components/customers/CustomerTagsField'
import { ActiveCyclesCard } from '@/components/customers/ActiveCyclesCard'
import { CustomerDetailBody } from '@/components/customers/CustomerDetailBody'
import { computeSupply } from '@/types/protocols'
import { formatAmount } from '@/lib/currency'
import type { ProductProtocol, CustomerProtocolOverride, CycleEntry } from '@/types/protocols'
import { ConvertToCustomerButton } from '@/components/contacts/ConvertToCustomerButton'
import { AcquisitionSourceCard } from '@/components/contacts/AcquisitionSourceCard'
import type { AcquisitionSource } from '@/app/contacts/actions'

const CH_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'Email' }
const CH_KEY: Record<string, string> = { whatsapp: 'wa', telegram: 'tg', email: 'em' }

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0]]).join('')
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtActivityDate(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return `today ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays < 7) return `${diffDays}d ago`
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) })
}

const PAY_BADGE: Record<string, { label: string; key: string }> = {
  usdt_trc20:       { label: 'USDT',  key: 'usdt'  },
  btc:              { label: 'BTC',   key: 'btc'   },
  eth:              { label: 'ETH',   key: 'eth'   },
  usdc_erc20:       { label: 'USDC',  key: 'usdc'  },
  ltc:              { label: 'LTC',   key: 'ltc'   },
  xmr:              { label: 'XMR',   key: 'xmr'   },
  bank_transfer:    { label: 'Bank',  key: 'bank'  },
  cash:             { label: 'Cash',  key: 'cash'  },
  USDT:             { label: 'USDT',  key: 'usdt'  },
  BTC:              { label: 'BTC',   key: 'btc'   },
  Cash:             { label: 'Cash',  key: 'cash'  },
  Other:            { label: 'Other', key: 'other' },
}

// ─── Mock data for sections not yet backed by the DB ────────────────────────


type ActivityItem = {
  id: string
  source: 'order' | 'tag' | 'note'
  label: string
  ref_number: string | null
  amount: number | null
  note: string | null
  created_at: string
}

function actBullet(item: ActivityItem) {
  if (item.source !== 'order') return ''
  const l = item.label.toLowerCase()
  if (l.includes('ship') || l.includes('deliver') || l.includes('creat') || l.includes('draft') || l.includes('pack')) return 'cool'
  if (l.includes('confirm')) return 'warn'
  return ''
}

function actDetail(item: ActivityItem, currency: string) {
  if (item.source === 'tag') return item.note ? ` · ${item.note}` : ''
  if (item.source === 'note') return item.note ? ` · ${item.note}` : ''
  const parts: string[] = []
  if (item.ref_number) parts.push(`#${item.ref_number}`)
  if (item.amount != null && (item.label.toLowerCase().includes('creat') || item.label.toLowerCase().includes('draft'))) {
    parts.push(formatAmount(Number(item.amount), currency))
  }
  return parts.length ? ` · ${parts.join(' · ')}` : ''
}

type ShippingAddr = { ln1: string; ln2?: string; city: string; state: string; zip: string }

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
  type AutomationRunRow = {
    id: string
    state: string
    action_summary: string | null
    action_payload: { message?: string } | null
    created_at: string
    automations: { name: string } | null
  }

  const [{ data: customer }, { data: notes }, { data: orders }, { data: tenantRow }, { data: activityRaw }, { data: conversation }, { data: automationRunsRaw }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, display_name, trust_score, ltv, created_at, lifecycle_stage, acquisition_source, acquisition_source_note, referred_by_customer_id, converted_at, customer_channels(channel_type, display_handle, is_primary), customer_tags(tag)')
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
      .select('id, ref_number, status, payment_asset, payment_amount, shipping_address, created_at, delivered_at, order_items(product_id, qty, unit_price_snapshot, products(name))')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('tenants')
      .select('base_currency')
      .single(),
    supabase
      .from('customer_activity')
      .select('id, source, label, ref_number, amount, note, created_at')
      .eq('customer_id', customerId)
      .not('label', 'in', '("Moved to Awaiting payment","Moved to Confirming","Moved to Packing")')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('conversations')
      .select('id')
      .eq('customer_id', customerId)
      .in('status', ['new', 'needs_reply', 'in_progress', 'snoozed'])
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('automation_runs')
      .select('id, state, action_summary, action_payload, created_at, automations(name)')
      .eq('context_ref', customerId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (!customer) redirect('/customers')

  const baseCurrency = (tenantRow?.base_currency as string | null) ?? 'USD'
  const activity = (activityRaw ?? []) as ActivityItem[]
  const automationRuns = (automationRunsRaw ?? []) as AutomationRunRow[]
  const isLead = customer.lifecycle_stage === 'lead'

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

  const latestAddr = realOrders
    .map(o => o.shipping_address as ShippingAddr | null)
    .find(a => a != null) ?? null
  const fmtAddr = latestAddr
    ? [latestAddr.ln1, latestAddr.ln2, `${latestAddr.city}${latestAddr.state ? ', ' + latestAddr.state : ''}${latestAddr.zip ? ' ' + latestAddr.zip : ''}`].filter(Boolean).join(', ')
    : null

  const payMethods = [...new Set(realOrders.map(o => o.payment_asset))]
    .map(a => PAY_BADGE[a]?.label ?? a)

  const deliveredCount = realOrders.filter(o => o.status === 'delivered').length
  const cancelledCount = realOrders.filter(o => o.status === 'cancelled').length
  const accountMonths = customer.created_at
    ? Math.floor((Date.now() - new Date(customer.created_at).getTime()) / (30.44 * 86400_000))
    : 0
  const trustFactors = [
    { label: 'Completed orders',               v: Math.min(deliveredCount, 8), of: 8,  w: 3,  neg: false },
    { label: `Account age (${accountMonths}mo)`, v: Math.min(accountMonths, 6), of: 6,  w: 1,  neg: false },
    { label: 'Payment issues',                 v: tags.includes('payment') ? 1 : 0, of: 0, w: 25, neg: true  },
    { label: 'Cancellations',                  v: Math.min(cancelledCount, 3), of: 3,  w: 5,  neg: true  },
  ]

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
              {/* Mobile hero stats — hidden on desktop via CSS */}
              <div className="pt-cu-hd-mobile-stats">
                {!isLead && (
                  <div className="pt-cu-hd-stat">
                    <strong>{formatAmount(customer.ltv, baseCurrency)}</strong>
                    <span>LTV</span>
                  </div>
                )}
                <div className="pt-cu-hd-stat">
                  <strong>{orders?.length ?? 0}</strong>
                  <span>Orders</span>
                </div>
                <div className="pt-cu-hd-stat">
                  <strong>{orders?.[0] ? new Date(orders[0].created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</strong>
                  <span>Last order</span>
                </div>
              </div>
            </div>
            {/* Trust pill — hidden on desktop via CSS, shown mobile top-right */}
            {!isLead && (
              <div className="pt-cu-hd-trust-pill">
                <div className="pt-cu-hd-trust-num">{customer.trust_score}</div>
                <div className="pt-cu-hd-trust-lbl">Trust</div>
              </div>
            )}
          </div>
          <div className="pt-cu-hd-actions">
            <AddNoteHeaderButton />
            <AddTagHeaderButton />
            <Link
              href={conversation ? `/inbox?conversation=${conversation.id}` : '/inbox'}
              className="pt-btn pt-btn-ghost"
            >
              <ChIcon size={12} /> Message
            </Link>
            <CustomerNewOrderButton customerId={customer.id} customerName={customer.display_name} />
            {isLead && (
              <ConvertToCustomerButton customerId={customer.id} currentStage="lead" />
            )}
          </div>
        </div>

        <div className="pt-cu-body">

          {/* ── Stats strip ── */}
          <div className="pt-cu-strip">
            {!isLead && (
              <div className="pt-cu-stat">
                <div className="lbl">LTV</div>
                <div className="val mono">{formatAmount(customer.ltv, baseCurrency)}</div>
              </div>
            )}
            <div className="pt-cu-stat">
              <div className="lbl">Orders</div>
              <div className="val mono">{totalOrders}</div>
            </div>
            {!isLead && (
              <div className="pt-cu-stat">
                <div className="lbl">Avg order</div>
                <div className="val mono">{formatAmount(avgOrder, baseCurrency)}</div>
              </div>
            )}
            <div className="pt-cu-stat">
              <div className="lbl">Last order</div>
              <div className="val">{lastOrderDate}</div>
            </div>
            <div className="pt-cu-stat">
              <div className="lbl">Channel</div>
              <div className="val pt-cu-stat-ch"><ChIcon size={11} /> {chLabel}</div>
            </div>
            {!isLead && (
              <div className={`pt-cu-stat pt-cu-trust pt-trust-${trustCls}`}>
                <div className="lbl">Trust</div>
                <div className="val mono">{customer.trust_score}<span>/100</span></div>
              </div>
            )}
          </div>

          {isLead && (
            <AcquisitionSourceCard
              customerId={customer.id}
              initialSource={(customer.acquisition_source as AcquisitionSource | null) ?? null}
              initialNote={(customer.acquisition_source_note as string | null) ?? null}
              initialReferredBy={(customer.referred_by_customer_id as string | null) ?? null}
            />
          )}

          <CustomerDetailBody
            orders={
              <section className="pt-card">
                <header className="pt-card-hd">
                  <div><h3>Order history</h3><p>{totalOrders} total · {formatAmount(customer.ltv, baseCurrency)} LTV</p></div>
                </header>
                <div className="pt-card-body" style={{ padding: 0 }}>
                  {realOrders.length === 0 ? (
                    <div style={{ padding: '8px 0' }}>
                      <CustomerOrderEmptyState customerId={customer.id} customerName={customer.display_name} />
                    </div>
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
            }
            cycles={isLead ? undefined : <ActiveCyclesCard cycles={cycles} customerId={customer.id} />}
            notes={<CustomerNoteCard customerId={customer.id} initialNotes={notes ?? []} />}
            trust={isLead ? undefined : (
              <section className="pt-card">
                <header className="pt-card-hd">
                  <div><h3>Trust score</h3><p>Starts at 70 · grows with history</p></div>
                  <div className={`pt-trust pt-trust-${trustCls}`}>
                    <div className="pt-trust-num">{customer.trust_score}</div>
                    <div className="pt-trust-lbl">TRUST</div>
                  </div>
                </header>
                <div className="pt-card-body" style={{ padding: 0 }}>
                  <ul className="pt-cu-factors">
                    {trustFactors.map((f, i) => {
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
            )}
            details={
              <>
                <section className="pt-card">
                  <header className="pt-card-hd"><div><h3>Details</h3></div></header>
                  <div className="pt-card-body" style={{ padding: 0 }}>
                    <dl className="pt-cu-dl">
                      <dt>Tags</dt>
                      <CustomerTagsField customerId={customer.id} initialTags={tags} />
                      <dt>Address</dt>
                      <dd>{fmtAddr ?? <span style={{ color: 'var(--pt-fg-4)', fontSize: 12 }}>None on file</span>}</dd>
                      <dt>Pay methods</dt>
                      <dd>
                        {payMethods.length > 0
                          ? <ul className="pt-cu-pay-list">{payMethods.map(p => <li key={p} className="mono">{p}</li>)}</ul>
                          : <span style={{ color: 'var(--pt-fg-4)', fontSize: 12 }}>None</span>}
                      </dd>
                      <dt>Joined</dt>
                      <dd>{joined}</dd>
                    </dl>
                  </div>
                </section>
                {!isLead && (
                  <AcquisitionSourceCard
                    customerId={customer.id}
                    initialSource={(customer.acquisition_source as AcquisitionSource | null) ?? null}
                    initialNote={(customer.acquisition_source_note as string | null) ?? null}
                    initialReferredBy={(customer.referred_by_customer_id as string | null) ?? null}
                  />
                )}
              </>
            }
            activity={
              <section className="pt-card">
                <header className="pt-card-hd"><div><h3>Activity</h3><p>Recent events</p></div></header>
                <div className="pt-card-body" style={{ padding: 0 }}>
                  {activity.length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--pt-fg-4)' }}>No activity yet</div>
                  ) : (
                    <ul className="pt-cu-act">
                      {activity.slice(0, 5).map(a => {
                        const bullet = actBullet(a)
                        return (
                          <li key={a.id}>
                            <i className={`pt-cu-act-dot${bullet ? ` pt-bul-${bullet}` : ''}`} />
                            <span className="pt-cu-act-text"><b>{a.label}</b>{actDetail(a, baseCurrency)} · <span className="pt-cu-act-time">{fmtActivityDate(a.created_at)}</span></span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </section>
            }
            automations={
              <section className="pt-card">
                <header className="pt-card-hd">
                  <div>
                    <h3>Automations</h3>
                    <p>{automationRuns.length} run{automationRuns.length !== 1 ? 's' : ''}</p>
                  </div>
                </header>
                <div className="pt-card-body" style={{ padding: 0 }}>
                  {automationRuns.length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--pt-fg-4)' }}>No automation runs yet</div>
                  ) : (
                    <ul className="pt-cu-act">
                      {automationRuns.map(r => {
                        const dotCls = r.state === 'ok' ? ' pt-bul-cool' : r.state === 'queued' ? ' pt-bul-warn' : r.state === 'err' ? ' pt-bul-warn' : ''
                        const stateLabel = r.state === 'ok' ? 'sent' : r.state === 'queued' ? 'queued' : r.state === 'skip' ? 'skipped' : r.state === 'err' ? 'failed' : r.state
                        const msg = r.action_payload?.message
                        return (
                          <li key={r.id}>
                            <i className={`pt-cu-act-dot${dotCls}`} />
                            <span className="pt-cu-act-text">
                              <b>{r.automations?.name ?? 'Automation'}</b>
                              {' · '}
                              <span className="pt-cu-act-time">{stateLabel}</span>
                              {msg && (
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  &ldquo;{msg}&rdquo;
                                </span>
                              )}
                              {' · '}
                              <span className="pt-cu-act-time">{fmtActivityDate(r.created_at)}</span>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </section>
            }
          />
        </div>
      </div>
    </Shell>
  )
}
