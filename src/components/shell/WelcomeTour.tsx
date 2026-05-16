'use client'

import { useState, useEffect, useCallback } from 'react'

const STEPS = [
  {
    selector: '[data-tour="search"]',
    title: 'Command palette',
    body: 'Press ⌘K (or Ctrl+K) from anywhere to instantly search customers, orders, and products — or open the AI assistant.',
    placement: 'right' as const,
  },
  {
    selector: '[data-tour="right-panel"]',
    title: 'Today & activity panel',
    body: 'Toggle this to reveal your day at a glance — pending payments, packing orders, reorder signals, and a live activity feed.',
    placement: 'left' as const,
  },
  {
    selector: '[data-tour="inbox-link"]',
    title: 'AI assistant',
    body: 'Open any conversation in the inbox. The right rail has an AI assistant that can draft replies, create orders from chat, and summarise the customer — with one click.',
    placement: 'right' as const,
  },
]

type Rect = { top: number; left: number; width: number; height: number }

const PAD = 8

export function WelcomeTour() {
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const measure = useCallback((idx: number) => {
    const el = document.querySelector(STEPS[idx].selector)
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({
      top:    r.top    - PAD,
      left:   r.left   - PAD,
      width:  r.width  + PAD * 2,
      height: r.height + PAD * 2,
    })
  }, [])

  useEffect(() => {
    const open = () => { setStep(0); setActive(true) }
    window.addEventListener('pt:tour:open', open)
    return () => window.removeEventListener('pt:tour:open', open)
  }, [])

  useEffect(() => {
    if (!active) { setRect(null); return }
    measure(step)
    const onResize = () => measure(step)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [active, step, measure])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else close()
  }

  function close() {
    setActive(false)
    setStep(0)
  }

  if (!active || !rect) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  // Tooltip position
  const TIP_W = 300
  const tipStyle: React.CSSProperties = { width: TIP_W }
  if (current.placement === 'right') {
    tipStyle.left = rect.left + rect.width + 18
    tipStyle.top  = rect.top + rect.height / 2
    tipStyle.transform = 'translateY(-50%)'
  } else {
    tipStyle.left = rect.left - TIP_W - 18
    tipStyle.top  = rect.top + rect.height / 2
    tipStyle.transform = 'translateY(-50%)'
  }

  return (
    <>
      <div className="pt-tour-backdrop" onClick={close} />
      <div
        className="pt-tour-spot"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      />
      <div className="pt-tour-tip" style={tipStyle}>
        <div className="pt-tour-tip-meta">
          <span className="pt-tour-tip-step">{step + 1} / {STEPS.length}</span>
          <div className="pt-tour-tip-dots">
            {STEPS.map((_, i) => (
              <span key={i} className={`pt-tour-tip-dot${i === step ? ' is-on' : ''}${i < step ? ' is-done' : ''}`} />
            ))}
          </div>
        </div>
        <h3 className="pt-tour-tip-title">{current.title}</h3>
        <p className="pt-tour-tip-body">{current.body}</p>
        <div className="pt-tour-tip-foot">
          <button className="pt-tour-skip" onClick={close}>Skip tour</button>
          <button className="pt-tour-next" onClick={next}>
            {isLast ? 'Done ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </>
  )
}
