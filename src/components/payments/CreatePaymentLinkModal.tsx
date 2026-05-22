// src/components/payments/CreatePaymentLinkModal.tsx
'use client'

import { useState } from 'react'
import type { ReactElement } from 'react'
import { Icons } from '@/lib/icons'

function QrPlaceholder({ size = 124 }: { size?: number }) {
  const cells = 21
  const cellSize = size / cells
  const fixedPattern = (i: number, j: number) => {
    if ((i < 7 && j < 7) || (i < 7 && j > 13) || (i > 13 && j < 7)) {
      const xi = i > 13 ? i - 14 : i
      const xj = j > 13 ? j - 14 : j
      const ii = i > 13 ? xi : (i < 7 ? i : 0)
      const jj = j > 13 ? xj : (j < 7 ? j : 0)
      return (ii === 0 || ii === 6 || jj === 0 || jj === 6) ? 1
           : (ii >= 2 && ii <= 4 && jj >= 2 && jj <= 4) ? 1 : 0
    }
    return ((i * 31 + j * 17 + i * j * 3) % 7) < 3 ? 1 : 0
  }
  const rects: ReactElement[] = []
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      if (fixedPattern(i, j)) {
        rects.push(<rect key={`${i}-${j}`} x={j * cellSize} y={i * cellSize} width={cellSize + 0.3} height={cellSize + 0.3} fill="#111" />)
      }
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="#fff" />
      {rects}
      <rect x={size / 2 - 12} y={size / 2 - 12} width={24} height={24} fill="#fff" />
      <rect x={size / 2 - 9} y={size / 2 - 9} width={18} height={18} rx={4} fill="oklch(0.20 0.01 100)" />
    </svg>
  )
}

type AssetKey = 'USDT' | 'BTC' | 'XMR'

const ASSET_OPTIONS: { a: AssetKey; chain: string; net: string }[] = [
  { a: 'USDT', chain: 'TRC20',   net: '~$1.30 fee · 1-2 min'  },
  { a: 'BTC',  chain: 'Mainnet', net: '~$2.40 fee · ~30 min'  },
  { a: 'XMR',  chain: 'Mainnet', net: '~$0.80 fee · ~20 min'  },
]

const EXPIRY_OPTIONS = ['1h', '6h', '24h', '7d', 'never'] as const

export function CreateComposer({ onBack }: { onBack: () => void }) {
  const [assets, setAssets] = useState<Record<AssetKey, boolean>>({ USDT: true, BTC: true, XMR: false })
  const [expiry, setExpiry] = useState<string>('24h')

  const toggle = (a: AssetKey) => setAssets(s => ({ ...s, [a]: !s[a] }))
  const selectedAssets = (Object.keys(assets) as AssetKey[]).filter(a => assets[a])

  return (
    <div className="pay-comp">
      <div className="pay-comp-side">
        <button
          className="pt-btn pt-btn-ghost"
          onClick={onBack}
          style={{ padding: '3px 8px', fontSize: 11, marginBottom: 14 }}
        >
          ← Back
        </button>
        <h2>Request payment</h2>
        <p className="sub">Create a checkout URL. The customer pays in crypto; funds land in your Vault.</p>

        <div className="pay-comp-section">
          <h4>Amount</h4>
          <div className="pay-comp-input is-amt">
            <span className="cur">$</span>
            <input defaultValue="330.00" />
            <span className="ccy">USD</span>
          </div>
          <div className="hint">Rate locked when customer opens link · 15-min quote refresh</div>
        </div>

        <div className="pay-comp-section">
          <h4>For</h4>
          <div className="pay-comp-field">
            <label>Customer</label>
            <div className="pay-comp-input">
              <Icons.user size={13} />
              <input defaultValue="K. (gymrat_84)" />
              <span style={{ fontFamily: 'var(--pt-mono)', fontSize: 10.5, color: 'var(--pt-fg-4)' }}>+1 ••• 4421 · wa</span>
            </div>
          </div>
          <div className="pay-comp-field">
            <label>Memo (customer sees this)</label>
            <div className="pay-comp-input">
              <input defaultValue="Reta 10mg ×2 — gymrat_84" />
            </div>
          </div>
          <div className="pay-comp-field">
            <label>Attach to order (optional)</label>
            <div className="pay-comp-input">
              <Icons.box size={13} />
              <input defaultValue="A-2244 · Reta 10mg ×2" />
              <Icons.arrowDn size={11} />
            </div>
          </div>
        </div>

        <div className="pay-comp-section">
          <h4>Accepted assets</h4>
          <div className="pay-comp-assets">
            {ASSET_OPTIONS.map(o => (
              <button
                key={o.a}
                className={`pay-comp-asset${assets[o.a] ? ' is-on' : ''}`}
                onClick={() => toggle(o.a)}
              >
                <span className="check">{assets[o.a] && <Icons.check size={10} />}</span>
                <span className="info">
                  <span className="lbl">{o.a} <span style={{ color: 'var(--pt-fg-4)', fontWeight: 400 }}>· {o.chain}</span></span>
                  <span className="meta">{o.net}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="pay-comp-section">
          <h4>Expires after</h4>
          <div className="pay-comp-segctl">
            {EXPIRY_OPTIONS.map(e => (
              <button key={e} className={expiry === e ? 'is-on' : ''} onClick={() => setExpiry(e)}>{e}</button>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>Unpaid link expires automatically; you can extend anytime.</div>
        </div>

        <div className="pay-comp-section">
          <h4>Advanced</h4>
          <div className="pay-comp-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ marginBottom: 0 }}>Auto-settle to cold &gt; $1k</label>
              <span style={{ width: 32, height: 18, background: 'var(--pt-accent)', borderRadius: 999, position: 'relative', display: 'inline-block' }}>
                <span style={{ position: 'absolute', right: 2, top: 2, width: 14, height: 14, background: '#fff', borderRadius: '50%' }} />
              </span>
            </div>
          </div>
          <div className="pay-comp-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ marginBottom: 0 }}>Notify on open (push)</label>
              <span style={{ width: 32, height: 18, background: 'var(--pt-accent)', borderRadius: 999, position: 'relative', display: 'inline-block' }}>
                <span style={{ position: 'absolute', right: 2, top: 2, width: 14, height: 14, background: '#fff', borderRadius: '50%' }} />
              </span>
            </div>
          </div>
        </div>

        <div className="pay-comp-cta">
          <button className="pt-btn pt-btn-ghost">Save as draft</button>
          <button className="pt-btn pt-btn-primary">Create &amp; send via WhatsApp →</button>
        </div>
      </div>

      <div className="pay-comp-pv">
        <h4>Preview · checkout URL</h4>
        <div className="pay-comp-url">
          <Icons.lock size={12} style={{ color: 'var(--pt-ok)' }} />
          <span className="u">pay.peptech.app/dr_peptide/pl_4Q9F</span>
          <button>copy</button>
        </div>

        <h4>Share via</h4>
        <div className="pay-comp-send">
          <button className="pay-comp-send-btn"><Icons.wa size={13} /> WhatsApp</button>
          <button className="pay-comp-send-btn"><Icons.tg size={13} /> Telegram</button>
          <button className="pay-comp-send-btn"><Icons.em size={13} /> Email</button>
          <button className="pay-comp-send-btn"><Icons.doc size={13} /> Copy link</button>
        </div>

        <h4>QR code</h4>
        <div style={{ background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'center' }}>
          <QrPlaceholder size={140} />
        </div>

        <h4>What the customer will see</h4>
        <div style={{ background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>dr_peptide requests</div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--pt-mono)', fontSize: 16, color: 'var(--pt-fg-3)' }}>$</span>330.00{' '}
            <span style={{ fontFamily: 'var(--pt-mono)', fontSize: 12, color: 'var(--pt-fg-3)' }}>USD</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--pt-fg-2)', marginTop: 5 }}>Reta 10mg ×2 — gymrat_84</div>
          <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 10, display: 'flex', gap: 8 }}>
            <span>Pay in:</span>
            {selectedAssets.map(a => (
              <span key={a} data-asset={a} style={{ fontFamily: 'var(--pt-mono)', fontSize: 9.5, fontWeight: 600 }}>{a}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
