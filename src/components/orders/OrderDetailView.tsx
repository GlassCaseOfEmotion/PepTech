'use client'

import { useState, useTransition, Fragment } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { updateOrderStatus, saveOrderNotes } from '@/app/orders/actions'
import type { DbOrderRow, DbOrderEvent, OrderStatus } from '@/types/orders'

const CH_MAP: Record<string, 'wa' | 'tg' | 'em'> = { whatsapp: 'wa', telegram: 'tg', email: 'em' }
const CH_NAMES: Record<string, string> = { wa: 'WhatsApp', tg: 'Telegram', em: 'Email' }
const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

const STATUS_ORDER: OrderStatus[] = ['awaiting', 'confirming', 'packing', 'shipped', 'delivered']
const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting: 'Awaiting payment', confirming: 'Confirming',
  packing: 'Packing', shipped: 'Shipped', delivered: 'Delivered',
}
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  awaiting: 'confirming', confirming: 'packing',
  packing: 'shipped', shipped: 'delivered',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function OrderDetailView({ order, events, chatExcerpt }: {
  order: DbOrderRow
  events: DbOrderEvent[]
  chatExcerpt: { id: string; direction: string; content: string; sent_at: string }[]
}) {
  const [status, setStatus] = useState(order.status)
  const [notes, setNotes] = useState(order.notes ?? '')
  const [pending, startTransition] = useTransition()

  const primaryChannel = order.customers?.customer_channels?.find(c => c.is_primary)
    ?? order.customers?.customer_channels?.[0]
  const channel = CH_MAP[primaryChannel?.channel_type ?? 'whatsapp'] ?? 'wa'
  const ChIcon = CH_ICONS[channel]
  const currentIdx = STATUS_ORDER.indexOf(status)
  const nextStatus = NEXT_STATUS[status]

  const total = order.order_items.reduce((s, it) => s + it.qty * it.unit_price_snapshot, 0)
  const trust = order.customers?.trust_score ?? 0
  const trustCls = trust >= 85 ? 'hi' : trust >= 65 ? 'md' : 'lo'

  const advance = () => {
    if (!nextStatus) return
    startTransition(async () => {
      setStatus(nextStatus)
      const result = await updateOrderStatus(order.id, nextStatus)
      if ('error' in result) setStatus(status)
    })
  }

  const blurNotes = () => {
    startTransition(async () => { await saveOrderNotes(order.id, notes) })
  }

  return (
    <div className="pt-od">
      {/* Header */}
      <div className="pt-od-hd">
        <Link href="/orders" className="pt-btn pt-btn-ghost" style={{ flexShrink: 0 }}>← Orders</Link>
        <div className="pt-od-hd-mid">
          <div className="pt-od-hd-title">
            <h1 className="mono">#{order.ref_number}</h1>
            <span className={`pt-od-state-pill pt-od-state-${status}`}>
              <span className={`pt-or-col-dot pt-or-dot-${status}`} />
              {STATUS_LABELS[status]}
            </span>
            <span className="pt-od-channel">
              {ChIcon && <ChIcon size={11} />} {CH_NAMES[channel]}
            </span>
          </div>
          <p>
            {order.customers?.display_name ?? 'Unknown'} · placed {fmtDate(order.created_at)} · {order.order_items.length} item{order.order_items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="pt-od-hd-actions">
          {order.conversation_id && (
            <Link href="/inbox" className="pt-btn pt-btn-ghost">
              <Icons.send size={12} /> Message
            </Link>
          )}
          {nextStatus && (
            <button className="pt-btn pt-btn-primary" onClick={advance} disabled={pending}>
              → {STATUS_LABELS[nextStatus]}
            </button>
          )}
          <button className="pt-btn pt-btn-ghost"><Icons.more size={14} /></button>
        </div>
      </div>

      {/* Stepper */}
      <div className="pt-od-stepper">
        {STATUS_ORDER.map((s, i) => (
          <Fragment key={s}>
            <div className={`pt-od-step ${i < currentIdx ? 'is-done' : ''} ${i === currentIdx ? 'is-active' : ''}`}>
              <span className="pt-od-step-dot">
                {i < currentIdx ? <Icons.check size={10} /> : <span className="mono">{i + 1}</span>}
              </span>
              <span className="pt-od-step-label">{STATUS_LABELS[s]}</span>
            </div>
            {i < STATUS_ORDER.length - 1 && (
              <span className={`pt-od-step-sep ${i < currentIdx ? 'is-done' : ''}`} />
            )}
          </Fragment>
        ))}
      </div>

      {/* Body */}
      <div className="pt-od-body">
        <div className="pt-od-main">
          {/* Line items */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div>
                <h3>Line items</h3>
                <p>{order.order_items.length} SKU{order.order_items.length !== 1 ? 's' : ''} · batch &amp; COA tracked</p>
              </div>
            </header>
            <div className="pt-card-body" style={{ padding: 0 }}>
              <table className="pt-od-items">
                <thead>
                  <tr>
                    <th>SKU</th><th>Item</th><th>Batch</th><th>COA</th>
                    <th className="pt-od-num">Qty</th>
                    <th className="pt-od-num">Unit</th>
                    <th className="pt-od-num">Line</th>
                  </tr>
                </thead>
                <tbody>
                  {order.order_items.map(it => (
                    <tr key={it.id}>
                      <td><span className="mono">{it.products?.sku ?? '—'}</span></td>
                      <td>{it.products?.name ?? '—'}</td>
                      <td><span className="mono">{it.batches?.batch_number ?? '—'}</span></td>
                      <td>
                        {it.batches?.coa_path
                          ? <a className="pt-od-coa" href={`/api/catalog/coa-url?path=${encodeURIComponent(it.batches.coa_path)}`} target="_blank" rel="noopener noreferrer">
                              {it.batches.coa_path.split('/').pop()}
                            </a>
                          : <span style={{ color: 'var(--pt-fg-4)' }}>—</span>}
                      </td>
                      <td className="pt-od-num mono">{it.qty}</td>
                      <td className="pt-od-num mono">${it.unit_price_snapshot.toFixed(2)}</td>
                      <td className="pt-od-num mono">${(it.qty * it.unit_price_snapshot).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5} /><td className="pt-od-num">Subtotal</td><td className="pt-od-num mono">${total.toFixed(2)}</td></tr>
                  <tr><td colSpan={5} /><td className="pt-od-num">Shipping</td><td className="pt-od-num mono">$0.00</td></tr>
                  <tr className="pt-od-total"><td colSpan={5} /><td className="pt-od-num">Total</td><td className="pt-od-num mono">${total.toFixed(2)}</td></tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Payment */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div>
                <h3>Payment</h3>
                <p>{order.payment_asset === 'Cash' ? 'Cash on delivery' : `${order.payment_asset} · on-chain`}</p>
              </div>
              <span className={`pt-od-pay-status pt-od-pay-${status}`}>
                {status === 'awaiting' ? 'Awaiting' : status === 'confirming' ? 'Confirming' : 'Settled'}
              </span>
            </header>
            <div className="pt-card-body">
              <div className="pt-od-pay-grid">
                <div>
                  <div className="pt-od-pay-lbl">Asset</div>
                  <div className="pt-od-pay-val">
                    <span className="pt-pay-asset" data-asset={order.payment_asset}>{order.payment_asset}</span>
                    <span className="mono" style={{ marginLeft: 8 }}>${order.payment_amount.toFixed(2)}</span>
                  </div>
                </div>
                {order.payment_address && (
                  <div>
                    <div className="pt-od-pay-lbl">Receiving address</div>
                    <div className="pt-od-pay-val mono">{order.payment_address}</div>
                  </div>
                )}
                {order.tx_hash && (
                  <div>
                    <div className="pt-od-pay-lbl">Tx hash</div>
                    <div className="pt-od-pay-val mono">{order.tx_hash}</div>
                  </div>
                )}
                <div>
                  <div className="pt-od-pay-lbl">Reference</div>
                  <div className="pt-od-pay-val mono">PT-{order.ref_number}</div>
                </div>
              </div>
            </div>
          </section>

          {/* Shipping */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div>
                <h3>Shipping</h3>
                <p>
                  {status === 'awaiting' || status === 'confirming'
                    ? 'Will pack once payment confirms'
                    : status === 'packing' ? 'Packing'
                    : status === 'shipped' ? `In transit · ${order.carrier ?? ''}`.trim()
                    : 'Delivered'}
                </p>
              </div>
            </header>
            <div className="pt-card-body">
              <div className="pt-od-ship-grid">
                <div>
                  <div className="pt-od-pay-lbl">Address</div>
                  <div className="pt-od-pay-val">
                    {order.shipping_address ? (
                      <>
                        {order.shipping_address.ln1}<br />
                        {order.shipping_address.ln2 && <>{order.shipping_address.ln2}<br /></>}
                        {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}
                      </>
                    ) : <span style={{ color: 'var(--pt-fg-4)' }}>Not set</span>}
                  </div>
                </div>
                <div>
                  <div className="pt-od-pay-lbl">Carrier</div>
                  <div className="pt-od-pay-val">
                    {order.carrier ?? '—'}
                    {order.tracking_number && <> · <span className="mono">{order.tracking_number}</span></>}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div><h3>Notes</h3><p>Operator-only · not shown to customer</p></div>
            </header>
            <div className="pt-card-body">
              <textarea
                className="pt-od-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={blurNotes}
                placeholder="Add internal notes…"
              />
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside className="pt-od-rail">
          {/* Customer */}
          {order.customers && (
            <section className="pt-card">
              <header className="pt-card-hd">
                <div><h3>Customer</h3></div>
                <Link href={`/customers/${order.customers.id}`} className="pt-iconbtn" title="Open customer">
                  <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}><Icons.arrowUp size={14} /></span>
                </Link>
              </header>
              <div className="pt-card-body">
                <div className="pt-cust-id">
                  <div className="pt-thread-av" data-channel={channel} style={{ width: 36, height: 36, fontSize: 11 }}>
                    {(order.customers.display_name.match(/[A-Z]/g) ?? [order.customers.display_name[0] ?? '?']).slice(0, 2).join('')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pt-cust-name">{order.customers.display_name}</div>
                    <div className="pt-cust-handle mono">{primaryChannel?.display_handle ?? ''}</div>
                  </div>
                  <div className={`pt-trust-pill pt-trust-${trustCls}`}>{trust}</div>
                </div>
                <div className="pt-od-cust-stats">
                  <div><span className="pt-od-stat-lbl">LTV</span><span className="mono">${order.customers.ltv.toLocaleString()}</span></div>
                </div>
              </div>
            </section>
          )}

          {/* Activity timeline */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div><h3>Activity</h3><p>{events.length} event{events.length !== 1 ? 's' : ''}</p></div>
            </header>
            <div className="pt-card-body" style={{ padding: '8px 0 14px' }}>
              <ol className="pt-od-tl">
                {events.map(e => (
                  <li key={e.id} className={`pt-od-tl-i pt-od-tl-${e.actor}`}>
                    <span className="pt-od-tl-bullet" />
                    <div className="pt-od-tl-body">
                      <div className="pt-od-tl-row">
                        <span className="pt-od-tl-action">{e.action}</span>
                        <span className="pt-od-tl-time mono">{fmtTime(e.created_at)}</span>
                      </div>
                      {e.note && <div className="pt-od-tl-note">{e.note}</div>}
                      <div className="pt-od-tl-date">{fmtDate(e.created_at)}</div>
                    </div>
                  </li>
                ))}
                {events.length === 0 && (
                  <li style={{ padding: '0 14px', fontSize: 12, color: 'var(--pt-fg-4)' }}>No events yet</li>
                )}
              </ol>
            </div>
          </section>

          {/* Chat excerpt */}
          {chatExcerpt.length > 0 && (
            <section className="pt-card">
              <header className="pt-card-hd">
                <div><h3>Where this came from</h3><p>Excerpt from {CH_NAMES[channel]} thread</p></div>
                <Link href="/inbox" className="pt-iconbtn" title="Open thread">
                  <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}><Icons.arrowUp size={14} /></span>
                </Link>
              </header>
              <div className="pt-card-body">
                <div className="pt-od-chat">
                  {chatExcerpt.map(m => (
                    <div key={m.id} className={`pt-od-msg pt-od-msg-${m.direction === 'outbound' ? 'me' : 'them'}`}>
                      <div className="pt-od-msg-bubble">{m.content}</div>
                      <div className="pt-od-msg-time">{fmtTime(m.sent_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
