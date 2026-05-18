import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Automation, Condition, RunState } from '@/types/automations'

type Context = {
  conversationId?: string
  customerId?: string
  orderId?: string
  toStatus?: string
  fromStatus?: string
}

type RunResult = {
  state: RunState
  action_summary: string | null
  action_payload: Record<string, unknown> | null
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function compare(actual: number, operator: 'gte' | 'lte' | 'eq', value: number): boolean {
  if (operator === 'gte') return actual >= value
  if (operator === 'lte') return actual <= value
  return actual === value
}

export async function evaluateCondition(
  cond: Condition,
  context: Context,
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { customerId } = context

  // If the condition requires a customer but we don't have one, allow through
  if (!customerId) return true

  if (cond.type === 'trust_score') {
    const { data } = await supabase
      .from('customers')
      .select('trust_score')
      .eq('id', customerId)
      .single()
    if (!data) return true
    return compare(data.trust_score, cond.operator, cond.value as number)
  }

  if (cond.type === 'ltv') {
    const { data } = await supabase
      .from('customers')
      .select('ltv')
      .eq('id', customerId)
      .single()
    if (!data) return true
    return compare(data.ltv, cond.operator, cond.value as number)
  }

  if (cond.type === 'last_message_hours') {
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('customer_id', customerId)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!conv) return true
    const { data: msg } = await supabase
      .from('messages')
      .select('sent_at')
      .eq('conversation_id', conv.id)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!msg) return true
    const hoursAgo = (Date.now() - new Date(msg.sent_at).getTime()) / (1000 * 60 * 60)
    return compare(hoursAgo, cond.operator, cond.value as number)
  }

  if (cond.type === 'is_new_customer') {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('status', 'delivered')
    const isNew = (count ?? 0) === 0
    // operator 'eq' with boolean value
    return isNew === (cond.value as boolean)
  }

  return true
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

export async function executeAction(
  automation: Automation,
  context: Context,
  supabase: SupabaseClient<Database>,
): Promise<RunResult> {
  const { action_type, action_params } = automation
  const { conversationId, customerId } = context

  if (action_type === 'send_dm') {
    const params = action_params as { message: string; review_required: boolean }
    const message = params.message
    const reviewRequired = params.review_required !== false // default true

    if (reviewRequired) {
      // Return queued state — caller inserts the run row
      return {
        state: 'queued',
        action_summary: 'DM queued for review',
        action_payload: { conversationId: conversationId ?? null, message, customerId: customerId ?? null },
      }
    }

    // review_required: false — send directly via DB insert (mirrors /api/send logic)
    if (!conversationId) {
      return { state: 'err', action_summary: 'No conversationId for send_dm', action_payload: null }
    }

    const { data: conv } = await supabase
      .from('conversations')
      .select('id, tenant_id, channel_type, channel_identifier, customer_id')
      .eq('id', conversationId)
      .single()

    if (!conv) {
      return { state: 'err', action_summary: 'Conversation not found', action_payload: null }
    }

    await supabase.from('messages').insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      direction: 'outbound',
      content: message,
      status: 'sent',
    })

    await supabase
      .from('conversations')
      .update({
        status: 'in_progress',
        last_message_at: new Date().toISOString(),
        last_message_snippet: `You: ${message.slice(0, 97)}`,
      })
      .eq('id', conv.id)

    return { state: 'ok', action_summary: 'DM sent', action_payload: null }
  }

  if (action_type === 'operator_alert') {
    const params = action_params as { message: string; severity: 'info' | 'warn' | 'err' }
    const state: RunState =
      params.severity === 'err' ? 'err' :
      params.severity === 'warn' ? 'warn' :
      'ok'
    return { state, action_summary: params.message, action_payload: null }
  }

  if (action_type === 'score_adjust') {
    const params = action_params as { delta: number; reason: string }
    const { delta } = params

    if (!customerId) {
      return { state: 'skip', action_summary: 'No customerId for score_adjust', action_payload: null }
    }

    // Atomic clamp via Supabase RPC to avoid read-modify-write race
    await supabase.rpc('adjust_trust_score', { p_customer_id: customerId, p_delta: delta })

    return {
      state: 'ok',
      action_summary: `Trust score adjusted by ${delta}`,
      action_payload: null,
    }
  }

  if (action_type === 'operator_task') {
    const params = action_params as { title: string }
    return { state: 'ok', action_summary: params.title, action_payload: null }
  }

  return { state: 'err', action_summary: `Unknown action type: ${action_type}`, action_payload: null }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runAutomationsForEvent(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  triggerType: 'new_thread' | 'order_state',
  context: Context,
): Promise<void> {
  // 1. Fetch active automations for this tenant + trigger type
  const { data: automations } = await supabase
    .from('automations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('state', 'on')
    .eq('trigger_type', triggerType)

  if (!automations?.length) return

  // 2. Filter order_state automations by to_status
  const candidates = triggerType === 'order_state'
    ? automations.filter(a => {
        const tp = a.trigger_params as Record<string, unknown>
        return tp.to_status === context.toStatus
      })
    : automations

  for (const rawAuto of candidates) {
    // Cast DB row to typed Automation
    const automation = rawAuto as unknown as Automation

    try {
      // 3. Evaluate all conditions (all must pass)
      const conditions = (automation.conditions ?? []) as Condition[]
      const condResults = await Promise.all(
        conditions.map(c => evaluateCondition(c, context, supabase))
      )
      const conditionsPassed = condResults.every(Boolean)

      if (!conditionsPassed) {
        // Insert skip run
        await supabase.from('automation_runs').insert({
          automation_id: automation.id,
          tenant_id: tenantId,
          state: 'skip',
          context_ref: context.customerId ?? context.orderId ?? null,
          context_label: null,
          action_summary: 'Conditions not met',
          action_payload: null,
        })
        continue
      }

      // 4. Execute action
      const result = await executeAction(automation, context, supabase)

      // 5. Insert run row
      await supabase.from('automation_runs').insert({
        automation_id: automation.id,
        tenant_id: tenantId,
        state: result.state,
        context_ref: context.customerId ?? context.orderId ?? null,
        context_label: null,
        action_summary: result.action_summary,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action_payload: result.action_payload as any,
      })
    } catch (err) {
      // 6. On error: insert err run and continue — never throw
      console.error(`[automations] Error running automation ${automation.id}:`, err)
      try {
        await supabase.from('automation_runs').insert({
          automation_id: automation.id,
          tenant_id: tenantId,
          state: 'err',
          context_ref: context.customerId ?? context.orderId ?? null,
          context_label: null,
          action_summary: err instanceof Error ? err.message : String(err),
          action_payload: null,
        })
      } catch { /* swallow insert errors too */ }
    }
  }
}
