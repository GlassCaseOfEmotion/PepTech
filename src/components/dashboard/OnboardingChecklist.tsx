'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'

interface Props {
  hasProducts: boolean
  hasChannel: boolean
  hasPayment: boolean
}

const LS_COLLAPSED = 'pt:checklist-collapsed'
const LS_DISMISSED = 'pt:checklist-dismissed'

function ItemCheck({ done }: { done: boolean }) {
  return done ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7.5" fill="var(--pt-ok)" opacity="0.15"/>
      <circle cx="8" cy="8" r="7.5" stroke="var(--pt-ok)" strokeWidth="1"/>
      <polyline points="4.5,8 7,10.5 11.5,5.5" stroke="var(--pt-ok)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7.5" stroke="var(--pt-line)" strokeWidth="1"/>
    </svg>
  )
}

export function OnboardingChecklist({ hasProducts, hasChannel, hasPayment }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setDismissed(localStorage.getItem(LS_DISMISSED) === 'true')
    setCollapsed(localStorage.getItem(LS_COLLAPSED) === 'true')
    setMounted(true)
  }, [])

  const items = [
    { done: hasProducts, label: 'Add product prices',          hint: 'Update catalog',         href: '/catalog' },
    { done: hasChannel,  label: 'Connect a channel',           hint: 'Settings → Channels',    href: '/settings/channels' },
    { done: hasPayment,  label: 'Configure payment method',    hint: 'Settings → Wallets',     href: '/settings/wallets' },
  ]
  const doneCount = items.filter(i => i.done).length
  const allDone = doneCount === items.length

  function dismiss() {
    localStorage.setItem(LS_DISMISSED, 'true')
    setDismissed(true)
  }

  function toggleCollapse() {
    const next = !collapsed
    localStorage.setItem(LS_COLLAPSED, String(next))
    setCollapsed(next)
  }

  if (!mounted || dismissed || allDone) return null

  return (
    <div className={`pt-gs-widget${collapsed ? ' is-collapsed' : ''}`} role="complementary" aria-label="Getting started">

      {/* ── Collapsed pill ── */}
      {collapsed && (
        <button className="pt-gs-pill" onClick={toggleCollapse} aria-label="Expand getting started checklist">
          <span className="pt-gs-pill-icon">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="6" stroke="currentColor" strokeWidth="1.2"/>
              {doneCount > 0 && (
                <polyline points="3.5,6.5 5.5,8.5 9.5,4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              )}
            </svg>
          </span>
          <span className="pt-gs-pill-label">Getting started</span>
          <span className="pt-gs-pill-count">{doneCount}/{items.length}</span>
          <svg className="pt-gs-pill-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 6.5l3-3 3 3"/>
          </svg>
        </button>
      )}

      {/* ── Expanded card ── */}
      {!collapsed && (
        <div className="pt-gs-card">
          <div className="pt-gs-hd">
            <div>
              <div className="pt-gs-title">Getting started</div>
              <div className="pt-gs-sub">{doneCount} of {items.length} complete</div>
            </div>
            <div className="pt-gs-hd-btns">
              <button className="pt-iconbtn" onClick={toggleCollapse} title="Collapse">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 4l4.5 4.5L11 4"/>
                </svg>
              </button>
              <button className="pt-iconbtn" onClick={dismiss} title="Dismiss">
                <Icons.x size={13} />
              </button>
            </div>
          </div>

          <div className="pt-gs-bar">
            <div className="pt-gs-bar-fill" style={{ width: `${(doneCount / items.length) * 100}%` }} />
          </div>

          <ul className="pt-gs-list">
            {items.map(item => (
              <li key={item.label} className={`pt-gs-item${item.done ? ' is-done' : ''}`}>
                <ItemCheck done={item.done} />
                <div className="pt-gs-item-body">
                  <span className="pt-gs-item-label">{item.label}</span>
                  {!item.done && (
                    <Link href={item.href} className="pt-gs-item-hint">{item.hint} →</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="pt-gs-foot">
            <button
              className="pt-gs-tour-btn"
              onClick={() => window.dispatchEvent(new CustomEvent('pt:tour:open'))}
            >
              ✦ Take a tour
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
