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
      sessions={(sessions ?? []) as AgentSession[]}
      initialSessionId={activeId}
      initialMessages={initialMessages}
    />
  )
}
