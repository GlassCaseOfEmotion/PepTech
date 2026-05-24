// src/components/payments/CreatePaymentLinkModal.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import type { ReactElement } from 'react'
import { Icons } from '@/lib/icons'
import QRCode from 'react-qr-code'
import { getRecentOrders, lookupOrder, getOrderById, createPaymentLink, estimateUsd, getOrderChannel } from '@/app/payments/actions'
import { PaySendWidget } from './PaySendWidget'
import { PAY_CURRENCIES } from '@/lib/payments/nowpayments'
import { formatAmountCompact, formatAmount } from '@/lib/currency'


type OrderOption = {
  id: string
  ref_number: string
  payment_amount: number
  currency: string
  customer_name: string | null
}

type CreatedLink = {
  id: string
  hosted_url: string
  nowpayments_id: string
  expires_at: string | null
}

function useCountdown(expiresAt: string | null) {
  const [secsLeft, setSecsLeft] = useState<number | null>(() =>
    expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)) : null
  )
  useEffect(() => {
    if (!expiresAt) return
    const tick = () => setSecsLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  return secsLeft
}

function formatCountdown(secs: number): string {
  if (secs <= 0) return 'expired'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function CreateComposer({ onBack, baseCurrency = 'USD', initialOrderId }: { onBack: () => void; baseCurrency?: string; initialOrderId?: string }) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [recentOrders, setRecentOrders] = useState<OrderOption[]>([])
  const [searchResults, setSearchResults] = useState<OrderOption[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [foundOrder, setFoundOrder] = useState<OrderOption | null>(null)
  const [usdEstimate, setUsdEstimate] = useState<number | null>(null)
  const [payCurrency, setPayCurrency] = useState<string | null>(null)
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [showErrorDetails, setShowErrorDetails] = useState(false)
  const [createdLink, setCreatedLink] = useState<CreatedLink | null>(null)
  const [copied, setCopied] = useState(false)
  const secsLeft = useCountdown(createdLink?.expires_at ?? null)
  const [orderChannel, setOrderChannel] = useState<{
    customerId: string | null
    channelType: string | null
    customerName: string | null
  } | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pre-select order when deep-linked from order detail page
  useEffect(() => {
    if (!initialOrderId) return
    getOrderById(initialOrderId).then(result => {
      if (result.order) selectOrder(result.order)
    })
  // selectOrder is stable across renders; initialOrderId never changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrderId])

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  async function loadRecentOrders() {
    if (recentOrders.length) return
    setLoadingRecent(true)
    const result = await getRecentOrders()
    setLoadingRecent(false)
    if (result.orders) setRecentOrders(result.orders)
  }

  function handleFocus() {
    setIsOpen(true)
    setQuery('')
    setSearchResults([])
    loadRecentOrders()
  }

  async function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    setIsOpen(true)
    if (!q.trim()) { setSearchResults([]); return }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setLoadingSearch(true)
      const result = await lookupOrder(q)
      setLoadingSearch(false)
      if (result.orders) setSearchResults(result.orders)
    }, 350)
  }

  function selectOrder(o: OrderOption) {
    setFoundOrder(o)
    setUsdEstimate(null)
    setIsOpen(false)
    setQuery('')
    setSearchResults([])
    if (!memo) setMemo(o.ref_number)
    setOrderChannel(null)
    getOrderChannel(o.id).then(ch => setOrderChannel(ch))
    // Fetch live USD estimate for non-USD orders
    if (o.currency !== 'USD') {
      estimateUsd(o.payment_amount, o.currency).then(r => {
        if (r.amountUsd !== undefined) setUsdEstimate(r.amountUsd)
      })
    } else {
      setUsdEstimate(o.payment_amount)
    }
  }

  function clearOrder() {
    setFoundOrder(null)
    setUsdEstimate(null)
    setPayCurrency(null)
    setQuery('')
    setMemo('')
    setSubmitError('')
    setOrderChannel(null)
  }

  async function handleSubmit() {
    if (!foundOrder)   { setSubmitError('Select an order first'); return }
    if (!payCurrency)  { setSubmitError('Select a payment currency'); return }
    setSubmitting(true)
    setSubmitError('')
    setShowErrorDetails(false)
    const result = await createPaymentLink(foundOrder.id, payCurrency, memo || foundOrder.ref_number)
    setSubmitting(false)
    if (result.error) { setSubmitError(result.error); return }
    if (result.link) {
      setCreatedLink({
        id: result.link.id,
        hosted_url: result.link.hosted_url,
        nowpayments_id: result.link.nowpayments_id,
        expires_at: result.link.expires_at ?? null,
      })
    }
  }

  function copyUrl() {
    if (!createdLink) return
    navigator.clipboard.writeText(createdLink.hosted_url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const displayedOptions = query.trim() ? searchResults : recentOrders
  const isLoading = loadingRecent || loadingSearch

  return (
    <div className="pay-comp">
      <div className="pay-comp-side">
        <div className="pay-comp-nav">
          <button className="pay-comp-nav-back" onClick={onBack}>← Back</button>
          <button
            className="pay-comp-nav-create"
            onClick={handleSubmit}
            disabled={submitting || !foundOrder || !payCurrency || !!createdLink}
          >
            {submitting ? 'Creating…' : createdLink ? 'Created ✓' : 'Create link →'}
          </button>
        </div>
        <h2>Request payment</h2>
        <p className="sub">Pick an order — the customer pays in crypto, you get USDC.</p>

        {/* ── Order picker ─────────────────────────────────────── */}
        <div className="pay-comp-section">
          <h4>Order</h4>
          <div className="pay-comp-picker" ref={pickerRef}>
            <div className={`pay-comp-picker-input${isOpen ? ' is-open' : ''}`}>
              <Icons.box size={13} style={{ color: 'var(--pt-fg-3)', flexShrink: 0 }} />
              <input
                value={query}
                onChange={handleSearch}
                onFocus={handleFocus}
                placeholder={foundOrder ? `${foundOrder.ref_number} — change order` : 'Click to select or search…'}
              />
              {isLoading && <span className="pay-comp-picker-spin">loading…</span>}
              {!isLoading && foundOrder && !isOpen && (
                <Icons.check size={11} style={{ color: 'var(--pt-ok)', flexShrink: 0 }} />
              )}
            </div>

            {isOpen && (
              <div className="pay-comp-picker-drop">
                <div className="pay-comp-picker-drop-hd">
                  {query.trim() ? 'Search results' : 'Recent orders'}
                </div>
                {isLoading ? (
                  <div className="pay-comp-picker-empty">Loading…</div>
                ) : displayedOptions.length === 0 ? (
                  <div className="pay-comp-picker-empty">
                    {query.trim() ? 'No matching orders' : 'No recent orders'}
                  </div>
                ) : (
                  displayedOptions.map(o => (
                    <button
                      key={o.id}
                      className="pay-comp-picker-opt"
                      onMouseDown={e => { e.preventDefault(); selectOrder(o) }}
                    >
                      <span className="ref">#{o.ref_number}</span>
                      <span className="cust">{o.customer_name ?? '—'}</span>
                      <span className="amt">{formatAmountCompact(o.payment_amount, o.currency)}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selection summary card */}
          {foundOrder && !isOpen && (
            <div className="pay-comp-sel">
              <div className="pay-comp-sel-amt">
                {formatAmount(foundOrder.payment_amount, foundOrder.currency)}
              </div>
              <div className="pay-comp-sel-meta">
                <div className="pay-comp-sel-cust">{foundOrder.customer_name ?? '—'}</div>
                <div className="pay-comp-sel-ref">
                  Order #{foundOrder.ref_number}
                  {foundOrder.currency !== 'USD' && (
                    usdEstimate !== null
                      ? <> · ≈ ${usdEstimate.toFixed(2)} USD</>
                      : <> · calculating USD…</>
                  )}
                </div>
              </div>
              <button className="pay-comp-sel-clear" onClick={clearOrder} title="Change order">
                <Icons.x size={12} />
              </button>
            </div>
          )}
        </div>

        {/* ── Memo ─────────────────────────────────────────────── */}
        <div className="pay-comp-section">
          <h4>Memo</h4>
          <div className="pay-comp-field">
            <label>Shown to the customer on the checkout page</label>
            <div className="pay-comp-input">
              <input
                value={memo}
                onChange={e => setMemo(e.target.value)}
                placeholder="e.g. Reta 10mg ×2"
              />
            </div>
          </div>
        </div>

        {/* ── Customer pays in (required) ──────────────────────── */}
        <div className="pay-comp-section">
          <h4>Customer pays in</h4>
          <div className="pay-comp-assets">
            {PAY_CURRENCIES.map(c => (
              <button
                key={c.id}
                className={`pay-comp-asset${payCurrency === c.id ? ' is-on' : ''}`}
                onClick={() => setPayCurrency(c.id)}
              >
                <span className="check">
                  {payCurrency === c.id && <Icons.check size={10} />}
                </span>
                <span className="info">
                  <span className="lbl">
                    {c.label}{' '}
                    <span style={{ color: 'var(--pt-fg-4)', fontWeight: 400 }}>· {c.chain}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            Ask your customer which they prefer. Funds always settle as USDC to your wallet.
          </div>
        </div>

        {submitError && (
          <div style={{ padding: '10px 12px', background: 'oklch(from var(--pt-danger) l c h / 0.07)', border: '0.5px solid oklch(from var(--pt-danger) l c h / 0.25)', borderRadius: 7, marginTop: 4 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--pt-danger)' }}>
              Couldn&apos;t create payment link — please try again in a moment.
            </div>
            <button
              onClick={() => setShowErrorDetails(s => !s)}
              style={{ marginTop: 5, background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--pt-fg-4)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {showErrorDetails ? 'Hide details ↑' : 'Show details ↓'}
            </button>
            {showErrorDetails && (
              <div style={{ marginTop: 6, padding: '6px 8px', background: 'oklch(from var(--pt-danger) l c h / 0.06)', borderRadius: 4, fontFamily: 'var(--pt-mono)', fontSize: 10.5, color: 'var(--pt-fg-3)', lineHeight: 1.5, wordBreak: 'break-all' }}>
                {submitError}
              </div>
            )}
          </div>
        )}

        <div className="pay-comp-cta">
          <button className="pt-btn pt-btn-ghost" onClick={onBack}>Cancel</button>
          <button
            className="pt-btn pt-btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !foundOrder || !payCurrency || !!createdLink}
          >
            {submitting ? 'Creating…' : createdLink ? 'Created ✓' : payCurrency ? `Create ${PAY_CURRENCIES.find(c => c.id === payCurrency)?.label ?? ''} payment link →` : 'Select a currency first'}
          </button>
        </div>
      </div>

      {/* ── Preview pane ─────────────────────────────────────────── */}
      <div className="pay-comp-pv">
        {createdLink ? (
          <>
            <h4>Link created</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--pt-ok-soft)', color: 'var(--pt-ok)', borderRadius: 7, fontSize: 12.5, fontWeight: 500 }}>
                <Icons.check size={14} /> Payment link is live
              </div>
              {secsLeft !== null && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 500,
                  background: secsLeft <= 0 ? 'oklch(from var(--pt-danger) l c h / 0.08)' : secsLeft < 300 ? 'oklch(from var(--pt-danger) l c h / 0.08)' : 'var(--pt-warn-soft)',
                  color: secsLeft < 300 ? 'var(--pt-danger)' : 'var(--pt-warn)',
                }}>
                  <Icons.clock size={13} />
                  {secsLeft <= 0 ? 'Link has expired' : <>Expires in <span style={{ fontFamily: 'var(--pt-mono)', marginLeft: 3 }}>{formatCountdown(secsLeft)}</span></>}
                </div>
              )}
            </div>

            <h4>Checkout URL</h4>
            <div className="pay-comp-url">
              <Icons.lock size={12} style={{ color: 'var(--pt-ok)' }} />
              <a
                className="u"
                href={createdLink.hosted_url}
                target="_blank"
                rel="noreferrer"
                style={{ flex: 1, color: 'var(--pt-accent-fg)', textDecoration: 'none', fontSize: 11, fontFamily: 'var(--pt-mono)' }}
              >
                Open link ↗
              </a>
              <button onClick={copyUrl}>{copied ? 'Copied!' : 'copy'}</button>
            </div>

            <h4>Send to customer</h4>
            <PaySendWidget
              customerId={orderChannel?.customerId ?? null}
              customerName={orderChannel?.customerName ?? foundOrder?.customer_name ?? null}
              channelType={orderChannel?.channelType ?? null}
              messageText={`Hi ${orderChannel?.customerName ?? foundOrder?.customer_name ?? 'there'}! Here's your payment link for ${(memo || foundOrder?.ref_number) ?? 'your order'}:\n\n${createdLink.hosted_url}`}
              url={createdLink.hosted_url}
              orderId={foundOrder?.id}
              linkId={createdLink.id}
            />

            <h4>QR code</h4>
            <div style={{ background: '#fff', border: '0.5px solid var(--pt-line)', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'center' }}>
              <QRCode value={createdLink.hosted_url} size={140} />
            </div>

            <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', lineHeight: 1.6 }}>
              Link ID: <span style={{ fontFamily: 'var(--pt-mono)' }}>{createdLink.nowpayments_id}</span>
            </div>
          </>
        ) : (
          <>
            <h4>Preview</h4>
            {foundOrder ? (
              <div style={{ background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Payment request
                </div>
                <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.025em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                  {formatAmount(foundOrder.payment_amount, foundOrder.currency)}
                </div>
                {foundOrder.currency !== 'USD' && usdEstimate !== null && (
                  <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 3, fontFamily: 'var(--pt-mono)' }}>
                    ≈ ${usdEstimate.toFixed(2)} USD · rate locked on creation
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--pt-fg-2)', marginTop: 5 }}>
                  {memo || foundOrder.ref_number}
                </div>
                <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 8 }}>
                  {payCurrency
                    ? <>Paying with <strong>{PAY_CURRENCIES.find(c => c.id === payCurrency)?.label}</strong> · settles as USDC</>
                    : 'Select a currency above'}
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)', borderRadius: 8, padding: 24, textAlign: 'center', color: 'var(--pt-fg-4)', fontSize: 12 }}>
                Select an order to see a preview
              </div>
            )}

            <h4>Send to customer</h4>
            <div style={{ opacity: 0.35, pointerEvents: 'none' }}>
              <button className="pay-comp-snd-primary" disabled>
                <Icons.send size={13} />
                <span className="label">Available after creating the link</span>
              </button>
            </div>

            <h4>QR code</h4>
            <div style={{ background: 'var(--pt-surface)', border: '0.5px dashed var(--pt-line)', borderRadius: 8, padding: 16, height: 172, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pt-fg-4)', fontSize: 11.5, textAlign: 'center', lineHeight: 1.5 }}>
              Generated when you<br />create the link
            </div>
          </>
        )}
      </div>
    </div>
  )
}
