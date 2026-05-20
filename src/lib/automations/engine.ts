import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Automation, Condition, RunState } from '@/types/automations'

type Context = {
  conversationId?: string
  customerId?: string
  orderId?: string
  toStatus?: string
  fromStatus?: string
  automationId?: string
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
      .maybeSingle()
    if (!data) return false // customer not found — skip, don't fire
    return compare(data.trust_score, cond.operator, cond.value as number)
  }

  if (cond.type === 'ltv') {
    const { data } = await supabase
      .from('customers')
      .select('ltv')
      .eq('id', customerId)
      .maybeSingle()
    if (!data) return false // customer not found — skip
    return compare(data.ltv, cond.operator, cond.value as number)
  }

  if (cond.type === 'last_message_hours') {
    // Use conversations.last_message_at — avoids a second round-trip to messages table
    const { data: conv } = await supabase
      .from('conversations')
      .select('last_message_at')
      .eq('customer_id', customerId)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!conv?.last_message_at) return true // no messages yet — allow through
    const hoursAgo = (Date.now() - new Date(conv.last_message_at).getTime()) / (1000 * 60 * 60)
    return compare(hoursAgo, cond.operator, cond.value as number)
  }

  if (cond.type === 'is_new_customer') {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('status', 'delivered')
    const isNew = (count ?? 0) === 0
    return isNew === (cond.value as boolean)
  }

  if (cond.type === 'protocol_days_remaining') {
    // Step 1: most recent delivered order for this customer
    const { data: order } = await supabase
      .from('orders')
      .select('id, delivered_at')
      .eq('customer_id', customerId)
      .eq('status', 'delivered')
      .not('delivered_at', 'is', null)
      .order('delivered_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!order?.delivered_at) return false

    // Step 2: product IDs in that order
    const { data: items } = await supabase
      .from('order_items')
      .select('product_id')
      .eq('order_id', order.id)
    const productIds = (items ?? []).map((r: { product_id: string }) => r.product_id)
    if (!productIds.length) return false

    // Step 3: max cycle_length_weeks across those products
    const { data: protocols } = await supabase
      .from('product_protocols')
      .select('cycle_length_weeks')
      .in('product_id', productIds)
    const weeks = (protocols ?? []).reduce(
      (max: number, r: { cycle_length_weeks: number | null }) =>
        r.cycle_length_weeks != null && r.cycle_length_weeks > max ? r.cycle_length_weeks : max,
      0,
    )
    if (!weeks) return false

    const cycleDays = weeks * 7
    const daysSince = (Date.now() - new Date(order.delivered_at).getTime()) / 86_400_000
    // Math.round: 4.5 remaining → 5, so lte 5 fires up to half a day before the threshold
    const daysRemaining = Math.round(cycleDays - daysSince)
    return compare(daysRemaining, cond.operator, cond.value as number)
  }

  if (cond.type === 'days_since_last_order') {
    // Uses created_at (order placement date), not delivered_at — "days since last purchase"
    const { data: order } = await supabase
      .from('orders')
      .select('created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!order?.created_at) return false
    const daysSince = (Date.now() - new Date(order.created_at).getTime()) / 86_400_000
    return compare(daysSince, cond.operator, cond.value as number)
  }

  if (cond.type === 'has_tag') {
    const { data } = await supabase
      .from('customer_tags')
      .select('tag')
      .eq('customer_id', customerId)
      .eq('tag', cond.value as string)
      .maybeSingle()
    return data != null
  }

  if (cond.type === 'cooldown_days') {
    const { automationId } = context
    if (!automationId) return false  // fail closed — no automationId means can't check
    const windowStart = new Date(Date.now() - (cond.value as number) * 86_400_000).toISOString()
    try {
      const { count, error } = await supabase
        .from('automation_runs')
        .select('id', { count: 'exact', head: true })
        .eq('automation_id', automationId)
        .eq('context_ref', customerId)
        .in('state', ['ok', 'warn', 'queued', 'scheduled'])
        .gte('created_at', windowStart)
      if (error) return false  // fail closed on DB error
      return (count ?? 1) === 0
    } catch {
      return false  // fail closed on any exception
    }
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
      // Return queued state — caller inserts the run row with action_payload for operator review
      return {
        state: 'queued',
        action_summary: 'DM queued for review',
        action_payload: { conversationId: conversationId ?? null, message, customerId: customerId ?? null },
      }
    }

    // review_required: false — write message to DB only (v1: no channel dispatch)
    // TODO: extract channel dispatch from /api/send into a shared utility for true delivery
    if (!conversationId) {
      return { state: 'err', action_summary: 'No conversationId for send_dm', action_payload: null }
    }

    const { data: conv } = await supabase
      .from('conversations')
      .select('id, tenant_id')
      .eq('id', conversationId)
      .maybeSingle()

    if (!conv) {
      return { state: 'err', action_summary: 'Conversation not found', action_payload: null }
    }

    const { error: msgErr } = await supabase.from('messages').insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      direction: 'outbound',
      content: message,
      status: 'sent',
    })
    if (msgErr) return { state: 'err', action_summary: msgErr.message, action_payload: null }

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

    // Atomic clamp via RPC to avoid read-modify-write race
    const { error } = await supabase.rpc('adjust_trust_score', { p_customer_id: customerId, p_delta: delta })
    if (error) return { state: 'err', action_summary: error.message, action_payload: null }

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
// Main entry point — MUST be called with createServiceClient() (no user session)
// ---------------------------------------------------------------------------

export async function runAutomationsForEvent(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  triggerType: 'new_thread' | 'order_state' | 'schedule' | 'protocol_progress',
  context: Context,
): Promise<void> {
  const { data: automations } = await supabase
    .from('automations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('state', 'on')
    .eq('trigger_type', triggerType)

  if (!automations?.length) return

  const candidates = triggerType === 'order_state'
    ? automations.filter(a => {
        const tp = a.trigger_params as Record<string, unknown>
        return tp.to_status === context.toStatus
      })
    : automations

  for (const rawAuto of candidates) {
    const automation = rawAuto as unknown as Automation

    try {
      const conditions = (automation.conditions ?? []) as Condition[]
      const condResults = await Promise.all(
        conditions.map(c => evaluateCondition(c, { ...context, automationId: automation.id }, supabase))
      )
      const conditionsPassed = condResults.every(Boolean)

      if (!conditionsPassed) {
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

      // Check for delay
      const delayDays = typeof automation.trigger_params.delay_days === 'number'
        ? automation.trigger_params.delay_days
        : 0

      if (delayDays > 0) {
        const contextRef = context.customerId ?? context.orderId ?? null
        // Deduplication: skip if a scheduled run already exists for this automation + context
        const { data: existing } = await supabase
          .from('automation_runs')
          .select('id')
          .eq('automation_id', automation.id)
          .eq('tenant_id', tenantId)
          .eq('state', 'scheduled')
          .eq('context_ref', contextRef ?? '')
          .maybeSingle()

        if (!existing) {
          const fireAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString()
          await supabase.from('automation_runs').insert({
            automation_id: automation.id,
            tenant_id: tenantId,
            state: 'scheduled',
            context_ref: contextRef,
            context_label: `fires ${new Date(fireAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
            action_summary: `Scheduled: ${automation.action_type} in ${delayDays}d`,
            action_payload: {
              _deferred: true,
              context: {
                customerId: context.customerId ?? null,
                orderId: context.orderId ?? null,
                conversationId: context.conversationId ?? null,
              },
            },
            fire_at: fireAt,
          })
        }
        continue  // skip executeAction — will fire later
      }

      const result = await executeAction(automation, context, supabase)

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
      } catch { /* swallow insert errors — never throw to caller */ }
    }
  }
}
