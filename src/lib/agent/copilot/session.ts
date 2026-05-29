import type { AgentSupabase } from '../types'

/** One copilot agent session per conversation. Identified by
 * trigger='copilot' + trigger_ref=conversationId. Created lazily. */
export async function getOrCreateCopilotSession(
  supabase: AgentSupabase,
  tenantId: string,
  conversationId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('agent_sessions')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('trigger', 'copilot')
    .eq('trigger_ref', conversationId)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const { data: created, error } = await supabase
    .from('agent_sessions')
    .insert({ tenant_id: tenantId, trigger: 'copilot', trigger_ref: conversationId })
    .select('id')
    .single()
  if (error) {
    console.error('[copilot] failed to create session:', error.message)
    return null
  }
  return created?.id ?? null
}
