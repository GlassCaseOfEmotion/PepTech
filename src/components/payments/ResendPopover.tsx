'use client'

import { useState, useRef, useEffect } from 'react'
import { Icons } from '@/lib/icons'
import type { CryptoPaymentLinkWithOrder } from '@/types/payments-crypto'
import { PaySendWidget } from './PaySendWidget'

export function ResendPopover({ link }: { link: CryptoPaymentLinkWithOrder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="pay-row-act"
        title="Resend"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
      >
        <Icons.send size={12} />
      </button>
      {open && (
        <div className="pay-row-popover" onClick={e => e.stopPropagation()}>
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
        </div>
      )}
    </div>
  )
}
