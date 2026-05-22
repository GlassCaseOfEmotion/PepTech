// src/components/payments/CreatePaymentLinkModal.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import type { ReactElement } from 'react'
import { Icons } from '@/lib/icons'
import QRCode from 'react-qr-code'
import { getRecentOrders, lookupOrder, createPaymentLink, estimateUsd } from '@/app/payments/actions'
import { formatAmountCompact, formatAmount } from '@/lib/currency'

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

type OrderOption = {
  id: string
  ref_number: string
  payment_amount: number
  currency: string
  customer_name: string | null
}

type CreatedLink = {
  hosted_url: string
  nowpayments_id: string
}

const EXPIRY_OPTIONS = ['1h', '6h', '24h', '7d', 'never'] as const

export function CreateComposer({ onBack, baseCurrency = 'USD' }: { onBack: () => void; baseCurrency?: string }) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [recentOrders, setRecentOrders] = useState<OrderOption[]>([])
  const [searchResults, setSearchResults] = useState<OrderOption[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [foundOrder, setFoundOrder] = useState<OrderOption | null>(null)
  const [usdEstimate, setUsdEstimate] = useState<number | null>(null)
  const [memo, setMemo] = useState('')
  const [expiry, setExpiry] = useState('24h')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [createdLink, setCreatedLink] = useState<CreatedLink | null>(null)
  const [copied, setCopied] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    setQuery('')
    setMemo('')
    setSubmitError('')
  }

  async function handleSubmit() {
    if (!foundOrder) { setSubmitError('Select an order first'); return }
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

  const displayedOptions = query.trim() ? searchResults : recentOrders
  const isLoading = loadingRecent || loadingSearch

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

        {/* ── Advanced ─────────────────────────────────────────── */}
        <div className="pay-comp-section">
          <button
            className={`pay-comp-adv-toggle${showAdvanced ? ' is-open' : ''}`}
            onClick={() => setShowAdvanced(s => !s)}
          >
            <Icons.gear size={11} />
            Advanced options
            <Icons.arrowDn size={10} />
          </button>

          {showAdvanced && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="pay-comp-field">
                <label>Expires after</label>
                <div className="pay-comp-segctl">
                  {EXPIRY_OPTIONS.map(e => (
                    <button key={e} className={expiry === e ? 'is-on' : ''} onClick={() => setExpiry(e)}>{e}</button>
                  ))}
                </div>
                {/* DECISION NEEDED — expiry not yet passed to NOWPayments API (uses their 24h default). Wire validity_time param to make this functional. */}
                <div className="hint" style={{ marginTop: 5 }}>Not yet wired — defaults to 24h.</div>
              </div>
              <div className="pay-comp-field" style={{ fontSize: 11.5, color: 'var(--pt-fg-3)', lineHeight: 1.6 }}>
                <label>Accepted assets</label>
                {/* DECISION NEEDED — per-link currency restriction not implemented. NOWPayments accepts all tokens. */}
                Customer can pay with any crypto (BTC, ETH, USDT, SOL, XMR and 300+ more). Funds settle as USDC.
              </div>
            </div>
          )}
        </div>

        {submitError && (
          <div style={{ fontSize: 12, color: 'var(--pt-danger)', padding: '8px 10px', background: 'oklch(from var(--pt-danger) l c h / 0.08)', borderRadius: 6, marginTop: 4 }}>
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

      {/* ── Preview pane ─────────────────────────────────────────── */}
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
                  Pay with any crypto · settles as USDC
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)', borderRadius: 8, padding: 24, textAlign: 'center', color: 'var(--pt-fg-4)', fontSize: 12 }}>
                Select an order to see a preview
              </div>
            )}

            <h4>Share via</h4>
            <div className="pay-comp-send" style={{ opacity: foundOrder ? 1 : 0.4 }}>
              <button className="pay-comp-send-btn" disabled={!foundOrder}><Icons.wa size={13} /> WhatsApp</button>
              <button className="pay-comp-send-btn" disabled={!foundOrder}><Icons.tg size={13} /> Telegram</button>
              <button className="pay-comp-send-btn" disabled={!foundOrder}><Icons.em size={13} /> Email</button>
              <button className="pay-comp-send-btn" disabled={!foundOrder}><Icons.doc size={13} /> Copy link</button>
            </div>

            <h4>QR code</h4>
            <div style={{ background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'center', opacity: foundOrder ? 1 : 0.35 }}>
              <QrPlaceholder size={140} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
