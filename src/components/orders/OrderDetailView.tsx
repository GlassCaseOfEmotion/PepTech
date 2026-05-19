'use client'

import { useState, useTransition, useRef, Fragment } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { updateOrderStatus, saveOrderNotes, confirmPayment, packOrder } from '@/app/orders/actions'
import { buildPaymentMessage } from '@/lib/payments'
import { PAYMENT_LABELS, PAYMENT_BADGE } from '@/types/payments'
import type { TenantPaymentConfig } from '@/types/payments'
import type { DbOrderRow, DbOrderEvent, OrderStatus, OrderAttachment } from '@/types/orders'
import { SendInvoiceModal } from './SendInvoiceModal'
import { AttachmentsCard } from './AttachmentsCard'
import { ShipOrderModal } from './ShipOrderModal'
import { formatAmount } from '@/lib/currency'

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
const ADVANCE_LABELS: Partial<Record<OrderStatus, string>> = {
  confirming: 'Confirm Payment',
  packing: 'Pack Order',
  shipped: 'Mark as Shipped',
  delivered: 'Mark as Delivered',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function OrderDetailView({ order, events, chatExcerpt, paymentConfigs, customerStats, invoice, attachments, attachmentSignedUrls }: {
  order: DbOrderRow
  events: DbOrderEvent[]
  chatExcerpt: { id: string; direction: string; content: string; sent_at: string }[]
  paymentConfigs: TenantPaymentConfig[]
  customerStats?: { orderCount: number; lastOrderAt: string | null }
  invoice: { id: string; invoice_number: string; pdf_path: string; signedUrl: string } | null
  attachments: OrderAttachment[]
  attachmentSignedUrls: Record<string, string>
}) {
  const [status, setStatus] = useState(order.status)
  const [notes, setNotes] = useState(order.notes ?? '')
  const [notesError, setNotesError] = useState('')
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [pending, startTransition] = useTransition()
  const savingRef = useRef(false)
  const router = useRouter()
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [packError, setPackError] = useState('')
  const [confirmAsset, setConfirmAsset] = useState('')
  const [txHash, setTxHash] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [showShipModal, setShowShipModal] = useState(false)

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
    if (nextStatus === 'packing') {
      setPackError('')
      startTransition(async () => {
        const result = await packOrder(order.id)
        if ('error' in result) {
          setPackError(result.error)
          return
        }
        setStatus('packing')
        router.refresh()
      })
      return
    }
    const prevStatus = status
    startTransition(async () => {
      setStatus(nextStatus)
      const result = await updateOrderStatus(order.id, nextStatus)
      if ('error' in result) setStatus(prevStatus)
    })
  }

  const blurNotes = () => {
    if (savingRef.current) return
    savingRef.current = true
    setNotesError('')
    startTransition(async () => {
      const result = await saveOrderNotes(order.id, notes)
      savingRef.current = false
      if ('error' in result) setNotesError('Failed to save notes')
    })
  }

  const sendPaymentDetails = () => {
    const msg = buildPaymentMessage(
      { ref_number: order.ref_number, payment_amount: order.payment_amount, payment_asset: order.payment_asset, payment_address: order.payment_address },
      paymentConfigs,
    )
    if (!msg) return
    const encoded = encodeURIComponent(msg)
    if (order.conversation_id) {
      router.push(`/inbox?conversation=${order.conversation_id}&prefill=${encoded}`)
    } else {
      navigator.clipboard?.writeText(msg)
      alert('Payment details copied to clipboard (no linked conversation).')
    }
  }

  const handleConfirm = () => {
    if (order.payment_asset === 'customer_chooses' && !confirmAsset) {
      setConfirmError('Please select the payment method used'); return
    }
    setConfirmError('')
    startTransition(async () => {
      const result = await confirmPayment(order.id, {
        actualPaymentAsset: order.payment_asset === 'customer_chooses' ? confirmAsset : undefined,
        txHash: txHash || undefined,
      })
      if ('error' in result) { setConfirmError(result.error); return }
      setStatus('confirming')
      setShowConfirmDialog(false)
      setTxHash('')
      setConfirmAsset('')
    })
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
          <button className="pt-btn pt-btn-ghost" onClick={() => setShowInvoiceModal(true)}>
            <Icons.doc size={12} /> Send Invoice
          </button>
          {order.conversation_id && (
            <Link href={`/inbox?conversation=${order.conversation_id}`} className="pt-btn pt-btn-ghost">
              <Icons.send size={12} /> Open Chat
            </Link>
          )}
          {nextStatus && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <button className="pt-btn pt-btn-primary" onClick={() => nextStatus === 'shipped' ? setShowShipModal(true) : advance()} disabled={pending}>
                {ADVANCE_LABELS[nextStatus] ?? `→ ${STATUS_LABELS[nextStatus]}`}
              </button>
              {packError && (
                <span style={{ fontSize: 11, color: 'var(--pt-danger)' }}>{packError}</span>
              )}
            </div>
          )}
          <button className="pt-btn pt-btn-ghost"><Icons.more size={14} /></button>
        </div>
      </div>
      {showInvoiceModal && (
        <SendInvoiceModal order={order} onClose={() => setShowInvoiceModal(false)} />
      )}
      {showShipModal && (
        <ShipOrderModal
          orderId={order.id}
          refNumber={order.ref_number}
          onSuccess={() => { setStatus('shipped'); router.refresh() }}
          onClose={() => setShowShipModal(false)}
        />
      )}

      {/* Payment panel — awaiting */}
      {status === 'awaiting' && order.payment_asset !== 'cash' && (
        <div className="pt-od-payment-panel is-awaiting">
          <div className="pt-od-payment-hd">
            <span>Awaiting payment</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={sendPaymentDetails}>
                <Icons.send size={11} /> Send payment details
              </button>
              {order.payment_address && (
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ fontSize: 11 }}
                  onClick={() => navigator.clipboard?.writeText(order.payment_address!)}
                >
                  Copy address
                </button>
              )}
              <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={() => setShowConfirmDialog(true)}>
                Mark as received
              </button>
            </div>
          </div>
          <div className="pt-od-payment-body">
            <span className="pt-od-payment-asset">{PAYMENT_LABELS[order.payment_asset as keyof typeof PAYMENT_LABELS] ?? order.payment_asset}</span>
            {order.payment_address && (
              <span className="pt-od-payment-addr mono">{order.payment_address}</span>
            )}
            {order.payment_asset === 'customer_chooses' && (
              <span style={{ fontSize: 11, color: 'var(--pt-fg-4)' }}>All configured methods offered</span>
            )}
            {order.exchange_rate && (
              <span style={{ fontSize: 11, color: 'var(--pt-fg-4)' }}>
                rate: 1 {PAYMENT_BADGE[order.payment_asset]?.key?.toUpperCase() ?? order.payment_asset} = {formatAmount(order.exchange_rate, order.currency ?? 'USD')}
              </span>
            )}
          </div>
          {showConfirmDialog && (
            <div className="pt-od-confirm-dialog">
              {order.payment_asset === 'customer_chooses' && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: 'var(--pt-fg-3)', display: 'block', marginBottom: 4 }}>
                    Which method did they use?
                  </label>
                  <select className="pt-input" style={{ fontSize: 12 }} value={confirmAsset} onChange={e => setConfirmAsset(e.target.value)}>
                    <option value="">Select…</option>
                    {paymentConfigs.filter(c => c.type !== 'cash' && c.type !== 'customer_chooses').map(c => (
                      <option key={c.type} value={c.type}>{PAYMENT_LABELS[c.type as keyof typeof PAYMENT_LABELS] ?? c.type}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: 'var(--pt-fg-3)', display: 'block', marginBottom: 4 }}>
                  Transaction ID (optional — paste from your wallet or block explorer)
                </label>
                <input
                  className="pt-input mono"
                  style={{ fontSize: 11 }}
                  placeholder="Leave blank if unavailable"
                  value={txHash}
                  onChange={e => setTxHash(e.target.value)}
                />
              </div>
              {confirmError && <p style={{ fontSize: 11, color: 'var(--pt-danger)', marginBottom: 8 }}>{confirmError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={handleConfirm} disabled={pending}>
                  Confirm payment received
                </button>
                <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => { setShowConfirmDialog(false); setConfirmError('') }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Payment panel — confirmed with tx hash */}
      {status !== 'awaiting' && order.tx_hash && (
        <div className="pt-od-payment-panel is-confirmed">
          <div className="pt-od-payment-hd"><span>Payment confirmed</span></div>
          <div className="pt-od-payment-body">
            <span className="pt-od-payment-asset">{PAYMENT_LABELS[order.payment_asset as keyof typeof PAYMENT_LABELS] ?? order.payment_asset}</span>
            <span className="pt-od-payment-addr mono" title={order.tx_hash}>{order.tx_hash.slice(0, 24)}…</span>
            <button className="pt-btn pt-btn-ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => navigator.clipboard?.writeText(order.tx_hash!)}>Copy TX</button>
          </div>
        </div>
      )}

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
                      <td className="pt-od-num mono">{formatAmount(it.unit_price_snapshot, order.currency ?? 'USD')}</td>
                      <td className="pt-od-num mono">{formatAmount(it.qty * it.unit_price_snapshot, order.currency ?? 'USD')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5} /><td className="pt-od-num">Subtotal</td><td className="pt-od-num mono">{formatAmount(total, order.currency ?? 'USD')}</td></tr>
                  <tr><td colSpan={5} /><td className="pt-od-num">Shipping</td><td className="pt-od-num mono">{formatAmount(0, order.currency ?? 'USD')}</td></tr>
                  <tr className="pt-od-total"><td colSpan={5} /><td className="pt-od-num">Total</td><td className="pt-od-num mono">{formatAmount(total, order.currency ?? 'USD')}</td></tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Payment */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div>
                <h3>Payment</h3>
                <p>{order.payment_asset === 'cash' ? 'Cash on delivery' : PAYMENT_LABELS[order.payment_asset as keyof typeof PAYMENT_LABELS] ?? order.payment_asset}</p>
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
                    <span className="pt-pay-asset" data-asset={PAYMENT_BADGE[order.payment_asset]?.key ?? 'other'}>
                      {PAYMENT_BADGE[order.payment_asset]?.label ?? order.payment_asset}
                    </span>
                    <span className="mono" style={{ marginLeft: 8 }}>{formatAmount(order.payment_amount, order.currency ?? 'USD')}</span>
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
                    {order.tracking_number && (
                      order.tracking_url
                        ? <> · <a href={order.tracking_url} target="_blank" rel="noreferrer noopener" className="mono" style={{ color: 'inherit' }}>{order.tracking_number} ↗</a></>
                        : <> · <span className="mono">{order.tracking_number}</span></>
                    )}
                    {!order.tracking_number && order.tracking_url && (
                      <> · <a href={order.tracking_url} target="_blank" rel="noreferrer noopener" style={{ fontSize: 12 }}>Track ↗</a></>
                    )}
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
              {notesError && (
                <div style={{ fontSize: 11, color: 'var(--pt-danger)', marginTop: 4 }}>{notesError}</div>
              )}
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
                    {order.customers.display_name
                      .split(' ')
                      .map(w => w[0]?.toUpperCase() ?? '')
                      .filter(Boolean)
                      .slice(0, 2)
                      .join('') || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pt-cust-name">{order.customers.display_name}</div>
                    <div className="pt-cust-handle mono">{primaryChannel?.display_handle ?? ''}</div>
                  </div>
                  <div className={`pt-trust-pill pt-trust-${trustCls}`}>{trust}</div>
                </div>
                <div className="pt-od-cust-stats">
                  <div><span className="pt-od-stat-lbl">LTV</span><span className="mono">{formatAmount(order.customers.ltv, order.currency ?? 'USD')}</span></div>
                  {customerStats && <>
                    <div><span className="pt-od-stat-lbl">ORDERS</span><span className="mono">{customerStats.orderCount}</span></div>
                    <div><span className="pt-od-stat-lbl">LAST</span><span className="mono">{customerStats.lastOrderAt ? `${Math.floor((Date.now() - new Date(customerStats.lastOrderAt).getTime()) / 86_400_000)}d` : '—'}</span></div>
                  </>}
                </div>
              </div>
            </section>
          )}

          {/* Attachments */}
          <AttachmentsCard
            orderId={order.id}
            conversationId={order.conversation_id ?? null}
            invoice={invoice}
            initialAttachments={attachments}
            attachmentSignedUrls={attachmentSignedUrls}
          />

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
