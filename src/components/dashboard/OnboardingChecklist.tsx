'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'

interface Props {
  hasProducts: boolean
  hasChannel: boolean
  hasPayment: boolean
}

export function OnboardingChecklist({ hasProducts, hasChannel, hasPayment }: Props) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const items = [
    { done: hasProducts, label: 'Add product prices',          hint: 'Update catalog',          href: '/catalog' },
    { done: hasChannel,  label: 'Connect a messaging channel', hint: 'Settings → Channels',     href: '/settings/channels' },
    { done: hasPayment,  label: 'Configure payment method',    hint: 'Settings → Wallets',      href: '/settings/wallets' },
  ]
  const doneCount = items.filter(i => i.done).length
  if (doneCount === items.length) return null

  return (
    <section className="pt-card">
      <div className="pt-card-hd">
        <div>
          <span className="pt-card-title">Getting started</span>
          <span className="pt-card-sub" style={{ marginLeft: 8 }}>{doneCount} of {items.length} complete</span>
        </div>
        <button className="pt-iconbtn" onClick={() => setDismissed(true)} title="Dismiss">
          <Icons.x size={13} />
        </button>
      </div>
      <div className="pt-card-body" style={{ padding: 0 }}>
        <ul className="ob-cl-list">
          {items.map(item => (
            <li key={item.label} className={`ob-cl-item${item.done ? ' is-done' : ''}`}>
              <span className="ob-cl-check">
                {item.done
                  ? <svg width="13" height="13" viewBox="0 0 13 13"><circle cx="6.5" cy="6.5" r="6" fill="var(--pt-ok)"/><polyline points="3.5,6.5 5.5,8.5 9.5,4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <svg width="13" height="13" viewBox="0 0 13 13"><circle cx="6.5" cy="6.5" r="6" stroke="var(--pt-line)" strokeWidth="1" fill="none"/></svg>
                }
              </span>
              <div className="ob-cl-body">
                <span className="ob-cl-label">{item.label}</span>
                {!item.done && <Link href={item.href} className="ob-cl-hint">{item.hint} →</Link>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
