export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getServerUser, createClient } from '@/lib/supabase/server'
import { AgentView } from '@/components/agent/AgentView'
import type { AgentSession, AgentMessage } from '@/lib/agent/types'

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const { session: initialSessionId } = await searchParams
  const supabase = await createClient()

  const { data: sessions } = await supabase
    .from('agent_sessions')
    .select('id, trigger, trigger_ref, status, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50)

  const sessionIds = (sessions ?? []).map(s => s.id)

  // Fetch the first user message per session for sidebar snippets
  const { data: firstMsgs } = sessionIds.length
    ? await supabase
        .from('agent_messages')
        .select('session_id, content')
        .in('session_id', sessionIds)
        .eq('role', 'user')
        .order('created_at', { ascending: true })
    : { data: [] }

  const snippetBySession: Record<string, string> = {}
  for (const m of firstMsgs ?? []) {
    if (!snippetBySession[m.session_id] && m.content) {
      snippetBySession[m.session_id] = m.content
    }
  }

  const sessionsWithSnippets = (sessions ?? []).map(s => ({
    ...s,
    snippet: snippetBySession[s.id] ?? undefined,
  })) as AgentSession[]

  // Load messages for the initial session (first or from URL)
  const activeId = initialSessionId ?? (sessions?.[0]?.id ?? null)
  let initialMessages: AgentMessage[] = []
  if (activeId) {
    const { data } = await supabase
      .from('agent_messages')
      .select('id, session_id, tenant_id, role, content, tool_calls, created_at')
      .eq('session_id', activeId)
      .order('created_at', { ascending: true })
    initialMessages = (data ?? []) as AgentMessage[]
  }

  return (
    <AgentView
      sessions={sessionsWithSnippets}
      initialSessionId={activeId}
      initialMessages={initialMessages}
    />
  )
}
