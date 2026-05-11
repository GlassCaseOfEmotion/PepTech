'use client'

import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { CreateOrderForm } from './CreateOrderForm'

interface CreateOrderModalProps {
  onClose: () => void
}

export function CreateOrderModal({ onClose }: CreateOrderModalProps) {
  const router = useRouter()

  const handleSuccess = (orderId: string) => {
    onClose()
    router.push(`/orders/${orderId}`)
  }

  return (
    <div className="pt-modal-backdrop" onClick={onClose}>
      <div className="pt-modal" onClick={e => e.stopPropagation()}>
        <div className="pt-modal-hd">
          <h3>New order</h3>
          <button className="pt-iconbtn" onClick={onClose}><Icons.x size={14} /></button>
        </div>
        <div className="pt-modal-body">
          <CreateOrderForm onSuccess={handleSuccess} onCancel={onClose} />
        </div>
      </div>
    </div>
  )
}
