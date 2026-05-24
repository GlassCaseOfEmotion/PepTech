// src/components/inbox/InboxProvider.tsx
'use client'

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  dbConversationToThread, dbMessageToInboxMessage,
  type DbConversation, type DbMessage, type DbQuickReply, type InboxThread, type InboxMessage, type DbNote, type DbTemplate
} from '@/types/inbox'
import { playChime, tryNotify } from '@/lib/notifications'

const CONV_SELECT = `
  id, status, unread_count, last_message_at, last_message_snippet,
  channel_type, channel_identifier, is_pinned, window_expires_at,
  customers (
    id, display_name, trust_score, ltv, lifecycle_stage, acquisition_source,
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
  messagesLoading: boolean
  resolvedCount: number
  activeThread: InboxThread | null
  sendMessage: (text: string) => Promise<void>
  sendTemplate: (templateId: string, variables: Record<string, string>) => Promise<void>
  addNote: (content: string) => Promise<void>
  snooze: (until: Date) => Promise<void>
  markDone: () => Promise<void>
  reopen: () => Promise<void>
  togglePin: (id: string) => Promise<void>
  pendingInvoicePath: string | null
  pendingInvoiceName: string | null
  clearPendingInvoice: () => void
  updateThreadLifecycle: (threadId: string, stage: 'lead' | 'customer') => void
  updateThreadAcquisitionSource: (threadId: string, source: 'referral' | 'community' | 'group_chat' | 'direct' | 'other' | null) => void
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
  initialResolvedCount?: number
  initialActiveId?: string
  initialInvoicePath?: string
  initialInvoiceName?: string
  children: ReactNode
}


export function InboxProvider({ initialConversations, quickReplies, templates, initialResolvedCount = 0, initialActiveId, initialInvoicePath, initialInvoiceName, children }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [threads, setThreads] = useState<InboxThread[]>(
    initialConversations.map(dbConversationToThread)
  )
  const [activeId, setActiveIdRaw] = useState(() => {
    if (initialActiveId && initialConversations.some(c => c.id === initialActiveId)) return initialActiveId
    return threads[0]?.id ?? ''
  })
  const [filter, setFilter] = useState('all')
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [resolvedCount, setResolvedCount] = useState(initialResolvedCount)
  const signedUrlsRef = useRef<Set<string>>(new Set())
  const activeIdRef = useRef(activeId)
  const messageCacheRef = useRef<Record<string, InboxMessage[]>>({})
  const notesCacheRef = useRef<Record<string, DbNote[]>>({})
  const [notes, setNotes] = useState<DbNote[]>([])
  const [isSending, setIsSending] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [pendingInvoicePath, setPendingInvoicePath] = useState(initialInvoicePath ?? null)
  const [pendingInvoiceName, setPendingInvoiceName] = useState(initialInvoiceName ?? null)
  const clearPendingInvoice = useCallback(() => {
    setPendingInvoicePath(null)
    setPendingInvoiceName(null)
  }, [])
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
    // Track IDs so the signing effect doesn't re-process messages already signed at fetch time
    mapped.forEach(m => { if (m.kind === 'photo') signedUrlsRef.current.add(m.id) })
    const withUrls = await Promise.all(mapped.map(async msg => {
      if (msg.kind === 'photo' && msg.metadata?.storagePath) {
        const photoBucket = (msg.metadata.bucket as string | undefined) ?? 'media'
        const { data: urlData } = await supabase.storage
          .from(photoBucket)
          .createSignedUrl(msg.metadata.storagePath as string, 3600, { transform: { width: 1200, quality: 80, resize: 'contain' } })
        return { ...msg, metadata: { ...msg.metadata, mediaUrl: urlData?.signedUrl } }
      }
      return msg
    }))
    messageCacheRef.current[conversationId] = withUrls
    if (activeIdRef.current === conversationId) {
      setMessages(withUrls)
      setMessagesLoading(false)
    }
  }, [supabase])

  // ── Fetch notes for a customer ─────────────────────────────────────────────
  const fetchNotes = useCallback(async (customerId: string) => {
    const { data } = await supabase
      .from('notes')
      .select('id, content, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(10)
    const result = (data ?? []) as DbNote[]
    notesCacheRef.current[customerId] = result
    setNotes(result)
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
      setResolvedCount(data.length)
      setResolvedLoaded(true)
    }
  }, [supabase])

  useEffect(() => {
    if (filter === 'resolved' && !resolvedLoaded) loadResolved()
  }, [filter, resolvedLoaded, loadResolved])

  // ── Select a conversation ──────────────────────────────────────────────────
  const setActiveId = useCallback((id: string) => {
    activeIdRef.current = id
    setActiveIdRaw(id)
    // Show cached messages/notes immediately — no empty flash
    const cached = messageCacheRef.current[id]
    setMessages(cached ?? [])
    setMessagesLoading(!cached)
    const thread = threads.find(t => t.id === id)
    if (thread?.customerId) {
      setNotes(notesCacheRef.current[thread.customerId] ?? [])
      fetchNotes(thread.customerId)
    }
    fetchMessages(id)
    setThreads(prev => prev.map(t => t.id === id ? { ...t, unread: 0 } : t))
    void supabase.from('conversations').update({ unread_count: 0 }).eq('id', id).then()
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
      const data = await res.json() as { messageId?: string; error?: string }

      if (data.error === 'window_expired') {
        setMessages(prev => prev.map(m => m.id === tempId
          ? { ...m, id: data.messageId ?? tempId, optimistic: false, status: 'failed', error: 'window_expired' as const }
          : m))
        return
      }
      if (!res.ok) throw new Error(`Send failed: ${res.status}`)
      const { messageId } = data
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, id: messageId!, optimistic: false } : m
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

  // ── Active thread derived value ───────────────────────────────────────────
  const activeThread = useMemo(() => threads.find(t => t.id === activeId) ?? null, [threads, activeId])

  // ── Send a template message ────────────────────────────────────────────────
  const sendTemplate = useCallback(async (templateId: string, variables: Record<string, string>) => {
    if (!activeId) return
    setIsSending(true)
    try {
      const sendRes = await fetch('/api/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, templateId, templateVariables: variables }) })
      if (!sendRes.ok) throw new Error(`Template send failed: ${sendRes.status}`)
      await fetchMessages(activeId)
    } finally { setIsSending(false) }
  }, [activeId, fetchMessages])

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
    setThreads(prev => prev.map(t =>
      t.id === activeId ? { ...t, status: 'resolved' as const } : t
    ))
    setResolvedCount(c => c + 1)
    const remaining = threads.filter(t => t.id !== activeId && t.status !== 'resolved')
    if (remaining.length > 0) setActiveId(remaining[0].id)
  }, [activeId, threads, supabase, setActiveId])

  // ── Pin / unpin a conversation ────────────────────────────────────────────
  const togglePin = useCallback(async (id: string) => {
    const thread = threads.find(t => t.id === id)
    if (!thread) return
    const newVal = !thread.pinned
    setThreads(prev => prev.map(t => t.id === id ? { ...t, pinned: newVal } : t))
    await supabase.from('conversations').update({ is_pinned: newVal } as never).eq('id', id)
  }, [threads, supabase])

  // ── Optimistic thread field updates ──────────────────────────────────────
  const updateThreadLifecycle = useCallback((threadId: string, stage: 'lead' | 'customer') => {
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, lifecycleStage: stage } : t))
  }, [])

  const updateThreadAcquisitionSource = useCallback((
    threadId: string,
    source: 'referral' | 'community' | 'group_chat' | 'direct' | 'other' | null,
  ) => {
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, acquisitionSource: source } : t))
  }, [])

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
      activeIdRef.current = activeId
      setMessagesLoading(true)
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
      }, (payload) => {
        const raw = payload.new as unknown as DbMessage & { conversation_id: string }
        const newMsg = dbMessageToInboxMessage(raw)
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev
          let next: InboxMessage[]
          if (newMsg.from === 'me') {
            const optIdx = prev.findIndex(m => m.optimistic && m.text === newMsg.text)
            next = optIdx >= 0 ? prev.map((m, i) => i === optIdx ? newMsg : m) : [...prev, newMsg]
          } else {
            next = [...prev, newMsg]
          }
          messageCacheRef.current[activeId] = next
          return next
        })
        // GlobalNotifications may not fire when InboxProvider has a filtered
        // subscription on the same table — handle chime + notification here for inbound
        if (raw.direction === 'inbound' && tryNotify(raw.id)) {
          playChime()
          window.dispatchEvent(new CustomEvent('pt:notification', { detail: {
            id: raw.id, type: 'message', title: 'New message',
            body: raw.content?.slice(0, 80) ?? '',
            href: `/inbox?conversation=${raw.conversation_id}`,
            at: Date.now(),
          }}))
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${activeId}`,
      }, (payload) => {
        const updated = payload.new as unknown as DbMessage
        setMessages(prev => prev.map(m =>
          m.id === updated.id
            ? { ...m, status: updated.status, metadata: updated.metadata }
            : m
        ))
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
            pinned: updated.is_pinned ?? t.pinned,
            windowExpiresAt: updated.window_expires_at ?? t.windowExpiresAt,
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

  // ── Generate signed URLs for photo messages that arrived without one ─────────
  useEffect(() => {
    const unsigned = messages.filter(
      m => m.kind === 'photo' && m.metadata?.storagePath && !m.metadata?.mediaUrl
        && !signedUrlsRef.current.has(m.id)
    )
    if (unsigned.length === 0) return
    unsigned.forEach(msg => {
      signedUrlsRef.current.add(msg.id)
      const photoBucket = (msg.metadata!.bucket as string | undefined) ?? 'media'
      supabase.storage.from(photoBucket).createSignedUrl(msg.metadata!.storagePath as string, 3600, { transform: { width: 1200, quality: 80 } })
        .then(({ data }) => {
          if (!data?.signedUrl) return
          const url = data.signedUrl
          const applyUrl = (msgs: InboxMessage[]) =>
            msgs.map(m => m.id === msg.id ? { ...m, metadata: { ...m.metadata, mediaUrl: url } } : m)
          setMessages(prev => {
            const next = applyUrl(prev)
            const cacheKey = activeIdRef.current
            if (messageCacheRef.current[cacheKey]) {
              messageCacheRef.current[cacheKey] = applyUrl(messageCacheRef.current[cacheKey])
            }
            return next
          })
        })
        .catch(() => { /* keep placeholder */ })
    })
  }, [messages, supabase])

  return (
    <InboxContext.Provider value={{
      threads, activeId, setActiveId, filter, setFilter,
      messages, notes, quickReplies, templates, isSending, messagesLoading, resolvedCount, activeThread, sendMessage, sendTemplate, addNote, snooze, markDone, reopen, togglePin,
      pendingInvoicePath, pendingInvoiceName, clearPendingInvoice,
      updateThreadLifecycle, updateThreadAcquisitionSource,
    }}>
      {children}
    </InboxContext.Provider>
  )
}
