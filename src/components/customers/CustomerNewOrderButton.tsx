'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreateOrderForm } from '@/components/orders/CreateOrderForm'

interface Props {
  customerId: string
  customerName: string
}

export function CustomerNewOrderButton({ customerId, customerName }: Props) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const handleSuccess = (orderId: string) => {
    setOpen(false)
    router.push(`/orders/${orderId}`)
  }

  return (
    <>
      <button className="pt-btn pt-btn-primary" onClick={() => setOpen(true)}>
        + New order
      </button>

      {open && (
        <div className="pt-modal-backdrop" onClick={() => setOpen(false)}>
          <div className="pt-modal" style={{ width: 540, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="pt-modal-hd">
              <div className="pt-modal-title">New order — {customerName}</div>
            </div>
            <div className="pt-modal-body">
              <CreateOrderForm
                customerId={customerId}
                customerName={customerName}
                onSuccess={handleSuccess}
                onCancel={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
