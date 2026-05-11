'use client'

import { useState, useTransition } from 'react'
import { upsertPaymentConfig, togglePaymentConfig } from '@/app/settings/wallets/actions'
import { PAYMENT_METHODS, PAYMENT_LABELS } from '@/types/payments'
import type { TenantPaymentConfig } from '@/types/payments'

const CRYPTO_TYPES = PAYMENT_METHODS.filter(m => m !== 'bank_transfer')

function maskAddress(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

export function WalletsForm({ configs }: { configs: TenantPaymentConfig[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [bankForm, setBankForm] = useState({
    bankName: '', accountName: '', accountNumber: '', sortCode: '', iban: '',
  })
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const cfg = (type: string) => configs.find(c => c.type === type) ?? null

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
    if (!bankForm.accountName.trim()) { setError('Account name is required'); return }
    if (!bankForm.sortCode.trim() && !bankForm.iban.trim()) { setError('Sort code or IBAN is required'); return }
    setError('')
    startTransition(async () => {
      const r = await upsertPaymentConfig({
        type: 'bank_transfer',
        bankName: bankForm.bankName || undefined,
        accountName: bankForm.accountName,
        accountNumber: bankForm.accountNumber || undefined,
        sortCode: bankForm.sortCode || undefined,
        iban: bankForm.iban || undefined,
      })
      if ('error' in r) { setError(r.error); return }
      setEditing(null)
    })
  }

  const toggle = (type: string, current: boolean) => {
    startTransition(async () => { await togglePaymentConfig(type, !current) })
  }

  const startEditBank = () => {
    const c = cfg('bank_transfer')
    setBankForm({
      bankName: c?.bank_name ?? '', accountName: c?.account_name ?? '',
      accountNumber: c?.account_number ?? '', sortCode: c?.sort_code ?? '', iban: c?.iban ?? '',
    })
    setEditing('bank_transfer'); setError('')
  }

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>Wallets &amp; assets</h2>
          <p>Configure the payment methods you accept. Only active methods appear on orders.</p>
        </div>
      </div>

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
                    title={c.is_active ? 'Active — click to disable' : 'Inactive — click to enable'}
                    onClick={() => toggle(type, c.is_active)}
                    disabled={pending}
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
                  {c
                    ? `${c.account_name ?? ''}${c.sort_code ? ` · Sort: ${c.sort_code}` : ''}${c.iban ? ` · ${c.iban.slice(0, 8)}…` : ''}`
                    : 'Not configured'}
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
    </div>
  )
}
