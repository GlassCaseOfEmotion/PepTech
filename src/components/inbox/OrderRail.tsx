'use client'

import { useRouter } from 'next/navigation'
import { CreateOrderForm } from '@/components/orders/CreateOrderForm'

interface OrderRailProps {
  customerId: string
  customerName: string
  conversationId: string
  onClose: () => void
}

export function OrderRail({ customerId, customerName, conversationId, onClose }: OrderRailProps) {
  const router = useRouter()

  const handleSuccess = (orderId: string, _refNumber: string) => {
    onClose()
    router.push(`/orders/${orderId}`)
  }

  return (
    <aside className="pt-ix-order-rail">
      <div className="pt-ix-order-rail-hd">
        <span className="pt-ix-order-rail-title">New order</span>
        <button className="pt-ix-order-rail-cancel" onClick={onClose}>Cancel</button>
      </div>
      <div className="pt-ix-order-rail-body">
        <CreateOrderForm
          customerId={customerId}
          customerName={customerName}
          conversationId={conversationId}
          onSuccess={handleSuccess}
          onCancel={onClose}
        />
      </div>
    </aside>
  )
}
