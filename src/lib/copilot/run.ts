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
  const tag = `[copilot] conv=${params.conversationId}`
  try {
    console.log(`${tag} pass start (msg=${params.messageId})`)

    // 1. Tenant opt-in gate.
    const { data: tenant } = await supabase
      .from('tenants')
      .select('copilot_enabled')
      .eq('id', params.tenantId)
      .single()
    if (!tenant?.copilot_enabled) {
      console.log(`${tag} skip: copilot_enabled is off for tenant ${params.tenantId}`)
      return
    }

    // 2. Debounce: only the latest inbound message in the conversation runs.
    //    A burst of rapid inbound messages collapses to one pass.
    const { data: latest } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', params.conversationId)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
    if (latest?.[0]?.id && latest[0].id !== params.messageId) {
      console.log(`${tag} skip: superseded by newer inbound ${latest[0].id}`)
      return
    }

    // 3. Gather context first (we need the transcript for the pre-filter too).
    const ctx = await gatherContext(supabase, params.tenantId, params.conversationId, params.customerId)
    console.log(`${tag} context: ${ctx.messages?.length ?? 0} msgs, ${ctx.catalog?.length ?? 0} catalog items`)

    // 4. Cheap pre-filter.
    const { actionable, signals } = await classifyActionable(ctx.messages)
    console.log(`${tag} prefilter: actionable=${actionable} signals=[${signals.join(',')}]`)
    if (!actionable) return

    // 5. Drafting pass.
    const drafts = await draftSuggestions(ctx)
    console.log(`${tag} drafted ${drafts.length} suggestion(s): [${drafts.map(d => d.kind).join(',')}]`)
    if (drafts.length === 0) return

    // 6. Dedup + persist.
    const inserted = await dedupAndPersist(supabase, {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      customerId: params.customerId,
    }, drafts)
    console.log(`${tag} persisted ${inserted} new suggestion(s) after dedup`)
  } catch (err) {
    console.error(`${tag} pass failed:`, err instanceof Error ? err.message : err)
  }
}
