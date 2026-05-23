'use client'

import { useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { playChime, tryNotify } from '@/lib/notifications'
import type { NotificationItem } from './NotificationBell'

export function GlobalNotifications() {
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const messagesChannel = supabase
      .channel('global:inbound-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        // No server-side filter — row filters need specific Supabase publication
        // config and can silently fail. Filter in the callback instead.
      }, (payload) => {
        const raw = payload.new as { id: string; conversation_id: string; content: string; direction: string }
        if (raw.direction !== 'inbound') return
        if (!tryNotify(raw.id)) return  // already handled by InboxProvider

        playChime()

        // Dispatch immediately so the bell always fires
        const item: NotificationItem = {
          id: raw.id,
          type: 'message',
          title: 'New message',
          body: raw.content?.slice(0, 80) ?? '',
          href: `/inbox?conversation=${raw.conversation_id}`,
          at: Date.now(),
        }
        window.dispatchEvent(new CustomEvent('pt:notification', { detail: item }))

        // Enrich with customer name asynchronously — non-blocking
        void (async () => {
          try {
            const { data: conv } = await supabase
              .from('conversations')
              .select('id, customers(display_name)')
              .eq('id', raw.conversation_id)
              .single()
            const name = (conv?.customers as { display_name: string } | null)?.display_name
            if (name) {
              window.dispatchEvent(new CustomEvent('pt:notification:update', {
                detail: { id: raw.id, title: `New message · ${name}` },
              }))
            }
          } catch { /* non-fatal — notification already showing */ }
        })()
      })
      .subscribe()

    const orderEventsChannel = supabase
      .channel('global:order-events')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'order_events',
      }, (payload) => {
        const raw = payload.new as { id: string; order_id: string; actor: string; action: string; note: string }
        if (raw.actor !== 'system') return
        if (!['Payment detected', 'Payment settled'].includes(raw.action)) return

        playChime()

        const item: NotificationItem = {
          id: raw.id,
          type: 'payment',
          title: raw.action,
          body: raw.note ?? '',
          href: `/orders/${raw.order_id}`,
          at: Date.now(),
        }
        window.dispatchEvent(new CustomEvent('pt:notification', { detail: item }))

        // Enrich title with order ref number asynchronously
        void (async () => {
          try {
            const { data: order } = await supabase
              .from('orders')
              .select('ref_number')
              .eq('id', raw.order_id)
              .single()
            if (order?.ref_number) {
              window.dispatchEvent(new CustomEvent('pt:notification:update', {
                detail: { id: raw.id, title: `${raw.action} · #${order.ref_number}` },
              }))
            }
          } catch { /* non-fatal — notification already showing */ }
        })()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(messagesChannel)
      supabase.removeChannel(orderEventsChannel)
    }
  }, [supabase])

  return null
}
