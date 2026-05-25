'use client'

import { useState } from 'react'
import { PAYMENT_LABELS, PAYMENT_BADGE } from '@/types/payments'
import { validateAddress } from '@/lib/payments/onboarding/validate'
import { Icons } from '@/lib/icons'
import type { PaymentType } from '@/types/payments'
import type { PaymentMethodsCommitInput } from '@/lib/payments/onboarding/types'

interface Props {
  initial: {
    managed_crypto: boolean
    byo_crypto_assets: PaymentType[]
    off_platform_methods: PaymentType[]
  }
  onSave: (input: PaymentMethodsCommitInput) => void
  status: 'idle' | 'saving' | 'done' | 'cancelled'
  onCancel?: () => void
}

interface ByoRow {
  type: PaymentType
  address: string
  touched: boolean
  error: string | null
}

interface OffRow {
  type: PaymentType
  instructions: string
}

// Managed wallet asset chips — shown inline in the info banner
const MANAGED_ASSETS: Array<{ label: string; key: string }> = [
  { label: 'USDT', key: 'usdt' },
  { label: 'BTC',  key: 'btc'  },
  { label: 'ETH',  key: 'eth'  },
  { label: 'USDC', key: 'usdc' },
  { label: 'LTC',  key: 'ltc'  },
  { label: 'XMR',  key: 'xmr'  },
  { label: 'SOL',  key: 'sol'  },
]

function addressPlaceholder(type: PaymentType): string {
  switch (type) {
    case 'btc':        return '1... / 3... / bc1...'
    case 'eth':
    case 'usdt_erc20':
    case 'usdc_erc20': return '0x...'
    case 'usdt_trc20': return 'T...'
    case 'ltc':        return 'L... / M... / ltc1...'
    case 'xmr':        return '4... / 8...'
    case 'sol':        return 'Base58 address'
    default:           return 'Wallet address'
  }
}

function instructionsPlaceholder(type: PaymentType): string {
  switch (type) {
    case 'cashapp':       return 'Paste your $cashtag (e.g. $alanbusiness)'
    case 'venmo':         return 'Paste your @username (e.g. @alan-business)'
    case 'zelle':         return 'Phone or email registered with Zelle'
    case 'bank_transfer': return 'Bank name, account number, sort code / IBAN, account holder'
    case 'cash':          return 'Pickup address, hours, who to ask for'
    case 'wise':          return 'Email or Wise tag'
    default:              return 'Payment instructions'
  }
}

export function PaymentMethodsProposalCard({ initial, onSave, status, onCancel }: Props) {
  const [managedKept] = useState(initial.managed_crypto)

  const [byoRows, setByoRows] = useState<ByoRow[]>(() =>
    initial.byo_crypto_assets.map(type => ({ type, address: '', touched: false, error: null }))
  )

  const [offRows, setOffRows] = useState<OffRow[]>(() =>
    initial.off_platform_methods.map(type => ({ type, instructions: '' }))
  )

  function updateByoAddress(idx: number, address: string) {
    setByoRows(prev => prev.map((r, i) => i === idx ? { ...r, address } : r))
  }

  function blurByo(idx: number) {
    setByoRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const result = validateAddress(r.type, r.address)
      return { ...r, touched: true, error: result.ok ? null : result.reason }
    }))
  }

  function removeByo(idx: number) {
    setByoRows(prev => prev.filter((_, i) => i !== idx))
  }

  function updateOffInstructions(idx: number, instructions: string) {
    setOffRows(prev => prev.map((r, i) => i === idx ? { ...r, instructions } : r))
  }

  function removeOff(idx: number) {
    setOffRows(prev => prev.filter((_, i) => i !== idx))
  }

  // Validation — save disabled if any BYO address is empty or invalid, or any off-platform instructions empty
  const byoInvalid = byoRows.some(r => {
    if (r.address.trim() === '') return true
    const result = validateAddress(r.type, r.address)
    return !result.ok
  })
  const offInvalid = offRows.some(r => r.instructions.trim() === '')
  const totalVisible = (managedKept ? 1 : 0) + byoRows.length + offRows.length
  const saveDisabled =
    totalVisible === 0 ||
    byoInvalid ||
    offInvalid ||
    status === 'saving' ||
    status === 'done'

  function commit() {
    onSave({
      managed_crypto: managedKept,
      byo_crypto: byoRows.map(r => ({ type: r.type, wallet_address: r.address.trim() })),
      off_platform: offRows.map(r => ({ type: r.type, instructions: r.instructions.trim() })),
    })
  }

  const savedCount = (managedKept ? 1 : 0) + byoRows.length + offRows.length

  if (status === 'done') {
    return (
      <div className="pt-proposal pt-proposal-done">
        <span className="pt-proposal-done-check" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <polyline points="2,7 6,11 12,3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        Saved {savedCount} payment method{savedCount === 1 ? '' : 's'}.
      </div>
    )
  }
  if (status === 'cancelled') {
    return <div className="pt-proposal pt-proposal-cancelled">Cancelled.</div>
  }

  // Empty state — all rows removed
  if (totalVisible === 0) {
    return (
      <div className="pt-proposal pt-proposal-payments-empty">
        <span className="pt-proposal-payments-empty-label">All methods removed.</span>
        {onCancel && (
          <button className="pt-proposal-payments-reset-link" onClick={onCancel}>
            Cancel &amp; go back
          </button>
        )}
      </div>
    )
  }

  const saving = status === 'saving'

  return (
    <div className={`pt-proposal${saving ? ' is-importing' : ''}`}>
      <div className="pt-proposal-hd">
        <strong>Configure payment methods</strong>
        <span className="pt-proposal-hint">{totalVisible} method{totalVisible === 1 ? '' : 's'} selected</span>
      </div>

      {/* ── Managed crypto section ── */}
      {managedKept && (
        <div className="pt-proposal-group pt-proposal-payments-group">
          <div className="pt-proposal-group-hd">
            <Icons.shield size={12} style={{ color: 'var(--pt-accent-fg)', flexShrink: 0 }} />
            <span className="pt-proposal-family-chip">Managed wallet</span>
            <span className="pt-proposal-group-count">7 assets</span>
          </div>
          <div className="pt-proposal-payments-banner">
            <div className="pt-proposal-payments-banner-icon">
              <Icons.vault size={13} />
            </div>
            <div className="pt-proposal-payments-banner-body">
              <div className="pt-proposal-payments-banner-title">
                We&apos;ll provision a Solana wallet for you
              </div>
              <div className="pt-proposal-payments-banner-sub">
                Auto-converts incoming crypto to USDC. Address appears right after you save.
              </div>
              <div className="pt-proposal-payments-banner-chips">
                {MANAGED_ASSETS.map(a => (
                  <span
                    key={a.key}
                    className="pt-pay-asset pt-proposal-payments-asset-chip"
                    data-asset={a.key}
                  >
                    {a.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BYO crypto section ── */}
      {byoRows.length > 0 && (
        <div className="pt-proposal-group pt-proposal-payments-group">
          <div className="pt-proposal-group-hd">
            <Icons.wallet size={12} style={{ color: 'var(--pt-fg-3)', flexShrink: 0 }} />
            <span className="pt-proposal-family-chip">Your wallets</span>
            <span className="pt-proposal-group-count">{byoRows.length} asset{byoRows.length === 1 ? '' : 's'}</span>
          </div>
          <div className="pt-proposal-payments-rows">
            {byoRows.map((row, idx) => {
              const badge = PAYMENT_BADGE[row.type]
              const isValid = row.address.trim() !== '' && validateAddress(row.type, row.address).ok
              const isError = row.touched && row.error !== null
              return (
                <div key={`${row.type}-${idx}`} className="pt-proposal-payments-row">
                  <div className="pt-proposal-payments-row-label">
                    {badge && (
                      <span
                        className="pt-pay-asset pt-proposal-payments-asset-chip"
                        data-asset={badge.key}
                      >
                        {badge.label}
                      </span>
                    )}
                    <span className="pt-proposal-payments-label-text">
                      {PAYMENT_LABELS[row.type]}
                    </span>
                  </div>
                  <div className="pt-proposal-payments-input-wrap">
                    <input
                      className={`pt-input pt-proposal-payments-addr${isError ? ' is-err' : ''}${isValid ? ' is-ok' : ''}`}
                      value={row.address}
                      placeholder={addressPlaceholder(row.type)}
                      onChange={e => updateByoAddress(idx, e.target.value)}
                      onBlur={() => blurByo(idx)}
                      disabled={saving}
                      aria-label={`${PAYMENT_LABELS[row.type]} wallet address`}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {isValid && (
                      <span className="pt-proposal-payments-field-icon pt-proposal-payments-field-ok" aria-hidden>
                        <Icons.check size={11} />
                      </span>
                    )}
                    {isError && (
                      <span className="pt-proposal-payments-field-icon pt-proposal-payments-field-err" aria-hidden>
                        <Icons.alert size={11} />
                      </span>
                    )}
                  </div>
                  {isError && (
                    <div className="pt-proposal-payments-err-msg">{row.error}</div>
                  )}
                  <button
                    className="pt-proposal-payments-rm"
                    onClick={() => removeByo(idx)}
                    aria-label={`Remove ${PAYMENT_LABELS[row.type]}`}
                    disabled={saving}
                    tabIndex={-1}
                  >
                    <Icons.x size={11} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Off-platform section ── */}
      {offRows.length > 0 && (
        <div className="pt-proposal-group pt-proposal-payments-group">
          <div className="pt-proposal-group-hd">
            <Icons.card size={12} style={{ color: 'var(--pt-fg-3)', flexShrink: 0 }} />
            <span className="pt-proposal-family-chip">Other ways to be paid</span>
            <span className="pt-proposal-group-count">{offRows.length} method{offRows.length === 1 ? '' : 's'}</span>
          </div>
          <div className="pt-proposal-payments-rows">
            {offRows.map((row, idx) => {
              const badge = PAYMENT_BADGE[row.type]
              return (
                <div key={`${row.type}-${idx}`} className="pt-proposal-payments-row pt-proposal-payments-row-off">
                  <div className="pt-proposal-payments-row-label">
                    {badge && (
                      <span
                        className="pt-pay-asset pt-proposal-payments-asset-chip"
                        data-asset={badge.key}
                      >
                        {badge.label}
                      </span>
                    )}
                    <span className="pt-proposal-payments-label-text">
                      {PAYMENT_LABELS[row.type]}
                    </span>
                  </div>
                  <div className="pt-proposal-payments-textarea-wrap">
                    <textarea
                      className="pt-input pt-proposal-payments-notes"
                      rows={2}
                      value={row.instructions}
                      placeholder={instructionsPlaceholder(row.type)}
                      onChange={e => updateOffInstructions(idx, e.target.value)}
                      disabled={saving}
                      aria-label={`${PAYMENT_LABELS[row.type]} instructions`}
                    />
                  </div>
                  <button
                    className="pt-proposal-payments-rm"
                    onClick={() => removeOff(idx)}
                    aria-label={`Remove ${PAYMENT_LABELS[row.type]}`}
                    disabled={saving}
                    tabIndex={-1}
                    style={{ alignSelf: 'flex-start', marginTop: 8 }}
                  >
                    <Icons.x size={11} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      {saving ? (
        <div className="pt-proposal-importing">
          <div className="pt-proposal-importing-row">
            <span className="pt-proposal-importing-label">Saving payment methods…</span>
          </div>
          <div className="pt-proposal-progress" role="progressbar" aria-busy="true" aria-label="Saving payment methods" />
        </div>
      ) : (
        <div className="pt-proposal-foot">
          {onCancel && (
            <button className="pt-btn pt-btn-ghost" onClick={onCancel}>Cancel</button>
          )}
          <button
            className="pt-btn pt-btn-primary pt-proposal-payments-save"
            onClick={commit}
            disabled={saveDisabled}
          >
            Save methods →
          </button>
        </div>
      )}
    </div>
  )
}
