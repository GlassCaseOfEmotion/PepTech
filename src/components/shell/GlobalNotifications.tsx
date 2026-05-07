'use client'

import { useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { playChime } from '@/lib/notifications'

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
      }, () => {
        playChime()
        window.dispatchEvent(new CustomEvent('pt:new-message'))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  return null
}
