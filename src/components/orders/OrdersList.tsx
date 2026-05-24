'use client'

import Link from 'next/link'
import { PAYMENT_BADGE } from '@/types/payments'
import type { OrderCard, OrderStatus } from '@/types/orders'
import { formatAmount } from '@/lib/currency'
import { CH_ICONS, NEXT_STATUS, NEXT_LABEL, initials } from './ordersHelpers'

const STATUS_LABEL: Record<OrderStatus, string> = {
  created:    'Created',
  awaiting:   'Awaiting payment',
  confirming: 'Confirming',
  packing:    'Packing',
  shipped:    'Shipped',
  delivered:  'Delivered',
}

function fmtAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

interface Props {
  orders: OrderCard[]
  onAdvance: (id: string, status: OrderStatus) => void
  onOpen: (id: string) => void
}

export function OrdersList({ orders, onAdvance, onOpen }: Props) {
  return (
    <table className="pt-or-list">
      <thead>
        <tr>
          <th>#</th>
          <th>Date</th>
          <th>Customer</th>
          <th>Items</th>
          <th>Pay</th>
          <th className="r">Amount</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {orders.map(o => {
          const ChIcon = CH_ICONS[o.channel]
          const nextStatus = NEXT_STATUS[o.status]
          return (
            <tr
              key={o.id}
              className="pt-or-list-row"
              onClick={() => onOpen(o.id)}
              style={{ cursor: 'pointer' }}
            >
              <td className="mono">
                <Link
                  href={`/orders/${o.id}`}
                  className="pt-link"
                  onClick={e => e.stopPropagation()}
                >
                  #{o.refNumber}
                </Link>
              </td>
              <td>{fmtAge(o.createdAt)}</td>
              <td>
                <span className="pt-or-list-cust">
                  <span className="pt-or-list-av" data-channel={o.channel}>
                    {initials(o.customerName)}
                  </span>
                  <span>{o.customerName}</span>
                  {ChIcon && <ChIcon size={12} />}
                </span>
              </td>
              <td>
                {o.items.slice(0, 2).map((it, i) => (
                  <span key={i} className="pt-cu-item-chip">
                    {it.name}{it.qty > 1 ? ` ×${it.qty}` : ''}
                  </span>
                ))}
                {o.items.length > 2 && (
                  <span className="pt-cu-item-more">+{o.items.length - 2} more</span>
                )}
              </td>
              <td>
                <span
                  className="pt-pay-asset"
                  data-asset={PAYMENT_BADGE[o.paymentAsset ?? '']?.key ?? 'other'}
                >
                  {PAYMENT_BADGE[o.paymentAsset ?? '']?.label ?? o.paymentAsset ?? '—'}
                </span>
              </td>
              <td className="r mono">{formatAmount(o.paymentAmount, o.currency)}</td>
              <td>
                <span className="pt-or-list-status">
                  <span className={`pt-or-col-dot pt-or-dot-${o.status}`} />
                  {STATUS_LABEL[o.status]}
                </span>
              </td>
              <td>
                {nextStatus && (
                  <button
                    className="pt-or-advance"
                    onClick={e => { e.stopPropagation(); onAdvance(o.id, nextStatus) }}
                  >
                    {NEXT_LABEL[o.status]}
                  </button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
