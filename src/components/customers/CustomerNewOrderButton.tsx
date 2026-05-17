'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreateOrderForm } from '@/components/orders/CreateOrderForm'
import { EmptyState } from '@/components/ui/EmptyState'

interface Props {
  customerId: string
  customerName: string
}

function NewOrderModal({ customerId, customerName, onClose }: Props & { onClose: () => void }) {
  const router = useRouter()
  const handleSuccess = (orderId: string) => {
    onClose()
    router.push(`/orders/${orderId}`)
  }
  return (
    <div className="pt-modal-backdrop" onClick={onClose}>
      <div className="pt-modal" style={{ width: 540, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="pt-modal-hd">
          <div className="pt-modal-title">New order — {customerName}</div>
        </div>
        <div className="pt-modal-body">
          <CreateOrderForm
            customerId={customerId}
            customerName={customerName}
            onSuccess={handleSuccess}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}

export function CustomerNewOrderButton({ customerId, customerName }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="pt-btn pt-btn-primary" onClick={() => setOpen(true)}>
        + New order
      </button>

      {open && (
        <NewOrderModal customerId={customerId} customerName={customerName} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

export function CustomerOrderEmptyState({ customerId, customerName }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <EmptyState
        size="md"
        icon={
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9l14-5 14 5v15L18 29 4 24V9z"/>
            <path d="M4 9l14 8 14-8M18 17v12"/>
          </svg>
        }
        title="No orders yet"
        body={`${customerName} hasn't placed an order. Create one to get started.`}
        action={{ label: `New order for ${customerName} →`, onClick: () => setOpen(true) }}
      />

      {open && (
        <NewOrderModal customerId={customerId} customerName={customerName} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
