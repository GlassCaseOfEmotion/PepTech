'use client'

import { useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { playChime } from '@/lib/notifications'
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
        filter: 'direction=eq.inbound',
      }, async (payload) => {
        playChime()

        const raw = payload.new as { id: string; conversation_id: string; content: string }

        // Fetch customer name for the notification title
        const { data: conv } = await supabase
          .from('conversations')
          .select('id, customers(display_name)')
          .eq('id', raw.conversation_id)
          .single()

        const customerName =
          (conv?.customers as { display_name: string } | null)?.display_name ?? 'Customer'

        const item: NotificationItem = {
          id: raw.id,
          type: 'message',
          title: `New message · ${customerName}`,
          body: raw.content?.slice(0, 80) ?? '',
          href: `/inbox?conversation=${raw.conversation_id}`,
          at: Date.now(),
        }

        window.dispatchEvent(new CustomEvent('pt:notification', { detail: item }))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  return null
}
