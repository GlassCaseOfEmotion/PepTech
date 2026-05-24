'use client'

import { useMemo, useState } from 'react'
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

const STATUS_ORDER: Record<OrderStatus, number> = {
  created: 0, awaiting: 1, confirming: 2, packing: 3, shipped: 4, delivered: 5,
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

type SortKey = 'ref' | 'date' | 'customer' | 'items' | 'pay' | 'amount' | 'status'

const COLUMNS: { key: SortKey; label: string; defaultDir: 'asc' | 'desc'; className?: string }[] = [
  { key: 'ref',      label: '#',        defaultDir: 'desc' },
  { key: 'date',     label: 'Date',     defaultDir: 'desc' },
  { key: 'customer', label: 'Customer', defaultDir: 'asc'  },
  { key: 'items',    label: 'Items',    defaultDir: 'desc' },
  { key: 'pay',      label: 'Pay',      defaultDir: 'asc'  },
  { key: 'amount',   label: 'Amount',   defaultDir: 'desc', className: 'r' },
  { key: 'status',   label: 'Status',   defaultDir: 'asc'  },
]

interface Props {
  orders: OrderCard[]
  onAdvance: (id: string, status: OrderStatus) => void
  onOpen: (id: string) => void
}

export function OrdersList({ orders, onAdvance, onOpen }: Props) {
  const [sortBy, setSortBy]   = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const colSort = (col: SortKey, defaultDir: 'asc' | 'desc') => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(defaultDir) }
  }

  const sorted = useMemo(() => {
    const d = sortDir === 'asc' ? 1 : -1
    const fns: Record<SortKey, (a: OrderCard, b: OrderCard) => number> = {
      ref:      (a, b) => d * (parseInt(a.refNumber, 10) - parseInt(b.refNumber, 10)),
      date:     (a, b) => d * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      customer: (a, b) => d * a.customerName.localeCompare(b.customerName),
      items:    (a, b) => d * (a.items.length - b.items.length),
      pay:      (a, b) => d * (a.paymentAsset ?? '').localeCompare(b.paymentAsset ?? ''),
      amount:   (a, b) => d * (a.paymentAmount - b.paymentAmount),
      status:   (a, b) => d * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
    }
    return [...orders].sort(fns[sortBy])
  }, [orders, sortBy, sortDir])

  return (
    <div className="pt-or-list-wrap">
      <table className="pt-or-list">
        <thead>
          <tr>
            {COLUMNS.map(col => (
              <th key={col.key} className={col.className}>
                <button
                  type="button"
                  className={`pt-or-list-col-hd ${sortBy === col.key ? 'is-sorted' : ''}`}
                  onClick={() => colSort(col.key, col.defaultDir)}
                >
                  {col.label}
                  {sortBy === col.key && <span className="pt-or-list-sort-arr">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map(o => {
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
    </div>
  )
}
