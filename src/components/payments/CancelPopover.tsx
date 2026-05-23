'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import type { CryptoPaymentLinkWithOrder } from '@/types/payments-crypto'
import { cancelPaymentLink } from '@/app/payments/actions'

type Phase = 'closed' | 'menu' | 'confirming'

export function CancelPopover({ link }: { link: CryptoPaymentLinkWithOrder }) {
  const [phase, setPhase] = useState<Phase>('closed')
  const [busy, setBusy]   = useState(false)
  const [pos, setPos]     = useState({ top: 0, right: 0 })
  const btnRef            = useRef<HTMLButtonElement>(null)
  const popRef            = useRef<HTMLDivElement>(null)
  const router            = useRouter()

  useEffect(() => {
    if (phase === 'closed') return
    function handler(e: MouseEvent) {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !popRef.current?.contains(e.target as Node)
      ) setPhase('closed')
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [phase])

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (phase !== 'closed') { setPhase('closed'); return }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setPhase('menu')
  }

  async function handleConfirm(e: React.MouseEvent) {
    e.stopPropagation()
    setBusy(true)
    await cancelPaymentLink(link.id)
    setBusy(false)
    setPhase('closed')
    router.refresh()
  }

  return (
    <>
      <button ref={btnRef} className="pay-row-act" title="More options" onClick={handleOpen}>
        <Icons.more size={12} />
      </button>
      {phase !== 'closed' && createPortal(
        <div
          ref={popRef}
          className="pay-cancel-popover"
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 200 }}
          onClick={e => e.stopPropagation()}
        >
          {phase === 'menu' ? (
            <button
              className="pay-cancel-option"
              onClick={e => { e.stopPropagation(); setPhase('confirming') }}
            >
              <Icons.x size={11} /> Cancel link
            </button>
          ) : (
            <div className="pay-cancel-confirm">
              <span>Cancel this link?</span>
              <div className="pay-cancel-btns">
                <button onClick={e => { e.stopPropagation(); setPhase('closed') }}>Keep it</button>
                <button className="is-danger" disabled={busy} onClick={handleConfirm}>
                  {busy ? '…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
