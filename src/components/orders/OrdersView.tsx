'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { updateOrderStatus } from '@/app/orders/actions'
import { CreateOrderModal } from './CreateOrderModal'
import { ShipOrderModal } from './ShipOrderModal'
import { OrdersBoard } from './OrdersBoard'
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

export function OrdersView({ initialOrders }: { initialOrders: OrderCard[] }) {
  const router = useRouter()
  const [orders, setOrders] = useState(initialOrders)
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
        <OrdersBoard
          orders={orders}
          pulse={pulse}
          onAdvance={tryMove}
          onOpen={id => router.push(`/orders/${id}`)}
        />
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
