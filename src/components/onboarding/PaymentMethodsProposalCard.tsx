'use client'

import { useState } from 'react'
import { PAYMENT_LABELS } from '@/types/payments'
import { validateAddress } from '@/lib/payments/onboarding/validate'
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
    case 'cashapp':       return 'e.g. $YourCashTag'
    case 'venmo':         return 'e.g. @YourVenmoHandle'
    case 'zelle':         return 'e.g. phone number or email registered with Zelle'
    case 'bank_transfer': return 'Bank name, account name, account number, routing number or IBAN'
    case 'cash':          return 'Instructions for paying cash (e.g. "Cash on delivery only")'
    case 'wise':          return 'Wise email or payment link'
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

  const saving = status === 'saving'

  return (
    <div className={`pt-proposal${saving ? ' is-importing' : ''}`}>
      <div className="pt-proposal-hd">
        <strong>Configure payment methods</strong>
        <span className="pt-proposal-hint">{totalVisible} method{totalVisible === 1 ? '' : 's'} selected</span>
      </div>

      {/* Managed crypto section */}
      {managedKept && (
        <div className="pt-proposal-group">
          <div className="pt-proposal-group-hd">
            <span className="pt-proposal-family-chip">Managed Crypto</span>
          </div>
          <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--pt-fg-3)', background: 'var(--pt-surface)', borderRadius: 6, border: '0.5px solid var(--pt-line)', marginTop: 6 }}>
            We&apos;ll provision a Solana wallet that auto-converts USDT, BTC, ETH, USDC, LTC, XMR, and SOL into USDC. You&apos;ll see the address right after you save.
          </div>
        </div>
      )}

      {/* BYO crypto section */}
      {byoRows.length > 0 && (
        <div className="pt-proposal-group">
          <div className="pt-proposal-group-hd">
            <span className="pt-proposal-family-chip">Bring Your Own Wallets</span>
            <span className="pt-proposal-group-count">{byoRows.length} asset{byoRows.length === 1 ? '' : 's'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {byoRows.map((row, idx) => (
              <div key={`${row.type}-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ width: 110, flexShrink: 0, fontSize: 12.5, paddingTop: 7, color: 'var(--pt-fg-2)', fontWeight: 500 }}>
                  {PAYMENT_LABELS[row.type]}
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    className="pt-input"
                    value={row.address}
                    placeholder={addressPlaceholder(row.type)}
                    onChange={e => updateByoAddress(idx, e.target.value)}
                    onBlur={() => blurByo(idx)}
                    disabled={saving}
                    aria-label={`${PAYMENT_LABELS[row.type]} wallet address`}
                  />
                  {row.touched && row.error && (
                    <div style={{ fontSize: 11, color: 'var(--pt-err, #e05)', marginTop: 3 }}>{row.error}</div>
                  )}
                </div>
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ height: 32, width: 32, padding: 0, flexShrink: 0, fontSize: 16 }}
                  onClick={() => removeByo(idx)}
                  aria-label={`Remove ${PAYMENT_LABELS[row.type]}`}
                  disabled={saving}
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Off-platform section */}
      {offRows.length > 0 && (
        <div className="pt-proposal-group">
          <div className="pt-proposal-group-hd">
            <span className="pt-proposal-family-chip">Off-Platform Methods</span>
            <span className="pt-proposal-group-count">{offRows.length} method{offRows.length === 1 ? '' : 's'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {offRows.map((row, idx) => (
              <div key={`${row.type}-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ width: 110, flexShrink: 0, fontSize: 12.5, paddingTop: 7, color: 'var(--pt-fg-2)', fontWeight: 500 }}>
                  {PAYMENT_LABELS[row.type]}
                </div>
                <textarea
                  className="pt-input"
                  rows={2}
                  value={row.instructions}
                  placeholder={instructionsPlaceholder(row.type)}
                  onChange={e => updateOffInstructions(idx, e.target.value)}
                  disabled={saving}
                  aria-label={`${PAYMENT_LABELS[row.type]} instructions`}
                />
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ height: 32, width: 32, padding: 0, flexShrink: 0, fontSize: 16, marginTop: 4 }}
                  onClick={() => removeOff(idx)}
                  aria-label={`Remove ${PAYMENT_LABELS[row.type]}`}
                  disabled={saving}
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
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
            className="pt-btn pt-btn-primary"
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
