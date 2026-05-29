'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCopilotSessionId, getCopilotTimeline, getConversationDraftOrder } from '@/app/inbox/copilot-panel-actions'
import { mapAgentRow, upsertMessage, type CopilotMsg } from './timeline'

export interface DraftOrderView {
  id: string; ref_number: string; status: string; payment_amount: number
  payment_asset: string | null; currency: string; shipping_address: unknown
  order_items: { product_id: string; qty: number; unit_price_snapshot: number; products?: { name: string } | null }[]
}

interface CopilotSession {
  sessionId: string | null
  messages: CopilotMsg[]
  draftOrder: DraftOrderView | null
  loading: boolean
  sending: boolean
  send: (text: string) => Promise<void>
  confirm: (messageId: string, toolCallId: string, confirmed: boolean, editedContent?: string) => Promise<void>
  refreshDraft: () => Promise<void>
}

const Ctx = createContext<CopilotSession | null>(null)

/** Owns the copilot session's data + realtime subscription for a single
 * conversation. Mount once per conversation (keyed by conversationId) — it
 * persists across rail open/close so toggling the panel never refetches. */
export function CopilotSessionProvider({ conversationId, children }: { conversationId: string; children: ReactNode }) {
  const supabase = useRef(createClient()).current
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CopilotMsg[]>([])
  const [draftOrder, setDraftOrder] = useState<DraftOrderView | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const refreshDraft = useCallback(async () => {
    setDraftOrder((await getConversationDraftOrder(conversationId)) as DraftOrderView | null)
  }, [conversationId])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setMessages([]); setDraftOrder(null); setSessionId(null)
    ;(async () => {
      const sid = await getCopilotSessionId(conversationId)
      if (cancelled || !sid) { setLoading(false); return }
      setSessionId(sid)
      const [tl] = await Promise.all([getCopilotTimeline(sid), refreshDraft()])
      if (cancelled) return
      setMessages(tl.map(m => ({ id: m.id, role: m.role, content: m.content, toolCalls: m.toolCalls, createdAt: m.createdAt })))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [conversationId, refreshDraft])

  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`agent_messages:${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => { setMessages(prev => upsertMessage(prev, mapAgentRow(payload.new as never))); void refreshDraft() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agent_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => { setMessages(prev => upsertMessage(prev, mapAgentRow(payload.new as never))); void refreshDraft() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, supabase, refreshDraft])

  const send = useCallback(async (text: string) => {
    if (!sessionId || !text.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: `[OPERATOR] ${text.trim()}` }),
      })
      await res.text().catch(() => {})
    } finally { setSending(false) }
  }, [sessionId])

  const confirm = useCallback(async (messageId: string, toolCallId: string, confirmed: boolean, editedContent?: string) => {
    if (!sessionId) return
    const res = await fetch('/api/agent/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId, messageId, toolCallId, confirmed,
        ...(editedContent !== undefined ? { editedInput: { content: editedContent } } : {}),
      }),
    })
    await res.text().catch(() => {})
  }, [sessionId])

  return (
    <Ctx.Provider value={{ sessionId, messages, draftOrder, loading, sending, send, confirm, refreshDraft }}>
      {children}
    </Ctx.Provider>
  )
}

export function useCopilotSession(): CopilotSession {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCopilotSession must be used inside <CopilotSessionProvider>')
  return ctx
}
