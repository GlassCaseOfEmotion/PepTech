'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { updateOrderStatus } from '@/app/orders/actions'
import { CreateOrderModal } from './CreateOrderModal'
import { ShipOrderModal } from './ShipOrderModal'
import { PAYMENT_BADGE } from '@/types/payments'
import type { OrderCard, OrderStatus } from '@/types/orders'
import { formatAmount } from '@/lib/currency'
import { EmptyState } from '@/components/ui/EmptyState'

const COLUMNS: { id: OrderStatus; label: string; caption: string }[] = [
  { id: 'created',    label: 'Created',           caption: 'Payment method not set yet' },
  { id: 'awaiting',   label: 'Awaiting payment', caption: 'Invoice sent · waiting for tx' },
  { id: 'confirming', label: 'Confirming',        caption: 'Tx seen · waiting for confirms' },
  { id: 'packing',    label: 'Packing',           caption: 'Paid · ready to ship' },
  { id: 'shipped',    label: 'Shipped',           caption: 'In transit' },
  { id: 'delivered',  label: 'Delivered',         caption: 'Closed' },
]

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

function fmtAge(minsAgo: number) {
  if (minsAgo < 60) return `${minsAgo}m`
  if (minsAgo < 1440) return `${Math.floor(minsAgo / 60)}h`
  return `${Math.floor(minsAgo / 1440)}d`
}

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0] ?? '?']).join('')
}

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

export function OrdersView({ initialOrders }: { initialOrders: OrderCard[] }) {
  const router = useRouter()
  const [orders, setOrders] = useState(initialOrders)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [pulse, setPulse] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [pendingShipOrder, setPendingShipOrder] = useState<{ id: string; refNumber: string } | null>(null)

  const showToast = (text: string, kind = 'ok') => {
    setToast({ text, kind, id: Date.now() })
    setTimeout(() => setToast(null), 2400)
  }

  const flash = (id: string, kind: string) => {
    setPulse(p => ({ ...p, [id]: kind }))
    setTimeout(() => setPulse(p => { const n = { ...p }; delete n[id]; return n }), 700)
  }

  const tryMove = async (orderId: string, toStatus: OrderStatus) => {
    const ALLOWED_FROM: Partial<Record<OrderStatus, OrderStatus[]>> = {
      awaiting:   ['confirming'],
      confirming: ['packing'],
      packing:    ['shipped'],
      shipped:    ['delivered'],
    }

    const target = orders.find(x => x.id === orderId)
    if (!target || target.status === toStatus) return
    const allowed = ALLOWED_FROM[target.status] ?? []
    if (!allowed.includes(toStatus)) {
      flash(orderId, 'err')
      showToast(`Cannot move directly to ${toStatus}`, 'err')
      return
    }

    // Intercept packing → shipped: collect carrier info via modal first
    if (toStatus === 'shipped') {
      setPendingShipOrder({ id: orderId, refNumber: target.refNumber })
      return
    }

    const originalStatus = target.status
    setOrders(prev => prev.map(x => x.id === orderId ? { ...x, status: toStatus } : x))
    showToast(`#${target.refNumber} → ${COLUMNS.find(c => c.id === toStatus)?.label}`)

    const result = await updateOrderStatus(orderId, toStatus)
    if ('error' in result) {
      setOrders(prev => prev.map(x => x.id === orderId ? { ...x, status: originalStatus } : x))
      flash(orderId, 'err')
      showToast(`Failed: ${result.error}`, 'err')
    } else {
      flash(orderId, 'ok')
    }
  }

  const totalAwaiting = orders
    .filter(o => o.status === 'awaiting' || o.status === 'confirming')
    .reduce((s, o) => s + o.paymentAmount, 0)
  const inFlight = orders.filter(o => o.status === 'shipped').length

  return (
    <div className="pt-or">
      <div className="pt-or-hd">
        <div>
          <h1>Orders</h1>
          <p>{orders.length} open · {formatAmount(totalAwaiting, orders[0]?.currency ?? 'USD')} awaiting payment · {inFlight} in transit</p>
        </div>
        <div className="pt-or-hd-actions">
          <div className="pt-or-search">
            <Icons.search size={12} />
            <input placeholder="Search by # or customer…" />
          </div>
          <button className="pt-btn pt-btn-primary" onClick={() => setShowCreateModal(true)}>
            <Icons.plus size={12} /> New order
          </button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="pt-or-board-empty-page">
          <EmptyState
            size="lg"
            icon={
              <svg width="160" height="80" viewBox="0 0 160 80" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                {[0,1,2,3,4].map(i => (
                  <rect key={i} x={8 + i * 31} y="12" width="22" height="56" rx="3.5"
                    strokeWidth="1.1"
                    strokeDasharray={i === 0 ? 'none' : '3 2.5'}
                    opacity={Math.max(0.2, 1 - i * 0.18)}
                  />
                ))}
                <line x1="30" y1="40" x2="39" y2="40" strokeWidth="0.8" opacity="0.3"/>
                <line x1="61" y1="40" x2="70" y2="40" strokeWidth="0.8" opacity="0.22"/>
                <line x1="92" y1="40" x2="101" y2="40" strokeWidth="0.8" opacity="0.16"/>
                <line x1="123" y1="40" x2="132" y2="40" strokeWidth="0.8" opacity="0.11"/>
                <line x1="19" y1="34" x2="19" y2="46" strokeWidth="1.3" opacity="0.4"/>
                <line x1="13" y1="40" x2="25" y2="40" strokeWidth="1.3" opacity="0.4"/>
              </svg>
            }
            title="No orders yet"
            body="Create an order from a conversation in the inbox, or add one manually."
            action={{ label: 'New order', onClick: () => setShowCreateModal(true) }}
          />
        </div>
      ) : (
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
                if (dragId) void tryMove(dragId, col.id as OrderStatus)
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
                    onDragStart={(e, id) => setDragId(id)}
                    onDragEnd={() => { setDragId(null); setDragOverCol(null) }}
                    onAdvance={tryMove}
                    isDragging={dragId === o.id}
                    onClick={() => router.push(`/orders/${o.id}`)}
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
      )}

      {showCreateModal && (
        <CreateOrderModal onClose={() => setShowCreateModal(false)} />
      )}
      {pendingShipOrder && (
        <ShipOrderModal
          orderId={pendingShipOrder.id}
          refNumber={pendingShipOrder.refNumber}
          onSuccess={() => {
            setOrders(prev => prev.map(x => x.id === pendingShipOrder.id ? { ...x, status: 'shipped' } : x))
            flash(pendingShipOrder.id, 'ok')
            showToast(`#${pendingShipOrder.refNumber} → Shipped`)
            setPendingShipOrder(null)
          }}
          onClose={() => setPendingShipOrder(null)}
        />
      )}

      {toast && (
        <div className={`pt-or-toast pt-or-toast-${toast.kind}`} key={toast.id}>
          {toast.kind === 'err' ? <Icons.x size={12} /> : <Icons.check size={12} />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  )
}
