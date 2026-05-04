// src/components/inbox/InboxProvider.tsx
'use client'

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  dbConversationToThread, dbMessageToInboxMessage,
  type DbConversation, type DbMessage, type DbQuickReply, type InboxThread, type InboxMessage, type DbNote, type DbTemplate
} from '@/types/inbox'

const CONV_SELECT = `
  id, status, unread_count, last_message_at, last_message_snippet,
  channel_type, channel_identifier,
  customers (
    id, display_name, trust_score, ltv,
    customer_tags (tag),
    customer_channels (channel_type, display_handle, is_primary)
  )
`

type InboxCtx = {
  threads: InboxThread[]
  activeId: string
  setActiveId: (id: string) => void
  filter: string
  setFilter: (f: string) => void
  messages: InboxMessage[]
  notes: DbNote[]
  quickReplies: DbQuickReply[]
  templates: DbTemplate[]
  isSending: boolean
  sendMessage: (text: string) => Promise<void>
  addNote: (content: string) => Promise<void>
  snooze: (until: Date) => Promise<void>
  markDone: () => Promise<void>
  reopen: () => Promise<void>
}

const InboxContext = createContext<InboxCtx | null>(null)

export function useInbox() {
  const ctx = useContext(InboxContext)
  if (!ctx) throw new Error('useInbox must be used inside InboxProvider')
  return ctx
}

interface Props {
  initialConversations: DbConversation[]
  quickReplies: DbQuickReply[]
  templates: DbTemplate[]
  children: ReactNode
}

export function InboxProvider({ initialConversations, quickReplies, templates, children }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [threads, setThreads] = useState<InboxThread[]>(
    initialConversations.map(dbConversationToThread)
  )
  const [activeId, setActiveIdRaw] = useState(threads[0]?.id ?? '')
  const [filter, setFilter] = useState('all')
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [notes, setNotes] = useState<DbNote[]>([])
  const [isSending, setIsSending] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [resolvedLoaded, setResolvedLoaded] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        try {
          const payload = JSON.parse(atob(session.access_token.split('.')[1]))
          setTenantId(payload.tenant_id ?? null)
        } catch { /* ignore */ }
      }
    })
  }, [supabase])

  // ── Unsnooze any expired conversations on mount ────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).rpc('unsnooze_expired').then(() => {
      // Re-fetch threads to pick up any newly unsnoozed conversations
      supabase
        .from('conversations')
        .select(CONV_SELECT)
        .in('status', ['new', 'needs_reply', 'in_progress', 'snoozed'])
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .then(({ data }) => {
          if (data) setThreads(data.map(c => dbConversationToThread(c as unknown as DbConversation)))
        })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fetch messages for a conversation ──────────────────────────────────────
  const fetchMessages = useCallback(async (conversationId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('id, direction, content, sent_at, status, metadata')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true })
      .limit(100)
    const mapped = (data ?? []).map(m => dbMessageToInboxMessage(m as unknown as DbMessage))
    const withUrls = await Promise.all(mapped.map(async msg => {
      if (msg.kind === 'photo' && msg.metadata?.storagePath) {
        const { data: urlData } = await supabase.storage
          .from('media')
          .createSignedUrl(msg.metadata.storagePath as string, 3600)
        return { ...msg, metadata: { ...msg.metadata, mediaUrl: urlData?.signedUrl } }
      }
      return msg
    }))
    setMessages(withUrls)
  }, [supabase])

  // ── Fetch notes for a customer ─────────────────────────────────────────────
  const fetchNotes = useCallback(async (customerId: string) => {
    const { data } = await supabase
      .from('notes')
      .select('id, content, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(10)
    setNotes((data ?? []) as DbNote[])
  }, [supabase])

  // ── Load resolved conversations on demand ──────────────────────────────────
  const loadResolved = useCallback(async () => {
    const { data } = await supabase
      .from('conversations')
      .select(CONV_SELECT)
      .eq('status', 'resolved')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50)
    if (data) {
      setThreads(prev => {
        const existingIds = new Set(prev.map(t => t.id))
        const incoming = (data as unknown as DbConversation[])
          .filter(c => !existingIds.has(c.id))
          .map(dbConversationToThread)
        return [...prev, ...incoming]
      })
      setResolvedLoaded(true)
    }
  }, [supabase])

  useEffect(() => {
    if (filter === 'resolved' && !resolvedLoaded) loadResolved()
  }, [filter, resolvedLoaded, loadResolved])

  // ── Select a conversation ──────────────────────────────────────────────────
  const setActiveId = useCallback((id: string) => {
    setActiveIdRaw(id)
    setMessages([])
    setNotes([])
    fetchMessages(id)
    const thread = threads.find(t => t.id === id)
    if (thread?.customerId) fetchNotes(thread.customerId)
    setThreads(prev => prev.map(t => t.id === id ? { ...t, unread: 0 } : t))
    supabase.from('conversations').update({ unread_count: 0 }).eq('id', id)
  }, [threads, fetchMessages, fetchNotes, supabase])

  // ── Send a message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!activeId || !text.trim()) return
    const tempId = `tmp-${Date.now()}`
    const optimistic: InboxMessage = {
      id: tempId, from: 'me', at: 'Today · just now',
      text, kind: 'text', optimistic: true,
    }
    setMessages(prev => [...prev, optimistic])
    setIsSending(true)
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, content: text }),
      })
      if (!res.ok) throw new Error(`Send failed: ${res.status}`)
      const { messageId } = await res.json() as { messageId: string }
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, id: messageId, optimistic: false } : m
      ))
      setThreads(prev => prev.map(t =>
        t.id === activeId ? { ...t, snippet: text.slice(0, 120), minsAgo: 0 } : t
      ))
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId))
    } finally {
      setIsSending(false)
    }
  }, [activeId])

  // ── Snooze active conversation until a given time ──────────────────────────
  const snooze = useCallback(async (until: Date) => {
    if (!activeId) return
    await supabase.from('conversations').update({
      status: 'snoozed',
      snoozed_until: until.toISOString(),
    } as never).eq('id', activeId)
    setThreads(prev => prev.map(t =>
      t.id === activeId ? { ...t, status: 'snoozed' as const } : t
    ))
    const remaining = threads.filter(t => t.id !== activeId && t.status !== 'snoozed')
    if (remaining.length > 0) setActiveId(remaining[0].id)
  }, [activeId, threads, supabase, setActiveId])

  // ── Add a note to the active conversation's customer ──────────────────────
  const addNote = useCallback(async (content: string) => {
    if (!content.trim() || !activeId || !tenantId) return
    const thread = threads.find(t => t.id === activeId)
    if (!thread?.customerId) return
    const { data: note } = await supabase
      .from('notes')
      .insert({ tenant_id: tenantId, customer_id: thread.customerId, content: content.trim() })
      .select('id, content, created_at')
      .single()
    if (note) setNotes(prev => [note as DbNote, ...prev])
  }, [activeId, threads, tenantId, supabase])

  // ── Mark active conversation done ──────────────────────────────────────────
  const markDone = useCallback(async () => {
    if (!activeId) return
    await supabase.from('conversations').update({ status: 'resolved' }).eq('id', activeId)
    // Keep in threads state as 'resolved' so resolved filter can show it
    setThreads(prev => prev.map(t =>
      t.id === activeId ? { ...t, status: 'resolved' as const } : t
    ))
    const remaining = threads.filter(t => t.id !== activeId && t.status !== 'resolved')
    if (remaining.length > 0) setActiveId(remaining[0].id)
  }, [activeId, threads, supabase, setActiveId])

  // ── Reopen a resolved conversation ────────────────────────────────────────
  const reopen = useCallback(async () => {
    if (!activeId) return
    await supabase.from('conversations').update({ status: 'needs_reply' }).eq('id', activeId)
    setThreads(prev => prev.map(t =>
      t.id === activeId ? { ...t, status: 'needs_reply' as const } : t
    ))
  }, [activeId, supabase])

  // ── Load initial messages on mount ─────────────────────────────────────────
  useEffect(() => {
    if (activeId) {
      fetchMessages(activeId)
      const thread = threads.find(t => t.id === activeId)
      if (thread?.customerId) fetchNotes(thread.customerId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Real-time: messages for active conversation ────────────────────────────
  useEffect(() => {
    if (!activeId) return
    const channel = supabase
      .channel(`messages:${activeId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${activeId}`,
      }, async (payload) => {
        let newMsg = dbMessageToInboxMessage(payload.new as unknown as DbMessage)
        if (newMsg.kind === 'photo' && newMsg.metadata?.storagePath) {
          try {
            const { data: urlData } = await supabase.storage
              .from('media')
              .createSignedUrl(newMsg.metadata.storagePath as string, 3600)
            if (urlData?.signedUrl) {
              newMsg = { ...newMsg, metadata: { ...newMsg.metadata, mediaUrl: urlData.signedUrl } }
            }
          } catch { /* show placeholder if signing fails */ }
        }
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev
          if (newMsg.from === 'me') {
            const optIdx = prev.findIndex(m => m.optimistic && m.text === newMsg.text)
            if (optIdx >= 0) return prev.map((m, i) => i === optIdx ? newMsg : m)
          }
          return [...prev, newMsg]
        })
      })
      .subscribe((status, err) => {
        console.log('[RT] messages subscription:', status, err ?? '')
      })
    return () => { supabase.removeChannel(channel) }
  }, [activeId, supabase])

  // ── Real-time: conversation list updates ──────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('conversations:list')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
        const updated = payload.new as unknown as DbConversation
        setThreads(prev => prev.map(t => {
          if (t.id !== updated.id) return t
          return {
            ...t,
            snippet: updated.last_message_snippet ?? t.snippet,
            unread: updated.unread_count ?? t.unread,
            status: updated.status,
            minsAgo: updated.last_message_at
              ? Math.floor((Date.now() - new Date(updated.last_message_at).getTime()) / 60000)
              : t.minsAgo,
          }
        }))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, async (payload) => {
        const { data } = await supabase
          .from('conversations')
          .select(CONV_SELECT)
          .eq('id', payload.new.id)
          .single()
        if (data) {
          setThreads(prev => [dbConversationToThread(data as unknown as DbConversation), ...prev])
        }
      })
      .subscribe((status, err) => {
        console.log('[RT] conversations subscription:', status, err ?? '')
      })
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  return (
    <InboxContext.Provider value={{
      threads, activeId, setActiveId, filter, setFilter,
      messages, notes, quickReplies, templates, isSending, sendMessage, addNote, snooze, markDone, reopen,
    }}>
      {children}
    </InboxContext.Provider>
  )
}
