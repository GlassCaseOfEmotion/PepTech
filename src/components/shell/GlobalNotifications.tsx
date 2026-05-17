'use client'

import { useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { playChime, tryNotify } from '@/lib/notifications'
import type { NotificationItem } from './NotificationBell'

export function GlobalNotifications() {
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const channel = supabase
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

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  return null
}
