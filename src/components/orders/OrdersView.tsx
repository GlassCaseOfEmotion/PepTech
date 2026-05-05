'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { updateOrderStatus } from '@/app/orders/actions'
import type { OrderCard, OrderStatus } from '@/types/orders'

const COLUMNS: { id: OrderStatus; label: string; caption: string }[] = [
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
      <div className="pt-or-card-items">{o.itemsSummary || `${o.itemCount} item${o.itemCount !== 1 ? 's' : ''}`}</div>
      <div className="pt-or-card-pay">
        <span className="pt-pay-asset" data-asset={o.paymentAsset}>{o.paymentAsset}</span>
        <span className="pt-or-card-amt mono">${o.paymentAmount.toFixed(2)}</span>
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

  const showToast = (text: string, kind = 'ok') => {
    setToast({ text, kind, id: Date.now() })
    setTimeout(() => setToast(null), 2400)
  }

  const flash = (id: string, kind: string) => {
    setPulse(p => ({ ...p, [id]: kind }))
    setTimeout(() => setPulse(p => { const n = { ...p }; delete n[id]; return n }), 700)
  }

  const tryMove = useCallback(async (orderId: string, toStatus: OrderStatus) => {
    const o = orders.find(x => x.id === orderId)
    if (!o || o.status === toStatus) return
    if (o.status === 'awaiting' && toStatus !== 'confirming' && toStatus !== 'awaiting') {
      flash(orderId, 'err')
      showToast(`#${o.refNumber} — move to ${toStatus} not allowed from awaiting`, 'err')
      return
    }
    // Optimistic update
    setOrders(prev => prev.map(x => x.id === orderId ? { ...x, status: toStatus } : x))
    flash(orderId, 'ok')
    showToast(`#${o.refNumber} → ${COLUMNS.find(c => c.id === toStatus)?.label}`)
    const result = await updateOrderStatus(orderId, toStatus)
    if ('error' in result) {
      setOrders(prev => prev.map(x => x.id === orderId ? { ...x, status: o.status } : x))
      showToast(`Failed: ${result.error}`, 'err')
    }
  }, [orders])

  const totalAwaiting = orders
    .filter(o => o.status === 'awaiting' || o.status === 'confirming')
    .reduce((s, o) => s + o.paymentAmount, 0)
  const inFlight = orders.filter(o => o.status === 'shipped').length

  return (
    <div className="pt-or">
      <div className="pt-or-hd">
        <div>
          <h1>Orders</h1>
          <p>{orders.length} open · ${totalAwaiting.toLocaleString()} awaiting payment · {inFlight} in transit</p>
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
                  <div className="pt-or-col-empty">— nothing here —</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showCreateModal && (
        <div className="pt-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="pt-modal" onClick={e => e.stopPropagation()}>
            <div className="pt-modal-hd">
              <h3>New order</h3>
              <button className="pt-iconbtn" onClick={() => setShowCreateModal(false)}>
                <Icons.x size={14} />
              </button>
            </div>
            <div className="pt-modal-body">
              <p style={{ color: 'var(--pt-fg-3)', fontSize: 13 }}>
                Order creation form — wired in Task 11
              </p>
            </div>
          </div>
        </div>
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
