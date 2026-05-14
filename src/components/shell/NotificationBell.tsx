'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'

export interface NotificationItem {
  id: string
  type: 'message' | 'payment' | 'order' | 'stock' | 'warn'
  title: string
  body: string
  href: string
  at: number
}

function fmtAge(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [seenCount, setSeenCount] = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()

  const unread = Math.max(0, items.length - seenCount)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NotificationItem>).detail
      setItems(prev => [detail, ...prev].slice(0, 30))
      setAnimKey(k => k + 1)
    }
    const updateHandler = (e: Event) => {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail
      setItems(prev => prev.map(item => item.id === id ? { ...item, title } : item))
    }
    window.addEventListener('pt:notification', handler)
    window.addEventListener('pt:notification:update', updateHandler)
    return () => {
      window.removeEventListener('pt:notification', handler)
      window.removeEventListener('pt:notification:update', updateHandler)
    }
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        !panelRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggleOpen = () => {
    setOpen(o => {
      if (!o) setSeenCount(items.length) // opening → mark all seen
      return !o
    })
  }

  const visit = (item: NotificationItem) => {
    setOpen(false)
    router.push(item.href)
  }

  const clearAll = () => {
    setItems([])
    setSeenCount(0)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        className={`pt-iconbtn${unread > 0 ? ' has-notif' : ''}`}
        title={unread > 0 ? `${unread} notification${unread === 1 ? '' : 's'}` : 'Notifications'}
        onClick={toggleOpen}
      >
        <Icons.bell size={14} />
        {unread > 0 && (
          <span key={animKey} className="pt-iconbtn-dot pt-notif-dot">
            {unread > 1 ? (unread > 9 ? '9+' : String(unread)) : ''}
          </span>
        )}
      </button>

      {open && (
        <div ref={panelRef} className="pt-notif-panel">
          <div className="pt-notif-panel-hd">
            <span className="pt-notif-panel-title">Notifications</span>
            {items.length > 0 && (
              <button className="pt-notif-panel-clear" onClick={clearAll}>Clear all</button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="pt-notif-empty">
              <span className="pt-notif-empty-icon">✓</span>
              All clear — nothing to action
            </div>
          ) : (
            <ul className="pt-notif-items">
              {items.map(item => (
                <li key={item.id} className="pt-notif-item" onClick={() => visit(item)}>
                  <div className={`pt-notif-bar pt-notif-bar-${item.type}`} />
                  <div className="pt-notif-body">
                    <div className="pt-notif-item-title">{item.title}</div>
                    <div className="pt-notif-item-body">{item.body}</div>
                  </div>
                  <div className="pt-notif-item-time">{fmtAge(item.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
