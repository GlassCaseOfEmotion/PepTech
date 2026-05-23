'use client'

import { useState, useTransition, useRef, useEffect, Fragment } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { updateOrderStatus, saveOrderNotes, confirmPayment, packOrder, sendOrderPaymentDetails, setOrderPaymentMethod } from '@/app/orders/actions'
import { PAYMENT_LABELS, PAYMENT_BADGE } from '@/types/payments'
import type { TenantPaymentConfig } from '@/types/payments'
import type { DbOrderRow, DbOrderEvent, OrderStatus, OrderAttachment } from '@/types/orders'
import { SendInvoiceModal } from './SendInvoiceModal'
import { AttachmentsCard } from './AttachmentsCard'
import { ShipOrderModal } from './ShipOrderModal'
import { EditOrderModal } from './EditOrderModal'
import { formatAmount } from '@/lib/currency'
import { CRYPTO_ASSETS, buildPaymentMessage } from '@/lib/payments'

const CH_MAP: Record<string, 'wa' | 'tg' | 'em'> = { whatsapp: 'wa', telegram: 'tg', email: 'em' }
const CH_NAMES: Record<string, string> = { wa: 'WhatsApp', tg: 'Telegram', em: 'Email' }
const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

const STATUS_ORDER: OrderStatus[] = ['created', 'awaiting', 'confirming', 'packing', 'shipped', 'delivered']
const STATUS_LABELS: Record<OrderStatus, string> = {
  created: 'Order created',
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

export function OrderDetailView({
  order, events, chatExcerpt, paymentConfigs, customerStats,
  invoice, attachments, attachmentSignedUrls, attachmentThumbnailUrls,
  cryptoPaymentLink,
}: {
  order: DbOrderRow
  events: DbOrderEvent[]
  chatExcerpt: { id: string; direction: string; content: string; sent_at: string }[]
  paymentConfigs: TenantPaymentConfig[]
  customerStats?: { orderCount: number; lastOrderAt: string | null }
  invoice: { id: string; invoice_number: string; pdf_path: string; signedUrl: string } | null
  attachments: OrderAttachment[]
  attachmentSignedUrls: Record<string, string>
  attachmentThumbnailUrls: Record<string, string>
  cryptoPaymentLink: {
    id: string
    status: string
    hosted_url: string
    pay_currency: string | null
    amount_usd: number
  } | null
  customerName?: string
}) {
  const [status, setStatus] = useState(order.status)
  const [notes, setNotes] = useState(order.notes ?? '')
  const [notesError, setNotesError] = useState('')
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [currentInvoice, setCurrentInvoice] = useState(invoice)

  async function handleInvoiceGenerated(pdfPath: string, invoiceNumber: string) {
    const res = await fetch(`/api/invoices/preview?path=${encodeURIComponent(pdfPath)}`)
    if (!res.ok) return
    const { url } = await res.json() as { url: string }
    setCurrentInvoice({ id: '', invoice_number: invoiceNumber, pdf_path: pdfPath, signedUrl: url })
  }
  const [pending, startTransition] = useTransition()
  const savingRef = useRef(false)
  const router = useRouter()
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [packError, setPackError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [showShipModal, setShowShipModal] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const [sendState, setSendState] = useState<'idle' | 'confirming' | 'sending' | 'sent' | 'error'>('idle')
  const [sentConvId, setSentConvId] = useState<string | null>(null)
  const [sendError, setSendError] = useState('')
  const [selectedAsset, setSelectedAsset] = useState<string | null>(order.payment_asset ?? null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

  const showCryptoLinkField = CRYPTO_ASSETS.has(order.payment_asset ?? '')

  async function handleSendPaymentDetails() {
    setSendState('sending')
    setSendError('')
    const checkoutUrl = selectedAsset && CRYPTO_ASSETS.has(selectedAsset) && cryptoPaymentLink ? cryptoPaymentLink.hosted_url : undefined
    const result = await sendOrderPaymentDetails(order.id, checkoutUrl)
      .catch(e => ({ error: e instanceof Error ? e.message : 'Unknown error' }))
    if ('error' in result) {
      setSendError(result.error)
      setSendState('error')
    } else {
      setSentConvId(result.conversationId)
      setSendState('sent')
      router.refresh()
    }
  }

  const handleConfirm = () => {
    setConfirmError('')
    startTransition(async () => {
      const result = await confirmPayment(order.id, {
        txHash: txHash || undefined,
      })
      if ('error' in result) { setConfirmError(result.error); return }
      setStatus('confirming')
      setShowConfirmDialog(false)
      setTxHash('')
    })
  }

  function handleAssetChange(asset: string) {
    setSelectedAsset(asset)
    setOrderPaymentMethod(order.id, asset).catch(() => {})
  }

  const previewMessage: string = (() => {
    if (!selectedAsset) return ''
    if (selectedAsset === 'cash') return 'Cash payment — no message will be sent. The order will move to awaiting payment.'
    return buildPaymentMessage(
      {
        ref_number: order.ref_number,
        payment_amount: order.payment_amount,
        payment_asset: selectedAsset,
        payment_address: paymentConfigs.find(c => c.type === selectedAsset)?.wallet_address ?? null,
      },
      paymentConfigs,
      CRYPTO_ASSETS.has(selectedAsset) && cryptoPaymentLink
        ? cryptoPaymentLink.hosted_url
        : undefined,
    )
  })()

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
          <div ref={moreMenuRef} style={{ position: 'relative' }}>
            <button className="pt-btn pt-btn-ghost" onClick={() => setShowMoreMenu(v => !v)}>
              <Icons.more size={14} />
            </button>
            {showMoreMenu && (
              <div className="pt-od-more-menu">
                <button onClick={() => { setShowMoreMenu(false); setShowEditModal(true) }}>
                  Edit order
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {showInvoiceModal && (
        <SendInvoiceModal order={order} onClose={() => setShowInvoiceModal(false)} onGenerated={handleInvoiceGenerated} />
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {sendState === 'idle' && (
                <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={handleSendPaymentDetails}>
                  <Icons.send size={11} /> Send payment details
                </button>
              )}
              {sendState === 'sending' && (
                <span style={{ fontSize: 11, color: 'var(--pt-fg-3)' }}>Sending…</span>
              )}
              {sendState === 'sent' && (
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ fontSize: 11, color: 'var(--pt-ok)' }}
                  onClick={() => sentConvId ? router.push(`/inbox?conversation=${sentConvId}`) : router.push('/inbox')}
                >
                  Sent · Go to chat →
                </button>
              )}
              {sendState === 'error' && (
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ fontSize: 11, color: 'var(--pt-danger)' }}
                  onClick={() => setSendState('idle')}
                  title={sendError}
                >
                  Failed · Retry
                </button>
              )}
              <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={() => setShowConfirmDialog(true)}>
                Mark as received
              </button>
            </div>
          </div>

          {showConfirmDialog && (
            <div className="pt-od-confirm-dialog">
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: 'var(--pt-fg-3)', display: 'block', marginBottom: 4 }}>
                  Transaction ID (optional)
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
      {/* Payment panel — created status (payment setup step) */}
      {status === 'created' && (
        <div className="pt-od-payment-panel is-setup">
          <div className="pt-od-payment-hd">
            <span>Payment setup</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0 4px' }}>

            {/* Method dropdown — autosaves on change */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--pt-fg-3)', width: 80, flexShrink: 0 }}>Method</span>
              <select
                className="pt-input"
                style={{ fontSize: 12, flex: 1, maxWidth: 200 }}
                value={selectedAsset ?? ''}
                onChange={e => handleAssetChange(e.target.value)}
              >
                <option value="" disabled>Select method…</option>
                <option value="cash">Cash</option>
                {paymentConfigs
                  .filter(c => c.is_active && c.type !== 'cash')
                  .map(c => (
                    <option key={c.type} value={c.type}>
                      {PAYMENT_LABELS[c.type as keyof typeof PAYMENT_LABELS] ?? c.type}
                    </option>
                  ))}
              </select>
            </div>

            {/* Crypto link row — only when a crypto asset is selected */}
            {selectedAsset !== null && CRYPTO_ASSETS.has(selectedAsset) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--pt-fg-3)', width: 80, flexShrink: 0 }}>Crypto link</span>
                {cryptoPaymentLink ? (
                  <a
                    href={`/payments?link=${cryptoPaymentLink.id}`}
                    style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '0.5px solid var(--pt-cool)', background: 'var(--pt-cool-soft)', color: 'var(--pt-cool)', textDecoration: 'none', display: 'inline-block' }}
                  >
                    View in Payments →
                  </a>
                ) : (
                  <a
                    href="/payments"
                    style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '0.5px solid var(--pt-cool)', background: 'var(--pt-cool-soft)', color: 'var(--pt-cool)', textDecoration: 'none', display: 'inline-block' }}
                  >
                    Create payment link →
                  </a>
                )}
              </div>
            )}

            {/* Send state machine */}
            {sendState === 'idle' && (
              <div>
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ fontSize: 11 }}
                  disabled={!selectedAsset}
                  onClick={() => setSendState('confirming')}
                >
                  <Icons.send size={11} /> Send payment details
                </button>
              </div>
            )}

            {sendState === 'confirming' && (
              <div style={{ borderRadius: 6, border: '0.5px solid var(--pt-line)', padding: '12px 14px', background: 'var(--pt-surface)', marginTop: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 8 }}>Preview message</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--pt-fg-2)', background: 'var(--pt-bg-2)', borderRadius: 4, padding: '8px 10px', marginBottom: 10 }}>
                  {previewMessage || 'No message to send for this method.'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="pt-btn pt-btn-primary"
                    style={{ fontSize: 11 }}
                    disabled={!selectedAsset}
                    onClick={async () => {
                      setSendState('sending')
                      setSendError('')
                      const checkoutUrl = selectedAsset && CRYPTO_ASSETS.has(selectedAsset) && cryptoPaymentLink
                        ? cryptoPaymentLink.hosted_url
                        : undefined
                      const result = await sendOrderPaymentDetails(order.id, checkoutUrl)
                        .catch(e => ({ error: e instanceof Error ? e.message : 'Unknown error' }))
                      if ('error' in result) {
                        setSendError(result.error)
                        setSendState('error')
                      } else {
                        setSentConvId(result.conversationId)
                        setSendState('sent')
                        router.refresh()
                      }
                    }}
                  >
                    Send
                  </button>
                  <button
                    className="pt-btn pt-btn-ghost"
                    style={{ fontSize: 11 }}
                    onClick={() => setSendState('idle')}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {sendState === 'sending' && (
              <div style={{ paddingTop: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 6 }}>Sending…</div>
                <div className="pt-pac-progressbar"><div className="pt-pac-progressbar-fill" /></div>
              </div>
            )}

            {sendState === 'sent' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--pt-ok)' }}>✓ Sent!</span>
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ fontSize: 11 }}
                  onClick={() => sentConvId ? router.push(`/inbox?conversation=${sentConvId}`) : router.push('/inbox')}
                >
                  Go to chat →
                </button>
              </div>
            )}

            {sendState === 'error' && (
              <div style={{ paddingTop: 4 }}>
                <p style={{ fontSize: 11, color: 'var(--pt-danger)', margin: '0 0 6px' }}>{sendError || 'Send failed'}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => setSendState('confirming')}>
                    Retry
                  </button>
                  <button
                    className="pt-btn pt-btn-ghost"
                    style={{ fontSize: 11 }}
                    onClick={() => sentConvId ? router.push(`/inbox?conversation=${sentConvId}`) : router.push('/inbox')}
                  >
                    Open chat
                  </button>
                </div>
              </div>
            )}

          </div>
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
                      <td>
                        {it.products?.id
                          ? <Link href={`/catalog?product=${it.products.id}`} className="pt-link mono">{it.products.sku}</Link>
                          : <span className="mono">{it.products?.sku ?? '—'}</span>}
                      </td>
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
                <p>{!order.payment_asset ? 'Not set yet' : order.payment_asset === 'cash' ? 'Cash on delivery' : PAYMENT_LABELS[order.payment_asset as keyof typeof PAYMENT_LABELS] ?? order.payment_asset}</p>
              </div>
              {status !== 'created' && (
                <span className={`pt-od-pay-status pt-od-pay-${status}`}>
                  {status === 'awaiting' ? 'Awaiting' : status === 'confirming' ? 'Confirming' : 'Settled'}
                </span>
              )}
            </header>
            <div className="pt-card-body">
              <div className="pt-od-pay-grid">
                <div>
                  <div className="pt-od-pay-lbl">Asset</div>
                  <div className="pt-od-pay-val">
                    <span className="pt-pay-asset" data-asset={order.payment_asset ? (PAYMENT_BADGE[order.payment_asset]?.key ?? 'other') : 'none'}>
                      {order.payment_asset ? (PAYMENT_BADGE[order.payment_asset]?.label ?? order.payment_asset) : '—'}
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
                {showCryptoLinkField && (
                  <div>
                    <div className="pt-od-pay-lbl">Crypto link</div>
                    <div className="pt-od-pay-val">
                      {cryptoPaymentLink ? (
                        <a
                          href={`/payments?link=${cryptoPaymentLink.id}`}
                          style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '0.5px solid var(--pt-cool)', background: 'var(--pt-cool-soft)', color: 'var(--pt-cool)', textDecoration: 'none', display: 'inline-block' }}
                        >
                          View in Payments →
                        </a>
                      ) : (
                        <a
                          href="/payments"
                          style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '0.5px solid var(--pt-cool)', background: 'var(--pt-cool-soft)', color: 'var(--pt-cool)', textDecoration: 'none', display: 'inline-block' }}
                        >
                          Create payment link →
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Shipping */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div>
                <h3>Shipping</h3>
                <p>
                  {status === 'awaiting' || status === 'confirming' || status === 'created'
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
            customerName={order.customers?.display_name ?? 'customer'}
            invoice={currentInvoice}
            initialAttachments={attachments}
            attachmentSignedUrls={attachmentSignedUrls}
            attachmentThumbnailUrls={attachmentThumbnailUrls}
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
      {showEditModal && (
        <EditOrderModal
          order={order}
          paymentConfigs={paymentConfigs}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => { setShowEditModal(false); router.refresh() }}
        />
      )}
    </div>
  )
}
