'use client'

import { useState, useTransition } from 'react'
import { saveBaseCurrency } from './actions'

const CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'IDR', label: 'IDR — Indonesian Rupiah (Rp)' },
]

export function CurrencyForm({ baseCurrency }: { baseCurrency: string }) {
  const [value, setValue]      = useState(baseCurrency)
  const [saved, setSaved]      = useState(false)
  const [error, setError]      = useState('')
  const [pending, start]       = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)

  const save = () => {
    setSaved(false); setError('')
    start(async () => {
      const result = await saveBaseCurrency(value)
      if ('error' in result) { setError(result.error); return }
      setSaved(true)
    })
  }

  return (
    <div className="pt-st-card">
      <div className="pt-st-field">
        <label className="pt-st-lbl">Base currency</label>
        <select
          className="pt-input"
          style={{ maxWidth: 280 }}
          value={value}
          onChange={e => { setValue(e.target.value); setSaved(false) }}
        >
          {CURRENCIES.map(c => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        <p style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 6 }}>
          Changing currency resets customer LTV to 0 — it rebuilds as new orders arrive. Existing order history is preserved.
        </p>
      </div>
      {error && <p style={{ fontSize: 12, color: 'var(--pt-danger)', margin: '8px 0 0' }}>{error}</p>}
      {saved && <p style={{ fontSize: 12, color: 'var(--pt-ok)',    margin: '8px 0 0' }}>Saved.</p>}
      <button
        className="pt-btn pt-btn-primary"
        style={{ marginTop: 14 }}
        onClick={() => setShowConfirm(true)}
        disabled={pending || value === baseCurrency}
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      {showConfirm && value !== baseCurrency && (
        <div className="pt-modal-backdrop" onClick={() => setShowConfirm(false)}>
          <div className="pt-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>Change base currency to {value}?</h3>
            <p style={{ fontSize: 13, color: 'var(--pt-fg-3)', margin: '10px 0 18px' }}>
              All existing order amounts will be excluded from customer LTV calculations.
              Customer LTV will reset to 0 and rebuild as new orders come in.
              Order history is preserved and unaffected.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="pt-btn pt-btn-ghost" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button
                className="pt-btn pt-btn-primary"
                disabled={pending}
                onClick={() => { setShowConfirm(false); save() }}
              >
                {pending ? 'Saving…' : 'Confirm change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
