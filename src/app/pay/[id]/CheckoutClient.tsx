'use client'

import { useState, useEffect, useCallback } from 'react'
import QRCode from 'react-qr-code'
import type { CheckoutData, CryptoPaymentStatus } from '@/types/payments-crypto'

const PENDING: CryptoPaymentStatus[] = ['waiting', 'confirming']
const DEAD: CryptoPaymentStatus[] = ['expired', 'failed', 'refunded']

function formatAmount(amount: number, currency: string): string {
  if (currency === 'USD') return `$${amount.toFixed(2)}`
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`
}

function useCountdown(expiresAt: string | null): string {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) { setLabel('Expired'); return }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setLabel(`${m}:${s.toString().padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  return label
}

const STATUS_CONFIG: Record<string, { label: string; meta: string }> = {
  waiting:        { label: 'Waiting for your payment', meta: "We'll detect it automatically — usually 1–2 minutes after you send." },
  confirming:     { label: 'Confirming on-chain…', meta: 'Your transaction was detected. Waiting for network confirmations.' },
  confirmed:      { label: 'Payment confirmed', meta: 'Your payment has been confirmed.' },
  sending:        { label: 'Processing…', meta: 'Converting and forwarding to merchant.' },
  partially_paid: { label: 'Partially paid', meta: 'We received less than the required amount.' },
  finished:       { label: 'Payment complete ✓', meta: 'Thank you — the merchant has been notified.' },
  failed:         { label: 'Payment failed', meta: 'Something went wrong. Please contact the merchant.' },
  refunded:       { label: 'Refunded', meta: 'Your payment was refunded.' },
  expired:        { label: 'Link expired', meta: 'This payment link has expired. Ask the merchant for a new one.' },
}

function statusClass(status: string): string {
  if (['finished', 'confirmed'].includes(status)) return 'finished'
  if (['waiting', 'confirming', 'sending'].includes(status)) return status
  if (status === 'expired') return 'expired'
  return 'failed'
}

export function CheckoutClient({ initial }: { initial: CheckoutData }) {
  const [data, setData] = useState<CheckoutData>(initial)
  const [copied, setCopied] = useState(false)
  const countdown = useCountdown(data.expires_at)
  const timedOut = countdown === 'Expired'

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/pay/${data.id}`)
      if (!res.ok) return
      setData(await res.json())
    } catch { /* network hiccup — ignore */ }
  }, [data.id])

  useEffect(() => {
    if (!PENDING.includes(data.status) || timedOut) return
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [data.status, timedOut, poll])

  const copyAddress = async () => {
    if (!data.pay_address) return
    await navigator.clipboard.writeText(data.pay_address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyAmount = async () => {
    if (!data.pay_amount_crypto) return
    await navigator.clipboard.writeText(String(data.pay_amount_crypto))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isDead = DEAD.includes(data.status) || timedOut
  const effectiveStatus = timedOut && !DEAD.includes(data.status) ? 'expired' : data.status
  const sc = statusClass(effectiveStatus)
  const cfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.waiting

  return (
    <div className="pay-cust-frame">
      <div className="pay-cust-card">

        {/* Header */}
        <div className="pay-cust-hd">
          <div className="pay-cust-hd-mark">
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 10.5 7 5.5h6l4 5-4 5H7l-4-5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="10" cy="10.5" r="2" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <div className="pay-cust-hd-name">{data.tenant_name}</div>
            <div className="pay-cust-hd-sub">peptech · {data.order_ref}</div>
          </div>
          <div className="pay-cust-hd-sec">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="3" y="7" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
            <span>secure</span>
          </div>
        </div>

        {/* Amount */}
        <div className="pay-cust-amt-block">
          <div className="pay-cust-amt-lbl">Amount due</div>
          <div className="pay-cust-amt">
            <span className="cur">$</span>
            {data.amount_usd.toFixed(2)}
          </div>
          {data.amount_base !== null && data.base_currency !== 'USD' && (
            <div className="pay-cust-amt-desc">
              {formatAmount(data.amount_base, data.base_currency)}
              {data.memo ? ` — ${data.memo}` : ''}
            </div>
          )}
          {(data.amount_base === null || data.base_currency === 'USD') && data.memo && (
            <div className="pay-cust-amt-desc">{data.memo}</div>
          )}
        </div>

        {/* Payment block — hidden once expired (by time or status) to prevent accidental sends */}
        {isDead ? (
          <div className="pay-cust-dead">
            <div className="pay-cust-dead-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4.5 4.5l15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="pay-cust-dead-title">{cfg.label}</div>
            <div className="pay-cust-dead-meta">{cfg.meta}</div>
          </div>
        ) : data.pay_address ? (
          <div className="pay-cust-pay-block">
            <div className="pay-cust-pay-lbl">
              Pay with {data.pay_currency?.toUpperCase() ?? 'crypto'}
            </div>
            <div className="pay-cust-qr-row">
              <div className="pay-cust-qr">
                <QRCode value={data.pay_address} size={112} />
              </div>
              <div className="pay-cust-addr-block">
                <div className="pay-cust-addr-lbl">Send to address</div>
                <div className="pay-cust-addr">{data.pay_address}</div>
                <div className="pay-cust-copy-row">
                  <button onClick={copyAddress} className={copied ? 'copied' : ''}>
                    Copy address
                  </button>
                  {data.pay_amount_crypto && (
                    <button onClick={copyAmount}>
                      Copy amount
                    </button>
                  )}
                </div>
              </div>
            </div>

            {data.pay_amount_crypto && (
              <div className="pay-cust-amt-crypto">
                <span>Send exactly</span>
                <b>{data.pay_amount_crypto} {data.pay_currency?.toUpperCase()}</b>
                <span className="live">live</span>
              </div>
            )}

            <div className={`pay-cust-status ${sc}`}>
              <div className="ic">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <b>{cfg.label}</b>
                <div className="meta">{cfg.meta}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="pay-cust-no-addr">
            Payment address unavailable. Contact the merchant.
          </div>
        )}

        {/* Expiry timer */}
        {countdown && !['finished', 'expired', 'failed', 'refunded'].includes(data.status) && (
          <div className="pay-cust-timer">
            <span>Quote expires in</span>
            <span className="clk">{countdown}</span>
          </div>
        )}

        {/* Footer */}
        <div className="pay-cust-ft">
          <span className="powered">
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="3" y="7" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
            Powered by <b>Peptech</b> · <a href="mailto:support@peptech.app">support</a>
          </span>
        </div>

      </div>
    </div>
  )
}
