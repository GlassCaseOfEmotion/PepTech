// src/components/inbox/InboxProvider.tsx
'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  dbConversationToThread, dbMessageToInboxMessage,
  type DbConversation, type DbQuickReply, type InboxThread, type InboxMessage, type DbNote
} from '@/types/inbox'

type InboxCtx = {
  threads: InboxThread[]
  activeId: string
  setActiveId: (id: string) => void
  filter: string
  setFilter: (f: string) => void
  messages: InboxMessage[]
  notes: DbNote[]
  quickReplies: DbQuickReply[]
  isSending: boolean
  sendMessage: (text: string) => Promise<void>
  snooze: () => Promise<void>
  markDone: () => Promise<void>
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
  children: ReactNode
}

export function InboxProvider({ initialConversations, quickReplies, children }: Props) {
  const supabase = createClient()
  const [threads, setThreads] = useState<InboxThread[]>(
    initialConversations.map(dbConversationToThread)
  )
  const [activeId, setActiveIdRaw] = useState(threads[0]?.id ?? '')
  const [filter, setFilter] = useState('all')
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [notes, setNotes] = useState<DbNote[]>([])
  const [isSending, setIsSending] = useState(false)

  // ── Fetch messages for a conversation ──────────────────────────────────────
  const fetchMessages = useCallback(async (conversationId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('id, direction, content, sent_at, status, metadata')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true })
      .limit(100)
    setMessages((data ?? []).map(m => dbMessageToInboxMessage(m as any)))
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

  // ── Select a conversation ──────────────────────────────────────────────────
  const setActiveId = useCallback((id: string) => {
    setActiveIdRaw(id)
    setMessages([])
    setNotes([])
    fetchMessages(id)
    const thread = threads.find(t => t.id === id)
    if (thread?.customerId) fetchNotes(thread.customerId)
    // Reset unread count locally and in DB
    setThreads(prev => prev.map(t => t.id === id ? { ...t, unread: 0 } : t))
    supabase.from('conversations').update({ unread_count: 0 }).eq('id', id)
  }, [threads, fetchMessages, fetchNotes, supabase])

  // ── Send a message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!activeId || !text.trim()) return
    const tempId = `tmp-${Date.now()}`
    const now = new Date().toISOString()
    const optimistic: InboxMessage = {
      id: tempId, from: 'me', at: 'Today · just now',
      text, kind: 'text', optimistic: true,
    }
    setMessages(prev => [...prev, optimistic])
    setIsSending(true)
    try {
      const { data: msg } = await supabase
        .from('messages')
        .insert({
          conversation_id: activeId,
          direction: 'outbound',
          content: text,
          status: 'sent',
          sent_at: now,
        } as any)
        .select('id, direction, content, sent_at, status, metadata')
        .single()

      if (msg) {
        setMessages(prev => prev.map(m =>
          m.id === tempId ? dbMessageToInboxMessage(msg as any) : m
        ))
        const snippet = text.slice(0, 120)
        setThreads(prev => prev.map(t =>
          t.id === activeId ? { ...t, snippet, minsAgo: 0 } : t
        ))
        await supabase.from('conversations').update({
          last_message_at: now,
          last_message_snippet: snippet,
          status: 'in_progress',
        }).eq('id', activeId)
      }
    } finally {
      setIsSending(false)
    }
  }, [activeId, supabase])

  // ── Snooze active conversation ─────────────────────────────────────────────
  const snooze = useCallback(async () => {
    if (!activeId) return
    await supabase.from('conversations').update({ status: 'snoozed' }).eq('id', activeId)
    setThreads(prev => prev.map(t => t.id === activeId ? { ...t, status: 'snoozed' } : t))
  }, [activeId, supabase])

  // ── Mark active conversation done ──────────────────────────────────────────
  const markDone = useCallback(async () => {
    if (!activeId) return
    await supabase.from('conversations').update({ status: 'resolved' }).eq('id', activeId)
    setThreads(prev => {
      const remaining = prev.filter(t => t.id !== activeId)
      if (remaining.length > 0) {
        // Select the next conversation after a short tick
        setTimeout(() => setActiveIdRaw(remaining[0].id), 0)
      }
      return remaining
    })
  }, [activeId, supabase])

  // ── Load initial messages on mount ─────────────────────────────────────────
  useEffect(() => {
    if (activeId) {
      fetchMessages(activeId)
      const thread = threads.find(t => t.id === activeId)
      if (thread?.customerId) fetchNotes(thread.customerId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once on mount only

  return (
    <InboxContext.Provider value={{
      threads, activeId, setActiveId, filter, setFilter,
      messages, notes, quickReplies, isSending, sendMessage, snooze, markDone,
    }}>
      {children}
    </InboxContext.Provider>
  )
}
