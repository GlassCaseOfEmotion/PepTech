'use client'

import { useState } from 'react'
import { Icons } from '@/lib/icons'
import { EmptyState } from '@/components/ui/EmptyState'
import { PAYMENT_BADGE } from '@/types/payments'
import type { OrderCard, OrderStatus } from '@/types/orders'
import { formatAmount } from '@/lib/currency'

export const COLUMNS: { id: OrderStatus; label: string; caption: string }[] = [
  { id: 'created',    label: 'Created',           caption: 'Payment method not set yet' },
  { id: 'awaiting',   label: 'Awaiting payment',  caption: 'Invoice sent · waiting for tx' },
  { id: 'confirming', label: 'Confirming',        caption: 'Tx seen · waiting for confirms' },
  { id: 'packing',    label: 'Packing',           caption: 'Paid · ready to ship' },
  { id: 'shipped',    label: 'Shipped',           caption: 'In transit' },
  { id: 'delivered',  label: 'Delivered',         caption: 'Closed' },
]

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirming: 'packing',
  packing: 'shipped',
  shipped: 'delivered',
}

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  confirming: 'Confirm payment →',
  packing: 'Mark packed →',
  shipped: 'Mark delivered →',
}

function fmtAge(minsAgo: number) {
  if (minsAgo < 60) return `${minsAgo}m`
  if (minsAgo < 1440) return `${Math.floor(minsAgo / 60)}h`
  return `${Math.floor(minsAgo / 1440)}d`
}

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0] ?? '?']).join('')
}

function OrderCardUI({ order: o, pulse, onDragStart, onDragEnd, onAdvance, isDragging, onClick }: {
  order: OrderCard
  pulse?: string
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onAdvance: (id: string, status: OrderStatus) => void
  isDragging: boolean
  onClick: () => void
}) {
  const ChIcon = CH_ICONS[o.channel]
  const nextStatus = NEXT_STATUS[o.status]

  return (
    <article
      className={`pt-or-card pt-or-card-${o.status} ${pulse ? `pt-or-pulse-${pulse}` : ''} ${isDragging ? 'is-dragging' : ''}`}
      draggable
      onDragStart={e => { onDragStart(e, o.id); e.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <header className="pt-or-card-hd">
        <span className="pt-or-card-id mono">#{o.refNumber}</span>
        <span className="pt-or-card-age mono">{fmtAge(o.minsAgo)}</span>
      </header>
      <div className="pt-or-card-cust">
        <div className="pt-or-card-av" data-channel={o.channel}>
          <span>{initials(o.customerName)}</span>
          <i className={`pt-thread-ch pt-ch-${o.channel}`}>{ChIcon && <ChIcon size={8} />}</i>
        </div>
        <div className="pt-or-card-name">{o.customerName}</div>
      </div>
      <div className="pt-or-card-items">
        {o.items.slice(0, 2).map((it, i) => (
          <span key={i} className="pt-cu-item-chip">{it.name}{it.qty > 1 ? ` ×${it.qty}` : ''}</span>
        ))}
        {o.items.length > 2 && <span className="pt-cu-item-more">+{o.items.length - 2} more</span>}
      </div>
      <div className="pt-or-card-pay">
        <span className="pt-pay-asset" data-asset={PAYMENT_BADGE[o.paymentAsset ?? '']?.key ?? 'other'}>
          {PAYMENT_BADGE[o.paymentAsset ?? '']?.label ?? o.paymentAsset ?? '—'}
        </span>
        <span className="pt-or-card-amt mono">{formatAmount(o.paymentAmount, o.currency)}</span>
      </div>
      {nextStatus && (
        <button
          className="pt-or-advance"
          onClick={e => { e.stopPropagation(); onAdvance(o.id, nextStatus) }}
        >
          {NEXT_LABEL[o.status]}
        </button>
      )}
    </article>
  )
}

interface OrdersBoardProps {
  orders: OrderCard[]
  pulse: Record<string, string>
  onAdvance: (id: string, status: OrderStatus) => void
  onOpen: (id: string) => void
}

export function OrdersBoard({ orders, pulse, onAdvance, onOpen }: OrdersBoardProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  return (
    <div className="pt-or-board">
      {COLUMNS.map(col => {
        const colOrders = orders.filter(o => o.status === col.id)
        const isOver = dragOverCol === col.id && dragId
        return (
          <div
            key={col.id}
            className={`pt-or-col ${isOver ? 'is-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.id) }}
            onDragLeave={e => { if (e.currentTarget === e.target) setDragOverCol(null) }}
            onDrop={e => {
              e.preventDefault()
              if (dragId) onAdvance(dragId, col.id as OrderStatus)
              setDragId(null)
              setDragOverCol(null)
            }}
          >
            <div className="pt-or-col-hd" data-col={col.id}>
              <div className="pt-or-col-titlewrap">
                <span className={`pt-or-col-dot pt-or-dot-${col.id}`} />
                <span className="pt-or-col-title">{col.label}</span>
                <span className="pt-or-col-count mono">{colOrders.length}</span>
              </div>
              <div className="pt-or-col-cap">{col.caption}</div>
            </div>
            <div className="pt-or-col-body">
              {colOrders.map(o => (
                <OrderCardUI
                  key={o.id}
                  order={o}
                  pulse={pulse[o.id]}
                  onDragStart={(_e, id) => setDragId(id)}
                  onDragEnd={() => { setDragId(null); setDragOverCol(null) }}
                  onAdvance={onAdvance}
                  isDragging={dragId === o.id}
                  onClick={() => onOpen(o.id)}
                />
              ))}
              {colOrders.length === 0 && (
                <div className="pt-or-col-empty">
                  <EmptyState
                    size="sm"
                    icon={
                      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="26" height="26" rx="4" strokeDasharray="3 2.5" opacity="0.5"/>
                        <line x1="9" y1="11" x2="23" y2="11" opacity="0.3"/>
                        <line x1="9" y1="16" x2="18" y2="16" opacity="0.22"/>
                        <line x1="9" y1="21" x2="20" y2="21" opacity="0.15"/>
                      </svg>
                    }
                    title="Empty"
                  />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
