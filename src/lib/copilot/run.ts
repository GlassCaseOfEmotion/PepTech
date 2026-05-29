import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { classifyActionable } from './prefilter'
import { gatherContext } from './context'
import { draftSuggestions } from './draft'
import { dedupAndPersist } from './persist'

type Db = SupabaseClient<Database>

export interface CopilotPassParams {
  tenantId: string
  conversationId: string
  customerId: string
  messageId: string   // the inbound message that triggered this pass
}

/** Fire-and-forget. Gates on the tenant flag, debounces bursts, then runs
 * pre-filter -> context -> draft -> persist. Never throws. */
export async function runCopilotPass(supabase: Db, params: CopilotPassParams): Promise<void> {
  try {
    // 1. Tenant opt-in gate.
    const { data: tenant } = await supabase
      .from('tenants')
      .select('copilot_enabled')
      .eq('id', params.tenantId)
      .single()
    if (!tenant?.copilot_enabled) return

    // 2. Debounce: only the latest inbound message in the conversation runs.
    //    A burst of rapid inbound messages collapses to one pass.
    const { data: latest } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', params.conversationId)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
    if (latest?.[0]?.id && latest[0].id !== params.messageId) return

    // 3. Gather context first (we need the transcript for the pre-filter too).
    const ctx = await gatherContext(supabase, params.tenantId, params.conversationId, params.customerId)

    // 4. Cheap pre-filter.
    const { actionable } = await classifyActionable(ctx.messages)
    if (!actionable) return

    // 5. Drafting pass.
    const drafts = await draftSuggestions(ctx)
    if (drafts.length === 0) return

    // 6. Dedup + persist.
    await dedupAndPersist(supabase, {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      customerId: params.customerId,
    }, drafts)
  } catch (err) {
    console.error('[copilot] pass failed:', err instanceof Error ? err.message : err)
  }
}
