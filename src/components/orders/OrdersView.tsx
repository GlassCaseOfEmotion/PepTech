'use client'

import { useState, useEffect } from 'react'
import { Icons } from '@/lib/icons'

type OrderState = 'awaiting' | 'confirming' | 'packing' | 'shipped' | 'delivered'

type Order = {
  id: string; cust: string; custId: string; channel: 'wa' | 'tg' | 'em'
  items: string; amt: number; asset: string; age: string; state: OrderState
  // awaiting
  invoiced?: string
  // confirming
  confirms?: number; needs?: number; txHash?: string
  // packing
  picker?: string; batch?: string
  // shipped
  carrier?: string; track?: string; eta?: string
  // delivered
  deliveredAt?: string
}

const ORDERS_INIT: Order[] = [
  { id: 'A-2247', cust: 'K. (gymrat_84)', custId: 't01', channel: 'wa', items: 'Reta 10mg ×2', amt: 330, asset: 'USDT', age: '8m', state: 'awaiting', invoiced: '8m ago' },
  { id: 'A-2246', cust: 'swolepriest', custId: 't04', channel: 'tg', items: 'Tirz 30mg ×2', amt: 440, asset: 'BTC', age: '22m', state: 'awaiting', invoiced: '22m ago' },
  { id: 'A-2245', cust: 'M.R.', custId: 't07', channel: 'wa', items: 'GHK-Cu 50mg ×1', amt: 75, asset: 'USDT', age: '1h 4m', state: 'awaiting', invoiced: '1h ago' },
  { id: 'A-2244', cust: 'K. (gymrat_84)', custId: 't01', channel: 'wa', items: 'BPC-157 5mg ×3, GHK ×1', amt: 189, asset: 'USDT', age: '12m', state: 'confirming', confirms: 8, needs: 12, txHash: '0x71c4…ae93' },
  { id: 'A-2243', cust: 'T.B.', custId: 't12', channel: 'tg', items: 'Tirz 30mg ×1', amt: 220, asset: 'BTC', age: '34m', state: 'confirming', confirms: 2, needs: 3, txHash: 'bc1q…0x4a' },
  { id: 'A-2242', cust: 'irongoblin', custId: 't09', channel: 'tg', items: 'Reta 10mg ×1, BPC ×2', amt: 241, asset: 'XMR', age: '1h 12m', state: 'confirming', confirms: 6, needs: 10, txHash: '4ABc…f2e1' },
  { id: 'A-2241', cust: 'K. (gymrat_84)', custId: 't01', channel: 'wa', items: 'Reta 10mg ×2', amt: 330, asset: 'USDT', age: '2h', state: 'packing', picker: 'self', batch: 'REL-0419-A' },
  { id: 'A-2240', cust: 'ladyswole', custId: 't05', channel: 'wa', items: 'Tirz 30mg ×1', amt: 220, asset: 'USDT', age: '3h', state: 'packing', picker: 'self', batch: 'TIR-0411-C' },
  { id: 'A-2238', cust: 'M.S.', custId: 't08', channel: 'em', items: 'BPC-157 5mg ×4', amt: 152, asset: 'Cash', age: '1d', state: 'shipped', carrier: 'USPS Ground Adv.', track: '9400…21', eta: 'Apr 24' },
  { id: 'A-2237', cust: 'swolepriest', custId: 't04', channel: 'tg', items: 'Reta 10mg ×1', amt: 165, asset: 'BTC', age: '1d', state: 'shipped', carrier: 'USPS Priority', track: '9505…74', eta: 'Apr 23' },
  { id: 'A-2235', cust: 'T.B.', custId: 't12', channel: 'tg', items: 'GHK-Cu 50mg ×2', amt: 150, asset: 'BTC', age: '2d', state: 'shipped', carrier: 'USPS Priority', track: '9505…11', eta: 'Apr 23' },
  { id: 'A-2231', cust: 'irongoblin', custId: 't09', channel: 'tg', items: 'Tirz 30mg ×1', amt: 220, asset: 'XMR', age: '3d', state: 'delivered', deliveredAt: 'Apr 19' },
  { id: 'A-2228', cust: 'K. (gymrat_84)', custId: 't01', channel: 'wa', items: 'BPC-157 5mg ×3', amt: 114, asset: 'USDT', age: '4d', state: 'delivered', deliveredAt: 'Apr 18' },
]

const COLUMNS: { id: OrderState; label: string; caption: string }[] = [
  { id: 'awaiting',   label: 'Awaiting payment', caption: 'Invoice sent · waiting for tx' },
  { id: 'confirming', label: 'Confirming',        caption: 'Tx seen · waiting for N confirms' },
  { id: 'packing',    label: 'Packing',           caption: 'Paid · ready to ship' },
  { id: 'shipped',    label: 'Shipped',           caption: 'In transit' },
  { id: 'delivered',  label: 'Delivered',         caption: 'Closed' },
]

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0]]).join('')
}

function OrderCard({ order: o, pulse, onDragStart, onDragEnd, onAdvance, isDragging }: {
  order: Order; pulse?: string; onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void; onAdvance: (id: string, state: OrderState) => void; isDragging: boolean
}) {
  const ChIcon = CH_ICONS[o.channel]
  const confirmReady = o.state === 'confirming' && (o.confirms ?? 0) >= (o.needs ?? 0)
  const nextState: OrderState | null = (
    o.state === 'confirming' && confirmReady ? 'packing' :
    o.state === 'packing' ? 'shipped' :
    o.state === 'shipped' ? 'delivered' : null
  )
  const nextLabel: Record<string, string> = { packing: 'Confirm payment →', shipped: 'Mark packed →', delivered: 'Mark delivered →' }

  return (
    <article
      className={`pt-or-card pt-or-card-${o.state} ${pulse ? `pt-or-pulse-${pulse}` : ''} ${isDragging ? 'is-dragging' : ''}`}
      draggable onDragStart={(e) => onDragStart(e, o.id)} onDragEnd={onDragEnd}
    >
      <header className="pt-or-card-hd">
        <span className="pt-or-card-id mono">#{o.id}</span>
        <span className="pt-or-card-age mono">{o.age}</span>
      </header>
      <div className="pt-or-card-cust">
        <div className="pt-or-card-av" data-channel={o.channel}>
          <span>{initials(o.cust)}</span>
          <i className={`pt-thread-ch pt-ch-${o.channel}`}>{ChIcon && <ChIcon size={8} />}</i>
        </div>
        <div className="pt-or-card-name">{o.cust}</div>
      </div>
      <div className="pt-or-card-items">{o.items}</div>
      <div className="pt-or-card-pay">
        <span className="pt-pay-asset" data-asset={o.asset}>{o.asset}</span>
        <span className="pt-or-card-amt mono">${o.amt}</span>
      </div>

      {o.state === 'awaiting' && (
        <div className="pt-or-card-state pt-or-state-await"><Icons.clock size={11} /><span>invoice sent {o.invoiced}</span></div>
      )}
      {o.state === 'confirming' && (
        <div className="pt-or-card-confirm">
          <div className="pt-or-confirm-row">
            <span className="pt-or-confirm-tx mono">{o.txHash}</span>
            <span className="pt-or-confirm-ct mono">{o.confirms}/{o.needs}</span>
          </div>
          <div className="pt-or-confirm-bar">
            {Array.from({ length: o.needs ?? 0 }).map((_, i) => (
              <span key={i} className={`pt-or-confirm-tick ${i < (o.confirms ?? 0) ? 'is-on' : ''} ${confirmReady ? 'is-ready' : ''}`} />
            ))}
          </div>
          <div className="pt-or-confirm-cap">
            {confirmReady ? <><Icons.check size={11} /> ready to advance</> : <>waiting · ~{Math.max(1, ((o.needs ?? 0) - (o.confirms ?? 0)) * 2)}m</>}
          </div>
        </div>
      )}
      {o.state === 'packing' && (
        <div className="pt-or-card-state pt-or-state-pack"><Icons.box size={11} /><span>batch {o.batch}</span></div>
      )}
      {o.state === 'shipped' && (
        <div className="pt-or-card-state pt-or-state-ship"><Icons.truck size={11} /><span>{o.carrier} · ETA {o.eta}</span></div>
      )}
      {o.state === 'delivered' && (
        <div className="pt-or-card-state pt-or-state-done"><Icons.check size={11} /><span>delivered {o.deliveredAt}</span></div>
      )}
      {nextState && (
        <button className="pt-or-advance" onClick={() => onAdvance(o.id, nextState)}>
          {nextLabel[nextState] ?? `→ ${nextState}`}
        </button>
      )}
    </article>
  )
}

export function OrdersView() {
  const [orders, setOrders] = useState(ORDERS_INIT)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [pulse, setPulse] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null)

  useEffect(() => {
    const t = setInterval(() => {
      setOrders((prev) => {
        const candidates = prev.filter(o => o.state === 'confirming' && (o.confirms ?? 0) < (o.needs ?? 0))
        if (!candidates.length) return prev
        const target = candidates[Math.floor(Math.random() * candidates.length)]
        return prev.map(o => o.id === target.id ? { ...o, confirms: (o.confirms ?? 0) + 1 } : o)
      })
    }, 6500)
    return () => clearInterval(t)
  }, [])

  const showToast = (text: string, kind = 'ok') => {
    setToast({ text, kind, id: Date.now() })
    setTimeout(() => setToast(null), 2400)
  }

  const flash = (id: string, kind: string) => {
    setPulse(p => ({ ...p, [id]: kind }))
    setTimeout(() => setPulse(p => { const n = { ...p }; delete n[id]; return n }), 700)
  }

  const tryMove = (orderId: string, toState: OrderState) => {
    const o = orders.find(x => x.id === orderId)
    if (!o || o.state === toState) return
    if (o.state === 'confirming' && ['packing', 'shipped', 'delivered'].includes(toState)) {
      if ((o.confirms ?? 0) < (o.needs ?? 0)) {
        flash(orderId, 'err')
        showToast(`#${orderId} blocked — ${o.confirms}/${o.needs} confirmations`, 'err')
        return
      }
    }
    if (o.state === 'awaiting' && ['packing', 'shipped', 'delivered'].includes(toState)) {
      flash(orderId, 'err')
      showToast(`#${orderId} blocked — no payment received yet`, 'err')
      return
    }
    setOrders(prev => prev.map(x => x.id === orderId ? { ...x, state: toState } : x))
    flash(orderId, 'ok')
    showToast(`#${orderId} → ${COLUMNS.find(c => c.id === toState)?.label}`)
  }

  const totalAwaiting = orders.filter(o => o.state === 'awaiting' || o.state === 'confirming').reduce((s, o) => s + o.amt, 0)
  const inFlight = orders.filter(o => o.state === 'shipped').length

  return (
    <div className="pt-or">
      <div className="pt-or-hd">
        <div>
          <h1>Orders</h1>
          <p>{orders.length} open · ${totalAwaiting.toLocaleString()} awaiting payment · {inFlight} in transit</p>
        </div>
        <div className="pt-or-hd-actions">
          <div className="pt-or-search"><Icons.search size={12} /><input placeholder="Search by # or customer…" /></div>
          <button className="pt-btn pt-btn-ghost"><Icons.filter size={12} /> Filter</button>
          <button className="pt-btn pt-btn-ghost"><Icons.box size={12} /> Print labels (3)</button>
          <button className="pt-btn pt-btn-primary"><Icons.plus size={12} /> New order</button>
        </div>
      </div>

      <div className="pt-or-board">
        {COLUMNS.map(col => {
          const colOrders = orders.filter(o => o.state === col.id)
          const isOver = dragOverCol === col.id && dragId
          const dragged = dragId ? orders.find(o => o.id === dragId) : null
          const wouldBlock = dragged && (
            (dragged.state === 'awaiting' && ['packing', 'shipped', 'delivered'].includes(col.id)) ||
            (dragged.state === 'confirming' && ['packing', 'shipped', 'delivered'].includes(col.id) && (dragged.confirms ?? 0) < (dragged.needs ?? 0))
          )
          return (
            <div key={col.id}
              className={`pt-or-col ${isOver ? 'is-over' : ''} ${isOver && wouldBlock ? 'is-blocked' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.id) }}
              onDragLeave={e => { if (e.currentTarget === e.target) setDragOverCol(null) }}
              onDrop={e => { e.preventDefault(); if (dragId) tryMove(dragId, col.id as OrderState); setDragId(null); setDragOverCol(null) }}
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
                  <OrderCard key={o.id} order={o} pulse={pulse[o.id]}
                    onDragStart={(e, id) => { setDragId(id); e.dataTransfer.effectAllowed = 'move' }}
                    onDragEnd={() => { setDragId(null); setDragOverCol(null) }}
                    onAdvance={tryMove} isDragging={dragId === o.id} />
                ))}
                {colOrders.length === 0 && <div className="pt-or-col-empty">— nothing here —</div>}
              </div>
            </div>
          )
        })}
      </div>

      {toast && (
        <div className={`pt-or-toast pt-or-toast-${toast.kind}`} key={toast.id}>
          {toast.kind === 'err' ? <Icons.x size={12} /> : <Icons.check size={12} />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  )
}
