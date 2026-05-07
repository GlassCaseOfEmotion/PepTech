'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import type { DbOrderRow } from '@/types/orders'
import { formatInvoiceNumber } from '@/types/invoices'

interface SendInvoiceModalProps {
  order: DbOrderRow
  onClose: () => void
}

export function SendInvoiceModal({ order, onClose }: SendInvoiceModalProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const invoiceNumber = formatInvoiceNumber(order.ref_number)
  const total = order.order_items.reduce((s, it) => s + it.qty * it.unit_price_snapshot, 0)
  const hasConversation = !!order.conversation_id

  const generate = () => {
    setError('')
    startTransition(async () => {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      if (!res.ok) {
        const { error: e } = await res.json() as { error: string }
        setError(e ?? 'Failed to generate invoice')
        return
      }
      const { pdfPath, invoiceNumber: invNum } = await res.json() as { pdfPath: string; invoiceNumber: string }
      const filename = `${invNum}.pdf`
      router.push(`/inbox?conversation=${order.conversation_id}&invoice_path=${encodeURIComponent(pdfPath)}&invoice_name=${encodeURIComponent(filename)}`)
      onClose()
    })
  }

  return (
    <div className="pt-modal-backdrop" onClick={onClose}>
      <div className="pt-modal" onClick={e => e.stopPropagation()}>
        <div className="pt-modal-hd">
          <h2>Send invoice</h2>
          <button className="pt-iconbtn" onClick={onClose}><Icons.x size={14} /></button>
        </div>
        <div className="pt-modal-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--pt-fg-3)' }}>{invoiceNumber}</span>
            <span style={{ fontSize: 12, color: 'var(--pt-fg-3)' }}>{order.customers?.display_name ?? '—'}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--pt-line)', color: 'var(--pt-fg-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ textAlign: 'left', paddingBottom: 6 }}>Item</th>
                <th style={{ textAlign: 'center', paddingBottom: 6 }}>Qty</th>
                <th style={{ textAlign: 'right', paddingBottom: 6 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items.map((it, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid var(--pt-line-soft)' }}>
                  <td style={{ padding: '7px 0' }}>{it.products?.name ?? '—'}</td>
                  <td style={{ padding: '7px 0', textAlign: 'center' }}>{it.qty}</td>
                  <td style={{ padding: '7px 0', textAlign: 'right' }} className="mono">${(it.qty * it.unit_price_snapshot).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 8, borderTop: '1.5px solid var(--pt-fg)', fontWeight: 600, fontSize: 13 }}>
            <span className="mono">${total.toFixed(2)}</span>
          </div>
          {order.payment_address && (
            <div style={{ marginTop: 14, padding: 10, background: 'var(--pt-bg-side)', borderRadius: 6, fontSize: 11.5 }}>
              <span style={{ color: 'var(--pt-fg-4)' }}>Pay via </span>
              <strong>{order.payment_asset}</strong>
              {' · '}
              <span className="mono" style={{ fontSize: 10.5, wordBreak: 'break-all' }}>{order.payment_address}</span>
            </div>
          )}
          {!hasConversation && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--pt-warn)', padding: '8px 10px', background: 'oklch(0.97 0.03 65)', borderRadius: 6 }}>
              No linked conversation — open the customer chat from Inbox and create the order from there to enable invoice sending.
            </div>
          )}
          {error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--pt-danger)' }}>{error}</div>}
        </div>
        <div className="pt-modal-ft">
          <button className="pt-btn pt-btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="pt-btn pt-btn-primary" onClick={generate} disabled={pending || !hasConversation}>
            {pending ? 'Generating…' : 'Generate & attach'}
          </button>
        </div>
      </div>
    </div>
  )
}
