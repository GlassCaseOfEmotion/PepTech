import type { AgentSupabase } from '../types'
import { executeAgentTurn } from '../executor'
import { createHeadlessSink } from '../sink'
import { getOrCreateCopilotSession } from './session'

export interface CopilotWatchParams {
  tenantId: string
  conversationId: string
  customerId: string
  messageId: string
}

/** Fire-and-forget. Gate on copilot_enabled, debounce to the latest inbound,
 * then run one headless copilot turn over the tagged inbound message. Never throws. */
export async function runCopilotWatch(supabase: AgentSupabase, params: CopilotWatchParams): Promise<void> {
  const tag = `[copilot] conv=${params.conversationId}`
  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('copilot_enabled')
      .eq('id', params.tenantId)
      .single()
    if (!tenant?.copilot_enabled) { console.log(`${tag} skip: disabled`); return }

    const { data: latest } = await supabase
      .from('messages')
      .select('id, content')
      .eq('conversation_id', params.conversationId)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
    const latestRow = latest?.[0] as { id: string; content: string } | undefined
    if (latestRow?.id && latestRow.id !== params.messageId) { console.log(`${tag} skip: superseded`); return }

    const sessionId = await getOrCreateCopilotSession(supabase, params.tenantId, params.conversationId)
    if (!sessionId) { console.log(`${tag} skip: no session`); return }

    const content = latestRow?.content ?? ''
    console.log(`${tag} running copilot turn (msg=${params.messageId})`)
    await executeAgentTurn(sessionId, `[CUSTOMER] ${content}`, params.tenantId, supabase, createHeadlessSink())
    console.log(`${tag} copilot turn complete`)
  } catch (err) {
    console.error(`${tag} watch failed:`, err instanceof Error ? err.message : err)
  }
}
