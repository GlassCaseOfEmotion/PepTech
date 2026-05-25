'use client'

import { useState, useEffect } from 'react'
import { OnboardingWizard } from './OnboardingWizard'
import { OnboardingAgent } from './OnboardingAgent'

const STORAGE_KEY = 'pt-onboarding-mode'

interface OnboardingState {
  display_name: string | null
  timezone: string | null
  timezone_asked: boolean
  business_type: string | null
  base_currency: string | null
  currency_asked: boolean
  intended_channels: string[]
  product_count: number
  payments_configured: boolean
  complete: boolean
}

export function OnboardingShell({
  initialStep,
  initialBusinessType,
  initialCurrency,
  productCount,
  businessName,
  displayName,
  initialTimezone,
  initialChannels,
}: {
  initialStep: number
  initialBusinessType: string | null
  initialCurrency: string
  productCount: number
  businessName: string
  displayName: string
  initialTimezone: string
  initialChannels: string[]
}) {
  // Default to agent mode. Reads localStorage on mount to honor previous choice.
  const [mode, setMode] = useState<'agent' | 'classic'>('agent')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'agent' || stored === 'classic') setMode(stored)
    } catch { /* ignore */ }
    setHydrated(true)
  }, [])

  const switchMode = (next: 'agent' | 'classic') => {
    setMode(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }

  // Avoid SSR/CSR mismatch flash — wait for hydration before deciding which view to render
  if (!hydrated) {
    return <div className="ob-shell" style={{ visibility: 'hidden' }} />
  }

  if (mode === 'classic') {
    return (
      <>
        <ModeToggle current="classic" onChange={switchMode} />
        <OnboardingWizard
          initialStep={initialStep}
          initialBusinessType={initialBusinessType}
          initialCurrency={initialCurrency}
          productCount={productCount}
          businessName={businessName}
          displayName={displayName}
          initialTimezone={initialTimezone}
        />
      </>
    )
  }

  // Seed the *_asked flags from heuristics: a non-default value is the
  // strongest signal we have on first load that the user has previously
  // answered. Empty channels means we definitely haven't asked yet.
  const agentState: OnboardingState = {
    display_name:      displayName || null,
    timezone:          initialTimezone === 'UTC' ? null : initialTimezone,
    timezone_asked:    initialTimezone !== 'UTC' && !!initialTimezone,
    business_type:     initialBusinessType,
    base_currency:     initialCurrency,
    currency_asked:    initialCurrency !== 'USD' && !!initialCurrency,
    intended_channels:   initialChannels,
    product_count:       productCount,
    payments_configured: false,
    complete:            false,
  }

  return (
    <>
      <ModeToggle current="agent" onChange={switchMode} />
      <OnboardingAgent
        initialState={agentState}
        businessName={businessName}
        onSwitchToClassic={() => switchMode('classic')}
      />
    </>
  )
}

function ModeToggle({ current, onChange }: { current: 'agent' | 'classic'; onChange: (m: 'agent' | 'classic') => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 14,
        right: 16,
        zIndex: 50,
        display: 'inline-flex',
        gap: 2,
        padding: 3,
        background: 'rgba(20, 20, 24, 0.55)',
        backdropFilter: 'blur(8px)',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.08)',
        fontSize: 11,
      }}
    >
      {(['agent', 'classic'] as const).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={{
            border: 'none',
            background: current === m ? 'rgba(255,255,255,0.14)' : 'transparent',
            color: current === m ? '#fff' : 'rgba(255,255,255,0.6)',
            padding: '5px 11px',
            borderRadius: 999,
            cursor: 'pointer',
            fontWeight: 500,
            letterSpacing: 0.2,
            textTransform: 'uppercase',
          }}
        >
          {m === 'agent' ? 'Agent' : 'Classic'}
          {m === 'agent' && <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 9 }}>v0.2</span>}
        </button>
      ))}
    </div>
  )
}
