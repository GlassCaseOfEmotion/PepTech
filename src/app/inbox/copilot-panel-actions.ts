'use server'

import { createClient, getServerUser } from '@/lib/supabase/server'
import { getOrCreateCopilotSession } from '@/lib/agent/copilot/session'
import { readDraftOrder } from '@/lib/agent/copilot/draft-order'

async function ctx() {
  const user = await getServerUser()
  if (!user) return null
  const supabase = await createClient()
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return null
  return { supabase, tenantId: userRow.tenant_id as string }
}

export interface CopilotTimelineMessage {
  id: string
  role: string
  content: string | null
  toolCalls: { id: string; name: string; input: Record<string, unknown>; output: unknown; status: string }[]
  createdAt: string
}

/** The copilot session id for a conversation (created lazily if absent). */
export async function getCopilotSessionId(conversationId: string): Promise<string | null> {
  const c = await ctx()
  if (!c) return null
  return getOrCreateCopilotSession(c.supabase, c.tenantId, conversationId)
}

/** The persisted copilot turns for a session, oldest first. */
export async function getCopilotTimeline(sessionId: string): Promise<CopilotTimelineMessage[]> {
  const c = await ctx()
  if (!c) return []
  const { data } = await c.supabase
    .from('agent_messages')
    .select('id, role, content, tool_calls, created_at')
    .eq('session_id', sessionId)
    .eq('tenant_id', c.tenantId)
    .order('created_at', { ascending: true })
  return (data ?? []).map(m => ({
    id: m.id as string,
    role: m.role as string,
    content: (m.content as string | null) ?? null,
    toolCalls: ((m.tool_calls as CopilotTimelineMessage['toolCalls'] | null) ?? []),
    createdAt: m.created_at as string,
  }))
}

/** The conversation's live draft order (or null). */
export async function getConversationDraftOrder(conversationId: string): Promise<unknown> {
  const c = await ctx()
  if (!c) return null
  return readDraftOrder(c.supabase, c.tenantId, conversationId)
}
