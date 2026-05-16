'use client'

import { useState, useTransition } from 'react'
import { Icons } from '@/lib/icons'
import { shipOrder } from '@/app/orders/actions'

interface ShipOrderModalProps {
  orderId: string
  refNumber: string
  onSuccess: () => void
  onClose: () => void
}

export function ShipOrderModal({ orderId, refNumber, onSuccess, onClose }: ShipOrderModalProps) {
  const [carrier, setCarrier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [estimatedDelivery, setEstimatedDelivery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    if (!carrier.trim()) { setError('Carrier is required'); return }
    setError(null)
    startTransition(async () => {
      const result = await shipOrder(orderId, {
        carrier: carrier.trim(),
        trackingNumber: trackingNumber.trim() || undefined,
        trackingUrl: trackingUrl.trim() || undefined,
        estimatedDelivery: estimatedDelivery || undefined,
      })
      if (result && 'error' in result) { setError(result.error); return }
      onSuccess()
      onClose()
    })
  }

  return (
    <div className="pt-modal-backdrop" onClick={pending ? undefined : onClose}>
      <div className="pt-modal" onClick={e => e.stopPropagation()}>
        <div className="pt-modal-hd">
          <h3>Mark as Shipped · #{refNumber}</h3>
          <button className="pt-iconbtn" onClick={onClose} disabled={pending}><Icons.x size={14} /></button>
        </div>
        <div className="pt-modal-body">
          <div className="pt-ship-form" style={{ margin: 0, border: 'none', padding: 0, background: 'transparent' }}>
            <div className="pt-ship-form-row">
              <label className="pt-ship-form-label">Carrier *</label>
              <input className="pt-input" placeholder="USPS, UPS, DHL…"
                value={carrier} onChange={e => setCarrier(e.target.value)} autoFocus />
            </div>
            <div className="pt-ship-form-row">
              <label className="pt-ship-form-label">Tracking number</label>
              <input className="pt-input" placeholder="Optional"
                value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
            </div>
            <div className="pt-ship-form-row">
              <label className="pt-ship-form-label">Tracking URL</label>
              <input className="pt-input" placeholder="https://… (optional)"
                value={trackingUrl} onChange={e => setTrackingUrl(e.target.value)} />
            </div>
            <div className="pt-ship-form-row">
              <label className="pt-ship-form-label">Est. delivery</label>
              <input className="pt-input" type="date"
                value={estimatedDelivery} onChange={e => setEstimatedDelivery(e.target.value)} />
            </div>
            {error && <p style={{ color: 'var(--pt-danger)', fontSize: 12, margin: '4px 0 0' }}>{error}</p>}
          </div>
        </div>
        <div className="pt-modal-ft">
          <button className="pt-btn pt-btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="pt-btn pt-btn-primary" onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : 'Confirm shipment'}
          </button>
        </div>
      </div>
    </div>
  )
}
