'use client'

import { useState, useTransition, useEffect } from 'react'
import { saveBusinessType, saveCurrency, seedCatalog, completeOnboarding, saveChannelIntent, saveProfile } from './actions'
import { CATALOG_PRESETS, type BusinessType, type PresetProduct } from '@/lib/catalog-presets'

const TIMEZONES = [
  { value: 'Pacific/Honolulu',    label: 'Hawaii (UTC−10)' },
  { value: 'America/Anchorage',   label: 'Alaska (UTC−9)' },
  { value: 'America/Los_Angeles', label: 'Pacific (UTC−8/−7)' },
  { value: 'America/Denver',      label: 'Mountain (UTC−7/−6)' },
  { value: 'America/Chicago',     label: 'Central (UTC−6/−5)' },
  { value: 'America/New_York',    label: 'Eastern (UTC−5/−4)' },
  { value: 'America/Sao_Paulo',   label: 'São Paulo (UTC−3)' },
  { value: 'Europe/London',       label: 'London (UTC+0/+1)' },
  { value: 'Europe/Amsterdam',    label: 'Amsterdam (UTC+1/+2)' },
  { value: 'Europe/Lisbon',       label: 'Lisbon (UTC+0/+1)' },
  { value: 'Europe/Istanbul',     label: 'Istanbul (UTC+3)' },
  { value: 'Asia/Dubai',          label: 'Dubai (UTC+4)' },
  { value: 'Asia/Karachi',        label: 'Karachi (UTC+5)' },
  { value: 'Asia/Kolkata',        label: 'Mumbai / Delhi (UTC+5:30)' },
  { value: 'Asia/Bangkok',        label: 'Bangkok (UTC+7)' },
  { value: 'Asia/Singapore',      label: 'Singapore (UTC+8)' },
  { value: 'Asia/Shanghai',       label: 'Beijing / Shanghai (UTC+8)' },
  { value: 'Asia/Tokyo',          label: 'Tokyo (UTC+9)' },
  { value: 'Australia/Sydney',    label: 'Sydney (UTC+10/+11)' },
  { value: 'Pacific/Auckland',    label: 'Auckland (UTC+12/+13)' },
  { value: 'UTC',                 label: 'UTC' },
]

const VALID_TZ_VALUES = new Set(TIMEZONES.map(t => t.value))

const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp Business', dot: '#25d366', hint: 'Most popular with customers' },
  { id: 'telegram', label: 'Telegram Bot',       dot: '#2aabee', hint: 'Fast & reliable' },
  { id: 'email',    label: 'Email (IMAP/OAuth)',  dot: '#8b97a8', hint: 'Connect your business inbox' },
]
const COMING_SOON = [
  { label: 'Instagram DMs', dot: '#e1306c' },
  { label: 'Signal',        dot: '#3a76f0' },
  { label: 'SMS',           dot: '#888' },
]

const FAMILY_COLORS: Record<string, string> = {
  'GLP-1':    '#5b9bd5',
  'HEALING':  '#5db87a',
  'GH':       '#d4902e',
  'COSMETIC': '#d47aaa',
  'NEURO':    '#9b7dd4',
  'MITO':     '#5dbdb8',
}

const BIZ_TYPES: Array<{ id: BusinessType; label: string; desc: string; color: string }> = [
  { id: 'peptides',   label: 'Peptides',           desc: 'GLP-1s, healing, GH, cosmetic & mitochondrial peptides', color: '#5b9bd5' },
  { id: 'nootropics', label: 'Nootropics',          desc: 'Cognitive enhancers, adaptogens, NAD+ compounds',        color: '#5db87a' },
  { id: 'sarms',      label: 'SARMs',               desc: 'Selective androgen receptor modulators',                  color: '#d4902e' },
  { id: 'general',    label: 'General Consumables', desc: 'Vitamins, minerals & monthly health supplements',         color: '#9b7dd4' },
]

const CURRENCIES = [
  { code: 'USD', symbol: '$',  label: 'US Dollar' },
  { code: 'EUR', symbol: '€',  label: 'Euro' },
  { code: 'GBP', symbol: '£',  label: 'British Pound' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
  { code: 'IDR', symbol: 'Rp', label: 'Indonesian Rupiah' },
  { code: 'MYR', symbol: 'RM', label: 'Malaysian Ringgit' },
  { code: 'THB', symbol: '฿',  label: 'Thai Baht' },
]

const CHAPTER = [
  { tag: '',         lines: ['Your store,', 'your way.'],   sub: 'Set up in minutes.' },
  { tag: '01 / 04',  lines: ['Your',  'Business.'],         sub: 'Choose your category so we can tailor your setup.' },
  { tag: '02 / 04',  lines: ['Your',  'Currency.'],         sub: 'Set your base currency for all orders and reporting.' },
  { tag: '03 / 04',  lines: ['Your',  'Catalog.'],          sub: 'A starter product list, ready to customise.' },
  { tag: '04 / 04',  lines: ['Stay',  'Connected.'],        sub: 'Connect channels to start receiving orders.' },
]

const STEP_LABELS = ['', 'Business', 'Currency', 'Catalog', 'Channels']

function Check() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function OnboardingWizard({
  initialStep, initialBusinessType, initialCurrency, productCount, businessName, displayName, initialTimezone,
}: {
  initialStep: number
  initialBusinessType: string | null
  initialCurrency: string
  productCount: number
  businessName: string
  displayName: string
  initialTimezone: string
}) {
  const [step, setStep] = useState(initialStep)
  const [btype, setBtype] = useState<BusinessType | null>(initialBusinessType as BusinessType | null)
  const [currency, setCurrency] = useState(initialCurrency)
  const [seeded, setSeeded] = useState(productCount)
  const [err, setErr] = useState('')
  const [completing, setCompleting] = useState(false)
  const [pending, start] = useTransition()
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(
    () => new Set((initialBusinessType ? CATALOG_PRESETS[initialBusinessType as BusinessType] : []).map(p => p.sku))
  )
  const [intendedChannels, setIntendedChannels] = useState<Set<string>>(new Set(['whatsapp']))
  const [profileName, setProfileName] = useState(displayName ?? '')
  const [timezone, setTimezone] = useState(initialTimezone || 'UTC')

  // Auto-detect browser timezone on first render if not already set
  useEffect(() => {
    if (!initialTimezone || initialTimezone === 'UTC') {
      try {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (VALID_TZ_VALUES.has(detected)) setTimezone(detected)
      } catch { /* non-fatal */ }
    }
  }, [initialTimezone])

  const chapter = CHAPTER[step] ?? CHAPTER[1]
  const presets = btype ? CATALOG_PRESETS[btype] : []
  const families = [...new Set(presets.map(p => p.product_family))]
  const firstName = (profileName || displayName)?.split(' ')[0] ?? ''

  function toggleSku(sku: string) {
    setSelectedSkus(prev => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku); else next.add(sku)
      return next
    })
  }

  function toggleChannel(id: string) {
    setIntendedChannels(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleProfile() {
    if (!profileName.trim()) return
    setErr('')
    start(async () => {
      const r = await saveProfile(profileName.trim(), timezone)
      if (r.error) { setErr(r.error); return }
      setStep(1)
    })
  }

  function handleType(t: BusinessType) {
    setBtype(t); setErr('')
    setSelectedSkus(new Set(CATALOG_PRESETS[t].map(p => p.sku)))
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
      const r = await seedCatalog(btype, [...selectedSkus])
      if (r.error) { setErr(r.error); return }
      setSeeded(r.count ?? 0)
      setStep(4)
    })
  }

  function handleComplete() {
    setCompleting(true)
    start(async () => {
      await saveChannelIntent([...intendedChannels]).catch(() => {})
      await completeOnboarding()
    })
  }

  return (
    <div className="ob-shell">

      {/* ── Left panel ── */}
      <aside className="ob-left" aria-hidden="true">
        <div className="ob-glows">
          <div className="ob-glow ob-glow-a" />
          <div className="ob-glow ob-glow-b" />
        </div>
        <div className="ob-dots" />
        <div className="ob-left-inner">

          {/* Logo */}
          <div className="ob-logo">
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
              <polygon points="11,1.5 20,6.5 20,15.5 11,20.5 2,15.5 2,6.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <circle cx="11" cy="11" r="2.5" fill="currentColor"/>
              <line x1="11" y1="4" x2="11" y2="8.5" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
              <line x1="11" y1="13.5" x2="11" y2="18" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
            </svg>
            <span>Peptech</span>
          </div>

          {/* Chapter — key forces re-animation on step change */}
          <div className="ob-chapter" key={`ch-${step}`}>
            {chapter.tag && <div className="ob-ch-tag">{chapter.tag}</div>}
            <h2 className="ob-ch-title">
              {chapter.lines.map((l, i) => <span key={i}>{l}</span>)}
            </h2>
            {chapter.sub && <p className="ob-ch-sub">{chapter.sub}</p>}
          </div>

          {/* Stepper — only visible on steps 1–4 */}
          {step >= 1 && (
            <nav className="ob-stepper">
              {[1,2,3,4].map(n => (
                <div key={n} className={`ob-si${n < step ? ' done' : ''}${n === step ? ' active' : ''}`}>
                  <div className="ob-si-dot">
                    {n < step ? <Check /> : <span>{n}</span>}
                  </div>
                  <span className="ob-si-label">{STEP_LABELS[n]}</span>
                  {n < 4 && <div className="ob-si-line" />}
                </div>
              ))}
            </nav>
          )}

        </div>
      </aside>

      {/* ── Right panel ── */}
      <main className="ob-right">

        {/* Completion state */}
        {completing && (
          <div className="ob-step ob-completing" key="done">
            <div className="ob-completing-ring">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="21" stroke="var(--pt-ok)" strokeWidth="1.5" opacity="0.25"/>
                <circle cx="24" cy="24" r="21" stroke="var(--pt-ok)" strokeWidth="2" strokeDasharray="132" strokeDashoffset="0"/>
                <polyline points="14,24 20,30 34,17" stroke="var(--pt-ok)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="ob-completing-h">You&apos;re all set!</h2>
            <p className="ob-completing-p">Taking you to your dashboard…</p>
          </div>
        )}

        {/* Step 0: Profile — name + timezone */}
        {!completing && step === 0 && (
          <div className="ob-step" key="welcome">
            <p className="ob-eyebrow">Welcome to Peptech</p>
            <h2 className="ob-greet-h" key={firstName}>
              {firstName
                ? <>Hey, <span className="ob-accent-name">{firstName}!</span> 👋</>
                : <>Hey there! 👋</>}
            </h2>
            <p className="ob-welcome-biz">{businessName}</p>

            <div className="ob-profile-form">
              <label className="ob-profile-label">How should we address you?</label>
              <input
                className="ob-profile-input"
                type="text"
                placeholder="Your first name"
                value={profileName}
                maxLength={80}
                autoFocus
                onChange={e => setProfileName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && profileName.trim()) handleProfile() }}
              />
              <div className="ob-tz-row">
                <label className="ob-tz-label">Your timezone</label>
                <select
                  className="pt-input ob-tz-select"
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {err && <p className="ob-err">{err}</p>}

            <button
              className="ob-btn ob-btn-primary ob-btn-full"
              onClick={handleProfile}
              disabled={pending || !profileName.trim()}
            >
              {pending ? 'Saving…' : "Let's begin →"}
            </button>
          </div>
        )}

        {/* Step 1: Business type */}
        {!completing && step === 1 && (
          <div className="ob-step" key="type">
            <div className="ob-step-hd">
              <h2 className="ob-step-title">What do you sell?</h2>
              <p className="ob-step-sub">We&apos;ll pre-load a starter catalog for your category. You can edit everything after.</p>
            </div>
            <div className="ob-type-list">
              {BIZ_TYPES.map((bt, i) => (
                <button key={bt.id}
                  className={`ob-type-row${btype === bt.id ? ' sel' : ''}${pending ? ' busy' : ''}`}
                  onClick={() => handleType(bt.id)}
                  disabled={pending}
                >
                  <span className="ob-type-dot" style={{ background: bt.color }} />
                  <div className="ob-type-body">
                    <span className="ob-type-name">{bt.label}</span>
                    <span className="ob-type-desc">{bt.desc}</span>
                  </div>
                  <span className="ob-type-idx">{String(i + 1).padStart(2, '0')}</span>
                  {btype === bt.id && <span className="ob-type-check"><Check /></span>}
                </button>
              ))}
            </div>
            {err && <p className="ob-err">{err}</p>}
          </div>
        )}

        {/* Step 2: Currency */}
        {!completing && step === 2 && (
          <div className="ob-step" key="currency">
            <div className="ob-step-hd">
              <h2 className="ob-step-title">Base currency</h2>
              <p className="ob-step-sub">Used for all orders, invoices and revenue reporting. Changeable later in Settings.</p>
            </div>
            <div className="ob-cur-grid">
              {CURRENCIES.map(c => (
                <button key={c.code}
                  className={`ob-cur-opt${currency === c.code ? ' sel' : ''}`}
                  onClick={() => setCurrency(c.code)}
                >
                  <span className="ob-cur-sym">{c.symbol}</span>
                  <div>
                    <div className="ob-cur-code">{c.code}</div>
                    <div className="ob-cur-label">{c.label}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="ob-foot">
              <button className="ob-btn ob-btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="ob-btn ob-btn-primary" onClick={handleCurrency} disabled={pending}>
                {pending ? 'Saving…' : 'Continue →'}
              </button>
            </div>
            {err && <p className="ob-err">{err}</p>}
          </div>
        )}

        {/* Step 3: Peptide selector */}
        {!completing && step === 3 && btype === 'peptides' && (
          <div className="ob-step ob-step-wide" key="catalog-peptides">
            <div className="ob-step-hd">
              <h2 className="ob-step-title">Pick your peptides</h2>
              <p className="ob-step-sub">
                Choose which products to start with. Each comes pre-loaded with a research-backed dosing protocol you can edit anytime.
              </p>
            </div>

            <div className="ob-peptide-grid">
              {families.map(fam => {
                const famPresets = presets.filter(p => p.product_family === fam)
                const famColor = FAMILY_COLORS[fam] ?? '#888'
                const famSelCount = famPresets.filter(p => selectedSkus.has(p.sku)).length
                return (
                  <div key={fam} className="ob-fam-section">
                    <div className="ob-fam-hd">
                      <span className="ob-fam-accent" style={{ background: famColor }} />
                      {fam}
                      <span className="ob-fam-tally">{famSelCount}/{famPresets.length}</span>
                    </div>
                    <div className="ob-peptide-cards">
                      {famPresets.map(p => {
                        const sel = selectedSkus.has(p.sku)
                        const proto = (p as PresetProduct).protocol
                        return (
                          <button
                            key={p.sku}
                            className={`ob-peptide-card${sel ? ' sel' : ''}`}
                            style={{ '--fam-color': famColor } as React.CSSProperties}
                            onClick={() => toggleSku(p.sku)}
                            title={p.description ?? p.name}
                          >
                            <div className="ob-peptide-check">{sel && <Check />}</div>
                            <div className="ob-peptide-name">{p.name}</div>
                            <div className="ob-peptide-sku">{p.sku}</div>
                            {p.description && <div className="ob-peptide-desc">{p.description}</div>}
                            {proto && (
                              <div className="ob-peptide-dose">
                                <span className="ob-peptide-dose-dot" />
                                {proto.dose_display} · {proto.cycle_length_weeks}w
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="ob-peptide-bar">
              <span className="ob-peptide-count">
                <strong>{selectedSkus.size}</strong> of {presets.length} selected
              </span>
              <button className="ob-sel-all" onClick={() =>
                setSelectedSkus(selectedSkus.size === presets.length
                  ? new Set()
                  : new Set(presets.map(p => p.sku)))
              }>
                {selectedSkus.size === presets.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="ob-foot">
              <button className="ob-btn ob-btn-ghost" onClick={() => setStep(2)}>← Back</button>
              <button className="ob-btn ob-btn-primary" onClick={handleSeed} disabled={pending || selectedSkus.size === 0}>
                {pending ? 'Adding products…' : `Add ${selectedSkus.size} product${selectedSkus.size !== 1 ? 's' : ''} →`}
              </button>
            </div>
            {err && <p className="ob-err">{err}</p>}
          </div>
        )}

        {/* Step 3: Non-peptide catalog (simple list) */}
        {!completing && step === 3 && btype && btype !== 'peptides' && (
          <div className="ob-step" key="catalog">
            <div className="ob-step-hd">
              <h2 className="ob-step-title">Your starter catalog</h2>
              <p className="ob-step-sub">
                {presets.length} products across {families.length} {families.length === 1 ? 'category' : 'categories'}.
                Prices are $0.00 — update them before going live.
              </p>
            </div>
            <div className="ob-catalog">
              {families.map(fam => (
                <div key={fam} className="ob-cat-group">
                  <div className="ob-cat-fam">{fam}</div>
                  {presets.filter(p => p.product_family === fam).map(p => (
                    <div key={p.sku} className="ob-cat-row">
                      <span className="ob-cat-sku">{p.sku}</span>
                      <span className="ob-cat-name">{p.name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="ob-foot">
              <button className="ob-btn ob-btn-ghost" onClick={() => setStep(2)}>← Back</button>
              <button className="ob-btn ob-btn-primary" onClick={handleSeed} disabled={pending}>
                {pending ? 'Adding products…' : `Add ${presets.length} products →`}
              </button>
            </div>
            {err && <p className="ob-err">{err}</p>}
          </div>
        )}

        {/* Step 4: Channel intent */}
        {!completing && step === 4 && (
          <div className="ob-step" key="channels">
            <div className="ob-step-hd">
              <h2 className="ob-step-title">How will you reach customers?</h2>
              <p className="ob-step-sub">
                Pick the channels you plan to use. You&apos;ll connect them in Settings — it takes about 2 minutes each.
              </p>
            </div>

            <div className="ob-ch-chips">
              {CHANNELS.map(ch => {
                const sel = intendedChannels.has(ch.id)
                return (
                  <button
                    key={ch.id}
                    className={`ob-ch-chip${sel ? ' sel' : ''}`}
                    onClick={() => toggleChannel(ch.id)}
                  >
                    <span className="ob-ch-chip-dot" style={{ background: ch.dot }} />
                    <div className="ob-ch-chip-body">
                      <div className="ob-ch-chip-name">{ch.label}</div>
                      <div className="ob-ch-chip-hint">{ch.hint}</div>
                    </div>
                    <div className="ob-ch-chip-check">{sel && <Check />}</div>
                  </button>
                )
              })}
            </div>

            <div className="ob-ch-coming-list">
              {COMING_SOON.map(ch => (
                <div key={ch.label} className="ob-ch-coming">
                  <span className="ob-ch-coming-dot" style={{ background: ch.dot }} />
                  {ch.label}
                  <span className="ob-ch-soon-badge">Soon</span>
                </div>
              ))}
            </div>

            {seeded > 0 && (
              <div className="ob-toast">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="6.5" cy="6.5" r="6" fill="var(--pt-ok)"/>
                  <polyline points="3.5,6.5 5.5,8.5 9.5,4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {seeded} products added to your catalog
              </div>
            )}

            <div className="ob-foot">
              <button className="ob-btn ob-btn-ghost" onClick={() => setStep(3)}>← Back</button>
              <button className="ob-btn ob-btn-primary" onClick={handleComplete} disabled={pending || completing}>
                {pending ? 'Setting up…' : 'Save & go to dashboard →'}
              </button>
            </div>
            {err && <p className="ob-err">{err}</p>}
          </div>
        )}

      </main>
    </div>
  )
}
