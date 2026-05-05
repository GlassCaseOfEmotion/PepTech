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

  const handleSuccess = (orderId: string, refNumber: string) => {
    onClose()
    router.push(`/orders/${orderId}`)
    void refNumber
  }

  return (
    <aside className="pt-ix-rail">
      <div style={{
        padding: '12px 16px 10px',
        borderBottom: '0.5px solid var(--pt-line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>New order</div>
        <button
          style={{
            fontSize: 11, color: 'var(--pt-fg-4)',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '2px 6px', borderRadius: 4,
          }}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
      <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
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
