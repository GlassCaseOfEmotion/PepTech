'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ThreadList } from './ThreadList'
import { ConversationPane } from './ConversationPane'
import { CustomerRail } from './CustomerRail'
import type { ConversationWithCustomer, MessageRow } from '@/types/inbox'
import type { QuickReply } from './Composer'

interface InboxViewProps {
  initialConversations: ConversationWithCustomer[]
  initialConversationId?: string | null
  initialMessages?: MessageRow[]
  quickReplies: QuickReply[]
}

export function InboxView({
  initialConversations,
  initialConversationId = null,
  initialMessages = [],
  quickReplies,
}: InboxViewProps) {
  const router = useRouter()
  const [conversations, setConversations] = useState(initialConversations)
  const [activeId, setActiveId] = useState<string | null>(initialConversationId)
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages)

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null

  // Real-time: conversations list updates
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('inbox-conversations')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
        setConversations((prev) =>
          prev
            .map((c) => (c.id === payload.new.id ? { ...c, ...(payload.new as Partial<ConversationWithCustomer>) } : c))
            .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
        )
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, async (payload) => {
        const sb = createClient()
        const { data } = await sb
          .from('conversations')
          .select('id, status, unread_count, last_message_at, last_message_snippet, channel_type, channel_identifier, customers(id, display_name, trust_score, ltv, customer_tags(tag))')
          .eq('id', payload.new.id)
          .single()
        if (data) {
          setConversations((prev) => [data as unknown as ConversationWithCustomer, ...prev])
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Real-time: messages for active conversation
  useEffect(() => {
    if (!activeId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`messages-${activeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev
            return [...prev, payload.new as MessageRow]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeId])

  const handleSelect = useCallback(async (id: string) => {
    setActiveId(id)
    router.push(`/inbox/${id}`, { scroll: false })

    // Load messages for selected conversation
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('id, direction, content, sent_at, status')
      .eq('conversation_id', id)
      .order('sent_at', { ascending: true })
      .limit(50)
    setMessages(data ?? [])

    // Mark as read
    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id)
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)))
  }, [router])

  const handleSend = useCallback(async (content: string) => {
    if (!activeId) return
    await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: activeId, content }),
    })
    // Message arrives via real-time subscription
  }, [activeId])

  return (
    <div className="pt-inbox">
      <ThreadList conversations={conversations} activeId={activeId} onSelect={handleSelect} />
      {activeConversation ? (
        <>
          <ConversationPane
            conversation={activeConversation}
            messages={messages}
            onSend={handleSend}
            quickReplies={quickReplies}
          />
          <CustomerRail conversation={activeConversation} />
        </>
      ) : (
        <div
          className="pt-ix-conv"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pt-fg-4)', fontSize: 13 }}
        >
          Select a conversation to start messaging
        </div>
      )}
    </div>
  )
}
