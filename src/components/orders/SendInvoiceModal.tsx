'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import type { DbOrderRow } from '@/types/orders'
import { formatInvoiceNumber } from '@/types/invoices'

interface SendInvoiceModalProps {
  order: DbOrderRow
  onClose: () => void
}

interface ExistingInvoice {
  invoice_number: string
  pdf_path: string
  created_at: string
}

export function SendInvoiceModal({ order, onClose }: SendInvoiceModalProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [existing, setExisting] = useState<ExistingInvoice | null | undefined>(undefined) // undefined = loading

  const invoiceNumber = formatInvoiceNumber(order.ref_number)
  const total = order.order_items.reduce((s, it) => s + it.qty * it.unit_price_snapshot, 0)
  const hasConversation = !!order.conversation_id

  useEffect(() => {
    supabase
      .from('invoices')
      .select('invoice_number, pdf_path, created_at')
      .eq('order_id', order.id)
      .single()
      .then(({ data }) => setExisting(data ?? null))
  }, [supabase, order.id])

  const navigateToInbox = (pdfPath: string, invNumber: string) => {
    const filename = `${invNumber}.pdf`
    router.push(`/inbox?conversation=${order.conversation_id}&invoice_path=${encodeURIComponent(pdfPath)}&invoice_name=${encodeURIComponent(filename)}`)
    onClose()
  }

  const generate = (isRegenerate = false) => {
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
      const { pdfPath } = await res.json() as { pdfPath: string }
      if (isRegenerate) {
        setExisting({ invoice_number: invoiceNumber, pdf_path: pdfPath, created_at: new Date().toISOString() })
        return
      }
      navigateToInbox(pdfPath, invoiceNumber)
    })
  }

  const preview = () => {
    if (!existing) return
    setError('')
    startTransition(async () => {
      const res = await fetch(`/api/invoices/preview?path=${encodeURIComponent(existing.pdf_path)}`)
      if (!res.ok) { setError('Could not load preview'); return }
      const { url } = await res.json() as { url: string }
      window.open(url, '_blank')
    })
  }

  const resend = () => {
    if (!existing) return
    navigateToInbox(existing.pdf_path, existing.invoice_number)
  }

  const loading = existing === undefined

  return (
    <div className="pt-modal-backdrop" onClick={pending ? undefined : onClose}>
      <div className="pt-modal" onClick={e => e.stopPropagation()}>
        <div className="pt-modal-hd">
          <h2>{existing ? 'Invoice' : 'Send invoice'}</h2>
          <button className="pt-iconbtn" onClick={onClose}><Icons.x size={14} /></button>
        </div>

        {loading ? (
          <div className="pt-modal-body" style={{ textAlign: 'center', color: 'var(--pt-fg-4)', fontSize: 13, padding: '32px 0' }}>
            Loading…
          </div>
        ) : existing ? (
          <>
            <div className="pt-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{existing.invoice_number}</span>
                <span style={{ fontSize: 12, color: 'var(--pt-fg-3)' }}>
                  Generated {new Date(existing.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  {' · '}{order.customers?.display_name ?? '—'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="pt-btn pt-btn-ghost" onClick={preview} disabled={pending} style={{ flex: 1 }}>
                  Preview
                </button>
                <button className="pt-btn pt-btn-primary" onClick={resend} disabled={!hasConversation} style={{ flex: 1 }}>
                  Resend
                </button>
              </div>
              {!hasConversation && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--pt-warn)', padding: '8px 10px', background: 'oklch(0.97 0.03 65)', borderRadius: 6 }}>
                  No linked conversation — open the customer chat from Inbox to enable sending.
                </div>
              )}
              {error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--pt-danger)' }}>{error}</div>}
            </div>
            <div className="pt-modal-ft" style={{ justifyContent: 'space-between' }}>
              <button
                style={{ fontSize: 11.5, color: 'var(--pt-fg-4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => generate(true)}
                disabled={pending}
              >
                {pending ? 'Regenerating…' : 'Regenerate'}
              </button>
              <button className="pt-btn pt-btn-ghost" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
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
              <button className="pt-btn pt-btn-primary" onClick={() => generate(false)} disabled={pending || !hasConversation}>
                {pending ? 'Generating…' : 'Generate & attach'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
