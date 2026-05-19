'use client'

import { Icons } from '@/lib/icons'
import { DbOrderRow } from '@/types/orders'
import { TenantPaymentConfig } from '@/types/payments'
import { EditOrderForm } from './EditOrderForm'

export function EditOrderModal({ order, paymentConfigs, onClose, onSuccess }: {
  order: DbOrderRow
  paymentConfigs: TenantPaymentConfig[]
  onClose: () => void
  onSuccess: () => void
}) {
  return (
    <div className="pt-modal-backdrop" onClick={onClose}>
      <div className="pt-modal" onClick={e => e.stopPropagation()}>
        <div className="pt-modal-hd">
          <h3>Edit order · #{order.ref_number}</h3>
          <button className="pt-iconbtn" onClick={onClose}><Icons.x size={14} /></button>
        </div>
        <div className="pt-modal-body">
          <EditOrderForm
            order={order}
            paymentConfigs={paymentConfigs}
            onSuccess={onSuccess}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}
