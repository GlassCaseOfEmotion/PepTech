// src/components/payments/CreatePaymentLinkModal.tsx
'use client'

import { useState, useRef } from 'react'
import type { ReactElement } from 'react'
import { Icons } from '@/lib/icons'
import { lookupOrder, createPaymentLink } from '@/app/payments/actions'

function QrPlaceholder({ size = 124 }: { size?: number }) {
  const cells = 21
  const cellSize = size / cells
  const fixedPattern = (i: number, j: number) => {
    if ((i < 7 && j < 7) || (i < 7 && j > 13) || (i > 13 && j < 7)) {
      const xi = i > 13 ? i - 14 : i
      const xj = j > 13 ? j - 14 : j
      const ii = i > 13 ? xi : (i < 7 ? i : 0)
      const jj = j > 13 ? xj : (j < 7 ? j : 0)
      return (ii === 0 || ii === 6 || jj === 0 || jj === 6) ? 1
           : (ii >= 2 && ii <= 4 && jj >= 2 && jj <= 4) ? 1 : 0
    }
    return ((i * 31 + j * 17 + i * j * 3) % 7) < 3 ? 1 : 0
  }
  const rects: ReactElement[] = []
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      if (fixedPattern(i, j)) {
        rects.push(<rect key={`${i}-${j}`} x={j * cellSize} y={i * cellSize} width={cellSize + 0.3} height={cellSize + 0.3} fill="#111" />)
      }
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="#fff" />
      {rects}
      <rect x={size / 2 - 12} y={size / 2 - 12} width={24} height={24} fill="#fff" />
      <rect x={size / 2 - 9} y={size / 2 - 9} width={18} height={18} rx={4} fill="oklch(0.20 0.01 100)" />
    </svg>
  )
}

type FoundOrder = {
  id: string
  ref_number: string
  payment_amount: number
  customer_name: string | null
}

type CreatedLink = {
  hosted_url: string
  nowpayments_id: string
}

const EXPIRY_OPTIONS = ['1h', '6h', '24h', '7d', 'never'] as const

export function CreateComposer({ onBack }: { onBack: () => void }) {
  const [orderQuery, setOrderQuery] = useState('')
  const [orderResults, setOrderResults] = useState<FoundOrder[]>([])
  const [foundOrder, setFoundOrder] = useState<FoundOrder | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [memo, setMemo] = useState('')
  const [expiry, setExpiry] = useState('24h')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [createdLink, setCreatedLink] = useState<CreatedLink | null>(null)
  const [copied, setCopied] = useState(false)
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function handleOrderSearch(query: string) {
    setOrderQuery(query)
    setOrderResults([])
    setFoundOrder(null)
    setLookupError('')
    if (!query.trim()) return
    if (lookupTimer.current) clearTimeout(lookupTimer.current)
    lookupTimer.current = setTimeout(async () => {
      setLookupLoading(true)
      const result = await lookupOrder(query)
      setLookupLoading(false)
      if (result.error) { setLookupError(result.error); return }
      if (!result.orders?.length) { setLookupError('No matching orders'); return }
      setOrderResults(result.orders)
      if (result.orders.length === 1) selectOrder(result.orders[0])
    }, 350)
  }

  function selectOrder(o: FoundOrder) {
    setFoundOrder(o)
    setOrderResults([])
    setOrderQuery(o.ref_number)
    if (!memo) setMemo(o.ref_number)
  }

  async function handleSubmit() {
    if (!foundOrder) { setSubmitError('Find an order first'); return }
    setSubmitting(true)
    setSubmitError('')
    const result = await createPaymentLink(foundOrder.id, memo || foundOrder.ref_number)
    setSubmitting(false)
    if (result.error) { setSubmitError(result.error); return }
    if (result.link) {
      setCreatedLink({ hosted_url: result.link.hosted_url, nowpayments_id: result.link.nowpayments_id })
    }
  }

  function copyUrl() {
    if (!createdLink) return
    navigator.clipboard.writeText(createdLink.hosted_url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="pay-comp">
      <div className="pay-comp-side">
        <button
          className="pt-btn pt-btn-ghost"
          onClick={onBack}
          style={{ padding: '3px 8px', fontSize: 11, marginBottom: 14 }}
        >
          ← Back
        </button>
        <h2>Request payment</h2>
        <p className="sub">Create a checkout URL. The customer pays in crypto; funds land in your Vault.</p>

        {/* Amount */}
        <div className="pay-comp-section">
          <h4>Amount</h4>
          <div className="pay-comp-input is-amt">
            <span className="cur">$</span>
            <input
              value={foundOrder ? foundOrder.payment_amount.toFixed(2) : ''}
              readOnly={!!foundOrder}
              placeholder="0.00"
              onChange={() => {}}
            />
            <span className="ccy">USD</span>
          </div>
          <div className="hint">Pulled from the order. Rate locked when customer opens link.</div>
        </div>

        {/* For */}
        <div className="pay-comp-section">
          <h4>For</h4>
          <div className="pay-comp-field">
            <label>Attach to order</label>
            <div className="pay-comp-input" style={{ borderColor: lookupError ? 'var(--pt-danger)' : foundOrder ? 'var(--pt-accent)' : undefined }}>
              <Icons.box size={13} />
              <input
                value={orderQuery}
                onChange={e => handleOrderSearch(e.target.value)}
                placeholder="Type order ref e.g. A-1234…"
              />
              {lookupLoading && <span style={{ fontSize: 10, color: 'var(--pt-fg-4)' }}>searching…</span>}
              {foundOrder && !lookupLoading && <Icons.check size={11} style={{ color: 'var(--pt-ok)' }} />}
            </div>
            {lookupError && (
              <div style={{ fontSize: 11, color: 'var(--pt-danger)', marginTop: 4 }}>{lookupError}</div>
            )}
            {orderResults.length > 1 && (
              <div style={{ border: '0.5px solid var(--pt-line)', borderRadius: 6, marginTop: 4, overflow: 'hidden', background: 'var(--pt-surface)' }}>
                {orderResults.map(o => (
                  <button
                    key={o.id}
                    onClick={() => selectOrder(o)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderTop: '0.5px solid var(--pt-line-soft)', cursor: 'pointer', textAlign: 'left', fontSize: 12 }}
                  >
                    <span style={{ fontFamily: 'var(--pt-mono)', fontWeight: 600 }}>#{o.ref_number}</span>
                    <span style={{ color: 'var(--pt-fg-3)' }}>{o.customer_name ?? '—'}</span>
                    <span style={{ fontFamily: 'var(--pt-mono)' }}>${o.payment_amount.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="pay-comp-field">
            <label>Customer</label>
            <div className="pay-comp-input">
              <Icons.user size={13} />
              <input
                value={foundOrder?.customer_name ?? ''}
                readOnly
                placeholder="Auto-filled from order"
                style={{ color: foundOrder?.customer_name ? 'var(--pt-fg)' : 'var(--pt-fg-4)' }}
                onChange={() => {}}
              />
            </div>
          </div>
          <div className="pay-comp-field">
            <label>Memo (customer sees this)</label>
            <div className="pay-comp-input">
              <input
                value={memo}
                onChange={e => setMemo(e.target.value)}
                placeholder="e.g. Reta 10mg ×2"
              />
            </div>
          </div>
        </div>

        {/* Accepted assets — informational only, NOWPayments handles currency selection */}
        <div className="pay-comp-section">
          <h4>Accepted assets</h4>
          <div style={{ fontSize: 11.5, color: 'var(--pt-fg-3)', lineHeight: 1.5 }}>
            {/* DECISION NEEDED — per-link accepted assets not configured in our API call.
                NOWPayments lets the customer choose any supported currency.
                To restrict per-link, we'd need to pass a currency list to NOWPayments. */}
            Customer can pay with any currency NOWPayments supports (BTC, ETH, USDT, SOL, XMR, and 300+ more).
            Funds always settle as USDC to your wallet.
          </div>
        </div>

        {/* Expires — display-only; NOWPayments default is 24h and not currently overridden */}
        <div className="pay-comp-section">
          <h4>Expires after</h4>
          <div className="pay-comp-segctl">
            {EXPIRY_OPTIONS.map(e => (
              <button key={e} className={expiry === e ? 'is-on' : ''} onClick={() => setExpiry(e)}>{e}</button>
            ))}
          </div>
          {/* DECISION NEEDED — expiry not yet passed to NOWPayments API (uses their default 24h).
              To wire: add validity_time param to createNowPayment call. */}
          <div className="hint" style={{ marginTop: 6 }}>Expiry selection not yet wired — defaults to 24h.</div>
        </div>

        {submitError && (
          <div style={{ fontSize: 12, color: 'var(--pt-danger)', padding: '8px 10px', background: 'oklch(from var(--pt-danger) l c h / 0.08)', borderRadius: 6, marginTop: 8 }}>
            {submitError}
          </div>
        )}

        <div className="pay-comp-cta">
          <button className="pt-btn pt-btn-ghost" onClick={onBack}>Cancel</button>
          <button
            className="pt-btn pt-btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !foundOrder || !!createdLink}
          >
            {submitting ? 'Creating…' : createdLink ? 'Created ✓' : 'Create payment link →'}
          </button>
        </div>
      </div>

      <div className="pay-comp-pv">
        {createdLink ? (
          <>
            <h4>Link created</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--pt-ok-soft)', color: 'var(--pt-ok)', borderRadius: 7, fontSize: 12.5, fontWeight: 500 }}>
              <Icons.check size={14} /> Payment link is live
            </div>

            <h4>Checkout URL</h4>
            <div className="pay-comp-url">
              <Icons.lock size={12} style={{ color: 'var(--pt-ok)' }} />
              <span className="u">{createdLink.hosted_url}</span>
              <button onClick={copyUrl}>{copied ? 'Copied!' : 'copy'}</button>
            </div>

            <h4>Share via</h4>
            <div className="pay-comp-send">
              <button className="pay-comp-send-btn"><Icons.wa size={13} /> WhatsApp</button>
              <button className="pay-comp-send-btn"><Icons.tg size={13} /> Telegram</button>
              <button className="pay-comp-send-btn"><Icons.em size={13} /> Email</button>
              <button className="pay-comp-send-btn" onClick={copyUrl}><Icons.doc size={13} /> Copy link</button>
            </div>

            <h4>QR code</h4>
            <div style={{ background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'center' }}>
              {/* DECISION NEEDED — QR is a placeholder pattern, not a real QR for the URL.
                  To make real: install a QR library (e.g. qrcode) and generate from createdLink.hosted_url */}
              <QrPlaceholder size={140} />
            </div>

            <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', lineHeight: 1.6 }}>
              Link ID: <span style={{ fontFamily: 'var(--pt-mono)' }}>{createdLink.nowpayments_id}</span>
            </div>
          </>
        ) : (
          <>
            <h4>Preview · checkout URL</h4>
            <div className="pay-comp-url">
              <Icons.lock size={12} style={{ color: foundOrder ? 'var(--pt-ok)' : 'var(--pt-fg-4)' }} />
              <span className="u" style={{ color: foundOrder ? 'var(--pt-fg-2)' : 'var(--pt-fg-4)' }}>
                {foundOrder ? `pay.peptech.app / pl_…` : 'Select an order to preview URL'}
              </span>
            </div>

            <h4>Share via</h4>
            <div className="pay-comp-send">
              <button className="pay-comp-send-btn"><Icons.wa size={13} /> WhatsApp</button>
              <button className="pay-comp-send-btn"><Icons.tg size={13} /> Telegram</button>
              <button className="pay-comp-send-btn"><Icons.em size={13} /> Email</button>
              <button className="pay-comp-send-btn"><Icons.doc size={13} /> Copy link</button>
            </div>

            <h4>QR code</h4>
            <div style={{ background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'center' }}>
              <QrPlaceholder size={140} />
            </div>

            {foundOrder && (
              <>
                <h4>What the customer will see</h4>
                <div style={{ background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Payment request
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 4 }}>
                    <span style={{ fontFamily: 'var(--pt-mono)', fontSize: 16, color: 'var(--pt-fg-3)' }}>$</span>
                    {foundOrder.payment_amount.toFixed(2)}{' '}
                    <span style={{ fontFamily: 'var(--pt-mono)', fontSize: 12, color: 'var(--pt-fg-3)' }}>USD</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--pt-fg-2)', marginTop: 5 }}>{memo || foundOrder.ref_number}</div>
                  <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 10 }}>Pay with any crypto · settles as USDC</div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
