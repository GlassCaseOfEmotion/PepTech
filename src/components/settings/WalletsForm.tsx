'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { upsertPaymentConfig, togglePaymentConfig } from '@/app/settings/wallets/actions'
import { PAYMENT_METHODS, PAYMENT_LABELS, OFF_PLATFORM_METHODS } from '@/types/payments'
import type { TenantPaymentConfig, PaymentType } from '@/types/payments'

const CRYPTO_TYPES = PAYMENT_METHODS.filter(m => m !== 'bank_transfer')
// "Other ways to be paid" — onboarding writes free-text `instructions` for
// these; bank_transfer is handled in its own panel (it also has structured
// columns from the pre-onboarding settings flow).
const OTHER_OFF_PLATFORM_TYPES = OFF_PLATFORM_METHODS.filter(m => m !== 'bank_transfer')

function maskAddress(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

export function WalletsForm({ configs }: { configs: TenantPaymentConfig[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [bankForm, setBankForm] = useState({
    bankName: '', accountName: '', accountNumber: '', sortCode: '', iban: '', instructions: '',
  })
  const [instructionsValue, setInstructionsValue] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const cfg = (type: string) => configs.find(c => c.type === type) ?? null

  const hasNothingConfigured =
    CRYPTO_TYPES.every(type => !cfg(type)?.wallet_address) &&
    !cfg('bank_transfer') &&
    OTHER_OFF_PLATFORM_TYPES.every(t => !cfg(t))

  const saveCrypto = (type: string) => {
    if (!editValue.trim()) return
    setError('')
    startTransition(async () => {
      const r = await upsertPaymentConfig({ type, walletAddress: editValue.trim() })
      if ('error' in r) { setError(r.error); return }
      setEditing(null); setEditValue('')
    })
  }

  const saveBank = () => {
    // Bank can be filled in EITHER as structured fields (legacy / settings flow)
    // OR as free-text instructions (onboarding flow). Require one or the other.
    const hasStructured = !!bankForm.accountName.trim() && (!!bankForm.sortCode.trim() || !!bankForm.iban.trim())
    const hasInstructions = !!bankForm.instructions.trim()
    if (!hasStructured && !hasInstructions) {
      setError('Add either account details (name + sort code/IBAN) or free-text payment instructions.')
      return
    }
    setError('')
    startTransition(async () => {
      const r = await upsertPaymentConfig({
        type: 'bank_transfer',
        bankName: bankForm.bankName || undefined,
        accountName: bankForm.accountName || undefined,
        accountNumber: bankForm.accountNumber || undefined,
        sortCode: bankForm.sortCode || undefined,
        iban: bankForm.iban || undefined,
        instructions: bankForm.instructions || undefined,
      })
      if ('error' in r) { setError(r.error); return }
      setEditing(null)
    })
  }

  const saveOffPlatform = (type: PaymentType) => {
    if (!instructionsValue.trim()) { setError('Add the payment instructions before saving.'); return }
    setError('')
    startTransition(async () => {
      const r = await upsertPaymentConfig({ type, instructions: instructionsValue.trim() })
      if ('error' in r) { setError(r.error); return }
      setEditing(null); setInstructionsValue('')
    })
  }

  const toggle = (type: string, current: boolean) => {
    startTransition(async () => { await togglePaymentConfig(type, !current) })
  }

  const startEditBank = () => {
    const c = cfg('bank_transfer')
    setBankForm({
      bankName: c?.bank_name ?? '', accountName: c?.account_name ?? '',
      accountNumber: c?.account_number ?? '', sortCode: c?.sort_code ?? '',
      iban: c?.iban ?? '', instructions: c?.instructions ?? '',
    })
    setEditing('bank_transfer'); setError('')
  }

  const startEditOffPlatform = (type: PaymentType) => {
    const c = cfg(type)
    setInstructionsValue(c?.instructions ?? '')
    setEditing(type); setError('')
  }

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>Wallets &amp; assets</h2>
          <p>Configure the payment methods you accept. Only active methods appear on orders.</p>
        </div>
      </div>

      {hasNothingConfigured && (
        <div className="pt-settings-banner">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <circle cx="8" cy="8" r="6.5"/>
            <line x1="8" y1="5.5" x2="8" y2="8.5"/>
            <circle cx="8" cy="10.5" r="0.7" fill="currentColor" stroke="none"/>
          </svg>
          <p>
            Configure at least one payment method so customers can pay for orders.
            {' '}<Link href="/settings/wallets" className="pt-link">Set up now</Link>
          </p>
        </div>
      )}

      {error && (
        <p style={{ fontSize: 12, color: 'var(--pt-danger)', marginBottom: 10 }}>{error}</p>
      )}

      {/* Crypto */}
      <div className="pt-st-wallet-panel">
        <div className="pt-st-wallet-panel-hd">Crypto addresses</div>
        {CRYPTO_TYPES.map(type => {
          const c = cfg(type)
          const isEditing = editing === type
          return (
            <div key={type} className="pt-st-wallet-row">
              <div className="pt-st-wallet-info">
                <span className="pt-st-wallet-name">{PAYMENT_LABELS[type]}</span>
                <span className="pt-st-wallet-addr">
                  {c?.wallet_address ? maskAddress(c.wallet_address) : 'Not configured'}
                </span>
              </div>
              <div className="pt-st-wallet-actions">
                {c && (
                  <button
                    className={`pt-st-toggle ${c.is_active ? 'is-on' : ''}`}
                    title={c.is_active ? 'Active — click to disable' : !c.wallet_address ? 'Add an address first' : 'Inactive — click to enable'}
                    onClick={() => toggle(type, c.is_active)}
                    disabled={pending || !c.wallet_address}
                  />
                )}
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={() => { setEditing(type); setEditValue(c?.wallet_address ?? ''); setError('') }}
                >
                  {c ? 'Edit' : 'Add'}
                </button>
              </div>
              {isEditing && (
                <div className="pt-st-wallet-edit">
                  <input
                    className="pt-st-input mono"
                    placeholder={`${PAYMENT_LABELS[type]} receive address`}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="pt-btn pt-btn-primary"
                      style={{ fontSize: 11 }}
                      onClick={() => saveCrypto(type)}
                      disabled={pending || !editValue.trim()}
                    >
                      Save
                    </button>
                    <button
                      className="pt-btn pt-btn-ghost"
                      style={{ fontSize: 11 }}
                      onClick={() => { setEditing(null); setEditValue('') }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bank transfer */}
      <div className="pt-st-wallet-panel">
        <div className="pt-st-wallet-panel-hd">Bank transfer</div>
        {(() => {
          const c = cfg('bank_transfer')
          const isEditing = editing === 'bank_transfer'
          return (
            <div className="pt-st-wallet-row">
              <div className="pt-st-wallet-info">
                <span className="pt-st-wallet-name">Bank Transfer</span>
                <span className="pt-st-wallet-addr">
                  {(() => {
                    if (!c) return 'Not configured'
                    const structured = `${c.account_name ?? ''}${c.sort_code ? ` · Sort: ${c.sort_code}` : ''}${c.iban ? ` · ${c.iban.slice(0, 8)}…` : ''}`.trim()
                    if (structured) return structured
                    if (c.instructions) {
                      return c.instructions.length > 80 ? `${c.instructions.slice(0, 80)}…` : c.instructions
                    }
                    return 'Configured (no details)'
                  })()}
                </span>
              </div>
              <div className="pt-st-wallet-actions">
                {c && (
                  <button
                    className={`pt-st-toggle ${c.is_active ? 'is-on' : ''}`}
                    title={c.is_active ? 'Active — click to disable' : 'Inactive — click to enable'}
                    onClick={() => toggle('bank_transfer', c.is_active)}
                    disabled={pending}
                  />
                )}
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={startEditBank}
                >
                  {c ? 'Edit' : 'Add'}
                </button>
              </div>
              {isEditing && (
                <div className="pt-st-wallet-edit">
                  {([
                    { label: 'Bank name (optional)', key: 'bankName', placeholder: 'e.g. Barclays' },
                    { label: 'Account name', key: 'accountName', placeholder: 'Full name on account' },
                    { label: 'Account number', key: 'accountNumber', placeholder: '12345678' },
                    { label: 'Sort code', key: 'sortCode', placeholder: '04-00-04' },
                    { label: 'IBAN', key: 'iban', placeholder: 'GB29NWBK60161331926819' },
                  ] as { label: string; key: keyof typeof bankForm; placeholder: string }[]).map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 3 }}>{label}</div>
                      <input
                        className="pt-st-input"
                        placeholder={placeholder}
                        value={bankForm[key]}
                        onChange={e => setBankForm(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 3 }}>Free-text instructions (optional)</div>
                    <textarea
                      className="pt-st-input"
                      placeholder="Anything else the customer should know to pay you (reference numbers, intermediary banks, etc.)"
                      rows={3}
                      value={bankForm.instructions}
                      onChange={e => setBankForm(prev => ({ ...prev, instructions: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={saveBank} disabled={pending}>Save</button>
                    <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Other ways to be paid — cash, Zelle, Venmo, Cash App, Wise */}
      <div className="pt-st-wallet-panel">
        <div className="pt-st-wallet-panel-hd">Other ways to be paid</div>
        {OTHER_OFF_PLATFORM_TYPES.map(type => {
          const c = cfg(type)
          const isEditing = editing === type
          return (
            <div key={type} className="pt-st-wallet-row">
              <div className="pt-st-wallet-info">
                <span className="pt-st-wallet-name">{PAYMENT_LABELS[type]}</span>
                <span className="pt-st-wallet-addr">
                  {c?.instructions
                    ? (c.instructions.length > 80 ? `${c.instructions.slice(0, 80)}…` : c.instructions)
                    : 'Not configured'}
                </span>
              </div>
              <div className="pt-st-wallet-actions">
                {c && (
                  <button
                    className={`pt-st-toggle ${c.is_active ? 'is-on' : ''}`}
                    title={c.is_active ? 'Active — click to disable' : !c.instructions ? 'Add instructions first' : 'Inactive — click to enable'}
                    onClick={() => toggle(type, c.is_active)}
                    disabled={pending || !c.instructions}
                  />
                )}
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={() => startEditOffPlatform(type)}
                >
                  {c ? 'Edit' : 'Add'}
                </button>
              </div>
              {isEditing && (
                <div className="pt-st-wallet-edit">
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 3 }}>
                      How should customers pay you via {PAYMENT_LABELS[type]}?
                    </div>
                    <textarea
                      className="pt-st-input"
                      rows={3}
                      placeholder={
                        type === 'cashapp'  ? 'Paste your $cashtag (e.g. $alanbusiness)' :
                        type === 'venmo'    ? 'Paste your @username (e.g. @alan-business)' :
                        type === 'zelle'    ? 'Phone or email registered with Zelle' :
                        type === 'wise'     ? 'Email or Wise tag' :
                        type === 'cash'     ? 'Pickup address, hours, who to ask for' :
                        'Payment instructions'
                      }
                      value={instructionsValue}
                      onChange={e => setInstructionsValue(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="pt-btn pt-btn-primary"
                      style={{ fontSize: 11 }}
                      onClick={() => saveOffPlatform(type)}
                      disabled={pending || !instructionsValue.trim()}
                    >
                      Save
                    </button>
                    <button
                      className="pt-btn pt-btn-ghost"
                      style={{ fontSize: 11 }}
                      onClick={() => { setEditing(null); setInstructionsValue('') }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
