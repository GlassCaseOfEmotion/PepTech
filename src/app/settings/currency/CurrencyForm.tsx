'use client'

import { useState, useTransition } from 'react'
import { saveBaseCurrency } from './actions'

const CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'IDR', label: 'IDR — Indonesian Rupiah (Rp)' },
]

export function CurrencyForm({ baseCurrency }: { baseCurrency: string }) {
  const [value, setValue]   = useState(baseCurrency)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')
  const [pending, start]    = useTransition()

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
          All new order amounts and invoices will use this currency.
          Existing orders are stored with their original currency and are unaffected.
        </p>
      </div>
      {error && <p style={{ fontSize: 12, color: 'var(--pt-danger)', margin: '8px 0 0' }}>{error}</p>}
      {saved && <p style={{ fontSize: 12, color: 'var(--pt-ok)',    margin: '8px 0 0' }}>Saved.</p>}
      <button
        className="pt-btn pt-btn-primary"
        style={{ marginTop: 14 }}
        onClick={save}
        disabled={pending || value === baseCurrency}
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
