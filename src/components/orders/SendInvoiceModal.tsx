'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import type { DbOrderRow } from '@/types/orders'
import { formatInvoiceNumber } from '@/types/invoices'
import { formatAmount } from '@/lib/currency'

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
  const [existing, setExisting] = useState<ExistingInvoice | null | undefined>(undefined)

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

  const openPreview = async (pdfPath: string) => {
    const res = await fetch(`/api/invoices/preview?path=${encodeURIComponent(pdfPath)}`)
    if (!res.ok) { setError('Generated — could not open preview'); return }
    const { url } = await res.json() as { url: string }
    window.open(url, '_blank')
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
      if (hasConversation) {
        navigateToInbox(pdfPath, invoiceNumber)
      } else {
        setExisting({ invoice_number: invoiceNumber, pdf_path: pdfPath, created_at: new Date().toISOString() })
        await openPreview(pdfPath)
      }
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
      <div className="pt-modal pt-inv-modal" onClick={e => e.stopPropagation()}>
        <div className="pt-modal-hd">
          <h2>{existing ? 'Invoice' : 'Send invoice'}</h2>
          <button className="pt-iconbtn" onClick={onClose} disabled={pending}><Icons.x size={14} /></button>
        </div>

        {loading ? (
          <div className="pt-modal-body">
            <div className="pt-inv-loading">
              <div className="pt-inv-loading-icon" />
              <span>Loading…</span>
            </div>
          </div>
        ) : existing ? (
          <>
            <div className="pt-modal-body">
              <div className="pt-inv-exists-hd">
                <div className="pt-inv-thumb" aria-hidden="true">
                  <div className="pt-inv-thumb-bar short" />
                  <div className="pt-inv-thumb-bar full" />
                  <div className="pt-inv-thumb-bar med" />
                  <div className="pt-inv-thumb-bar full" />
                  <div className="pt-inv-thumb-bar short" />
                  <div className="pt-inv-thumb-bar med accent" />
                </div>
                <div className="pt-inv-exists-info">
                  <span className="pt-inv-exists-num">{existing.invoice_number}</span>
                  <span className="pt-inv-exists-meta">
                    {new Date(existing.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="pt-inv-exists-meta">{order.customers?.display_name ?? '—'}</span>
                </div>
              </div>

              <div className="pt-inv-actions">
                <button className="pt-btn pt-btn-ghost" onClick={preview} disabled={pending}>
                  Preview
                </button>
                <button className="pt-btn pt-btn-primary" onClick={resend} disabled={!hasConversation || pending}>
                  Resend
                </button>
              </div>

              {!hasConversation && (
                <div className="pt-inv-warn">
                  No linked conversation — open the customer chat from Inbox to enable sending.
                </div>
              )}
              {error && <div className="pt-inv-error">{error}</div>}
            </div>

            <div className="pt-modal-ft" style={{ justifyContent: 'space-between' }}>
              <button className="pt-inv-regen" onClick={() => generate(true)} disabled={pending}>
                {pending ? 'Regenerating…' : 'Regenerate PDF'}
              </button>
              <button className="pt-btn pt-btn-ghost" onClick={onClose} disabled={pending}>Close</button>
            </div>
          </>
        ) : (
          <>
            <div className="pt-modal-body">
              <div className="pt-inv-doc-hd">
                <span className="pt-inv-doc-num">{invoiceNumber}</span>
                <span className="pt-inv-doc-cust">{order.customers?.display_name ?? '—'}</span>
              </div>

              <table className="pt-inv-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="center">Qty</th>
                    <th className="right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.order_items.map((it, i) => (
                    <tr key={i}>
                      <td>{it.products?.name ?? '—'}</td>
                      <td className="center">{it.qty}</td>
                      <td className="right mono">{formatAmount(it.qty * it.unit_price_snapshot, order.currency ?? 'USD')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="label">Total</td>
                    <td />
                    <td className="right mono">{formatAmount(total, order.currency ?? 'USD')}</td>
                  </tr>
                </tfoot>
              </table>

              {order.payment_address && (
                <div className="pt-inv-pay">
                  <div className="pt-inv-pay-label">Payment</div>
                  <span className="pt-inv-pay-asset">{order.payment_asset}</span>
                  <div className="pt-inv-pay-addr mono">{order.payment_address}</div>
                </div>
              )}

              {!hasConversation && (
                <div className="pt-inv-warn">
                  No linked conversation — invoice will open as a PDF. To send directly to the customer, start a chat from Inbox first.
                </div>
              )}
              {error && <div className="pt-inv-error">{error}</div>}
            </div>

            <div className="pt-modal-ft">
              <button className="pt-btn pt-btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
              <button className="pt-btn pt-btn-primary" onClick={() => generate(false)} disabled={pending}>
                {pending ? 'Generating…' : hasConversation ? 'Generate & attach' : 'Generate PDF'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
