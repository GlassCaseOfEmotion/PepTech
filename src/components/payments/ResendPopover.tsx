'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icons } from '@/lib/icons'
import type { CryptoPaymentLinkWithOrder } from '@/types/payments-crypto'
import { PaySendWidget } from './PaySendWidget'

export function ResendPopover({ link, onOpen }: { link: CryptoPaymentLinkWithOrder; onOpen?: () => void }) {
  const [open, setOpen]   = useState(false)
  const [pos, setPos]     = useState({ top: 0, right: 0 })
  const btnRef            = useRef<HTMLButtonElement>(null)
  const popRef            = useRef<HTMLDivElement>(null)

  const customer     = link.orders?.customers
  const channels     = customer?.customer_channels ?? []
  const primary      = channels.find(c => c.is_primary) ?? channels[0] ?? null
  const customerId   = customer?.id ?? null
  const customerName = customer?.display_name ?? null
  const channelType  = primary?.channel_type ?? null
  const messageText  = `Hi ${customerName ?? 'there'}! Here's your payment link for ${link.memo ?? link.orders?.ref_number ?? 'your order'}:\n\n${link.hosted_url}`

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !popRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
      onOpen?.()
    }
    setOpen(v => !v)
  }

  return (
    <>
      <button ref={btnRef} className="pay-row-act" title="Resend" onClick={handleToggle}>
        <Icons.send size={12} />
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          className="pay-row-popover"
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 200 }}
          onClick={e => e.stopPropagation()}
        >
          <PaySendWidget
            customerId={customerId}
            customerName={customerName}
            channelType={channelType}
            messageText={messageText}
            url={link.hosted_url}
            orderId={link.order_id}
            orderStatus={link.orders?.status}
            linkId={link.id}
          />
        </div>,
        document.body
      )}
    </>
  )
}
