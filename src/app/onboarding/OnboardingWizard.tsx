'use client'

import { useState, useTransition } from 'react'
import { saveBusinessType, saveCurrency, seedCatalog, completeOnboarding } from './actions'
import { CATALOG_PRESETS, type BusinessType } from '@/lib/catalog-presets'

const BUSINESS_TYPES = [
  { id: 'peptides'   as BusinessType, label: 'Peptides',           desc: 'Research-grade peptides, GHRPs, GLP-1 analogues', icon: '⬡' },
  { id: 'nootropics' as BusinessType, label: 'Nootropics',          desc: 'Cognitive enhancers, adaptogens, NAD+ compounds',  icon: '◈' },
  { id: 'sarms'      as BusinessType, label: 'SARMs',               desc: 'Selective androgen receptor modulators',            icon: '◆' },
  { id: 'general'    as BusinessType, label: 'General Consumables', desc: 'Vitamins, minerals, herbal supplements',            icon: '◇' },
]

const CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'IDR', label: 'IDR — Indonesian Rupiah' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit' },
  { code: 'THB', label: 'THB — Thai Baht' },
]

export function OnboardingWizard({ initialStep, initialBusinessType, initialCurrency, productCount }: {
  initialStep: number
  initialBusinessType: string | null
  initialCurrency: string
  productCount: number
}) {
  const [step, setStep] = useState(initialStep)
  const [btype, setBtype] = useState<BusinessType | null>(initialBusinessType as BusinessType | null)
  const [currency, setCurrency] = useState(initialCurrency)
  const [seeded, setSeeded] = useState(productCount)
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()

  function handleType(t: BusinessType) {
    setBtype(t); setErr('')
    start(async () => {
      const r = await saveBusinessType(t)
      if (r.error) { setErr(r.error); return }
      setStep(2)
    })
  }

  function handleCurrency() {
    setErr('')
    start(async () => {
      const r = await saveCurrency(currency)
      if (r.error) { setErr(r.error); return }
      setStep(3)
    })
  }

  function handleSeed() {
    if (!btype) return; setErr('')
    start(async () => {
      const r = await seedCatalog(btype)
      if (r.error) { setErr(r.error); return }
      setSeeded(r.count ?? 0)
      setStep(4)
    })
  }

  function handleComplete() {
    start(async () => { await completeOnboarding() })
  }

  const presets = btype ? CATALOG_PRESETS[btype] : []

  return (
    <div className="ob-shell">
      <header className="ob-brand">
        <div className="pt-brand-name">Peptech<span>.</span></div>
      </header>

      <div className="ob-progress">
        {[1, 2, 3, 4].map(n => (
          <div key={n} className={`ob-dot${n < step ? ' is-done' : ''}${n === step ? ' is-current' : ''}`} />
        ))}
      </div>

      <div className="ob-card">
        {step === 1 && (
          <>
            <div className="ob-card-hd">
              <h1 className="ob-title">What do you sell?</h1>
              <p className="ob-sub">We&apos;ll pre-load your catalog with sensible defaults. You can edit everything after.</p>
            </div>
            <div className="ob-type-grid">
              {BUSINESS_TYPES.map(bt => (
                <button key={bt.id}
                  className={`ob-type-card${btype === bt.id ? ' is-selected' : ''}${pending ? ' is-loading' : ''}`}
                  onClick={() => handleType(bt.id)} disabled={pending}>
                  <span className="ob-type-icon">{bt.icon}</span>
                  <span className="ob-type-label">{bt.label}</span>
                  <span className="ob-type-desc">{bt.desc}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="ob-card-hd">
              <h1 className="ob-title">Base currency</h1>
              <p className="ob-sub">Used for order amounts and revenue reporting. You can change this later in Settings.</p>
            </div>
            <div className="ob-field">
              <label className="ob-lbl" htmlFor="ob-currency">Currency</label>
              <select id="ob-currency" className="pt-input" style={{ maxWidth: 300 }}
                value={currency} onChange={e => setCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div className="ob-actions">
              <button className="pt-btn pt-btn-ghost ob-back" onClick={() => setStep(1)}>Back</button>
              <button className="pt-btn pt-btn-primary" onClick={handleCurrency} disabled={pending}>
                {pending ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </>
        )}

        {step === 3 && btype && (
          <>
            <div className="ob-card-hd">
              <h1 className="ob-title">Seed your catalog</h1>
              <p className="ob-sub">
                We&apos;ll add {presets.length} starter products. Prices are set to $0.00 — update them before going live.
              </p>
            </div>
            <ul className="ob-preview-list">
              {presets.map(p => (
                <li key={p.sku} className="ob-preview-item">
                  <span className="ob-preview-sku">{p.sku}</span>
                  <span className="ob-preview-name">{p.name}</span>
                  <span className="ob-preview-price">$0.00</span>
                </li>
              ))}
            </ul>
            <div className="ob-actions">
              <button className="pt-btn pt-btn-ghost ob-back" onClick={() => setStep(2)}>Back</button>
              <button className="pt-btn pt-btn-primary" onClick={handleSeed} disabled={pending}>
                {pending ? 'Adding products…' : `Add ${presets.length} products →`}
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="ob-card-hd">
              <h1 className="ob-title">Connect a channel</h1>
              <p className="ob-sub">Channels let customers reach you and let Peptech send invoices automatically.</p>
            </div>
            <div className="ob-channel-info">
              {[
                { color: 'var(--pt-wa)', name: 'WhatsApp Business', hint: 'Requires Meta Business Manager verification' },
                { color: 'var(--pt-tg)', name: 'Telegram Bot',       hint: 'Ready to connect in Settings → Channels' },
                { color: 'var(--pt-em)', name: 'Email (IMAP)',        hint: 'Connect your business email in Settings → Channels' },
              ].map(ch => (
                <div key={ch.name} className="ob-channel-item">
                  <span className="ob-channel-dot" style={{ background: ch.color }} />
                  <div>
                    <div className="ob-channel-name">{ch.name}</div>
                    <div className="ob-channel-hint">{ch.hint}</div>
                  </div>
                </div>
              ))}
              <p className="ob-channel-note">You can skip this for now and connect channels from Settings at any time.</p>
            </div>
            <div className="ob-actions">
              <button className="pt-btn pt-btn-ghost ob-back" onClick={() => setStep(3)}>Back</button>
              <button className="pt-btn pt-btn-primary" onClick={handleComplete} disabled={pending}>
                {pending ? 'Setting up…' : 'Go to dashboard →'}
              </button>
            </div>
          </>
        )}

        {err && <p className="ob-error">{err}</p>}
      </div>

      {step === 4 && seeded > 0 && (
        <p className="ob-foot-note">{seeded} products added to your catalog.</p>
      )}
    </div>
  )
}
