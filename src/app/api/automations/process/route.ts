import { createServiceClient } from '@/lib/supabase/server'
import { evaluateCondition, executeAction } from '@/lib/automations/engine'
import type { Automation, Condition } from '@/types/automations'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Cron security — Vercel sets Authorization: Bearer <CRON_SECRET>
// ---------------------------------------------------------------------------

function authorised(request: Request): boolean {
  const header = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return header === `Bearer ${secret}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a 5-field cron string and return the UTC hour, or null if malformed. */
function parseCronHour(cron: string): number | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minute = parts[0]
  const hour = parseInt(parts[1], 10)
  // Only support the simple "0 H * * *" form (whole-hour triggers).
  if (minute !== '0' || isNaN(hour)) return null
  return hour
}

// ---------------------------------------------------------------------------
// Schedule trigger handler
// ---------------------------------------------------------------------------

async function processScheduleAutomations(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const { data: automations } = await supabase
    .from('automations')
    .select('*')
    .eq('state', 'on')
    .eq('trigger_type', 'schedule')

  if (!automations?.length) return 0

  const currentHour = new Date().getUTCHours()
  let inserted = 0

  for (const rawAuto of automations) {
    const automation = rawAuto as unknown as Automation
    const tp = automation.trigger_params as { cron?: string; scope?: 'tenant' | 'customers' }
    if (!tp.cron) continue

    const triggerHour = parseCronHour(tp.cron)
    if (triggerHour !== currentHour) continue

    if (tp.scope === 'customers') {
      inserted += await processSchedulePerCustomer(supabase, automation)
    } else {
      inserted += await processScheduleTenant(supabase, automation)
    }
  }

  return inserted
}

async function processScheduleTenant(
  supabase: ReturnType<typeof createServiceClient>,
  automation: Automation,
): Promise<number> {
  try {
    const conditions = (automation.conditions ?? []) as Condition[]
    const condResults = await Promise.all(
      conditions.map(c => evaluateCondition(c, { automationId: automation.id }, supabase)),
    )
    if (!condResults.every(Boolean)) {
      await supabase.from('automation_runs').insert({
        automation_id: automation.id,
        tenant_id: automation.tenant_id,
        state: 'skip',
        context_ref: null,
        context_label: null,
        action_summary: 'Conditions not met',
        action_payload: null,
      })
      return 1
    }
    const result = await executeAction(automation, {}, supabase)
    await supabase.from('automation_runs').insert({
      automation_id: automation.id,
      tenant_id: automation.tenant_id,
      state: result.state,
      context_ref: null,
      context_label: null,
      action_summary: result.action_summary,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      action_payload: result.action_payload as any,
    })
    return 1
  } catch (err) {
    console.error(`[cron] schedule automation ${automation.id} failed:`, err)
    try {
      await supabase.from('automation_runs').insert({
        automation_id: automation.id,
        tenant_id: automation.tenant_id,
        state: 'err',
        context_ref: null,
        context_label: null,
        action_summary: err instanceof Error ? err.message : String(err),
        action_payload: null,
      })
    } catch { /* swallow */ }
    return 1
  }
}

async function processSchedulePerCustomer(
  supabase: ReturnType<typeof createServiceClient>,
  automation: Automation,
): Promise<number> {
  const { data: customers } = await supabase
    .from('customers')
    .select('id')
    .eq('tenant_id', automation.tenant_id)

  if (!customers?.length) return 0

  let inserted = 0
  for (const customer of customers) {
    const customerId = customer.id

    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('customer_id', customerId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    const context = {
      customerId,
      conversationId: conv?.id ?? undefined,
      automationId: automation.id,
    }

    // send_dm requires a conversation — skip customers who have none
    if (automation.action_type === 'send_dm' && !context.conversationId) {
      await supabase.from('automation_runs').insert({
        automation_id: automation.id,
        tenant_id: automation.tenant_id,
        state: 'skip',
        context_ref: customerId,
        context_label: null,
        action_summary: 'No conversation — skipped',
        action_payload: null,
      })
      inserted++
      continue
    }

    try {
      const conditions = (automation.conditions ?? []) as Condition[]
      const condResults = await Promise.all(
        conditions.map(c => evaluateCondition(c, context, supabase)),
      )

      if (!condResults.every(Boolean)) {
        await supabase.from('automation_runs').insert({
          automation_id: automation.id,
          tenant_id: automation.tenant_id,
          state: 'skip',
          context_ref: customerId,
          context_label: null,
          action_summary: 'Conditions not met',
          action_payload: null,
        })
        inserted++
        continue
      }

      const result = await executeAction(automation, context, supabase)
      await supabase.from('automation_runs').insert({
        automation_id: automation.id,
        tenant_id: automation.tenant_id,
        state: result.state,
        context_ref: customerId,
        context_label: null,
        action_summary: result.action_summary,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action_payload: result.action_payload as any,
      })
      inserted++
    } catch (err) {
      console.error(`[cron] schedule per-customer automation ${automation.id} customer ${customerId} failed:`, err)
      try {
        await supabase.from('automation_runs').insert({
          automation_id: automation.id,
          tenant_id: automation.tenant_id,
          state: 'err',
          context_ref: customerId,
          context_label: null,
          action_summary: err instanceof Error ? err.message : String(err),
          action_payload: null,
        })
        inserted++
      } catch { /* swallow */ }
    }
  }
  return inserted
}

// ---------------------------------------------------------------------------
// Protocol-progress trigger handler
// ---------------------------------------------------------------------------

type CustomerProtocolRow = {
  customer_id: string
  tenant_id: string
  delivered_at: string
  cycle_length_weeks: number
}

async function processProtocolProgressAutomations(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const { data: automations } = await supabase
    .from('automations')
    .select('*')
    .eq('state', 'on')
    .eq('trigger_type', 'protocol_progress')

  if (!automations?.length) return 0

  // Find customers with their most recent delivered order date and
  // the cycle_length_weeks of a product in that order.
  //
  // Strategy: join orders → order_items → product_protocols, take the MAX
  // delivered_at per customer, and take the MAX cycle_length_weeks from
  // any protocol attached to items in that order. Using a single raw SQL
  // RPC is cleanest, but Supabase JS doesn't support arbitrary subqueries,
  // so we use two sequential queries and merge in JS.
  //
  // Step 1: get every customer's most recent delivered order.
  const { data: recentOrders, error: ordErr } = await supabase
    .from('orders')
    .select('id, customer_id, tenant_id, delivered_at')
    .eq('status', 'delivered')
    .not('delivered_at', 'is', null)
    .order('delivered_at', { ascending: false })

  if (ordErr || !recentOrders?.length) return 0

  // Deduplicate: keep only the most recent delivered order per customer.
  const latestByCustomer = new Map<string, typeof recentOrders[number]>()
  for (const row of recentOrders) {
    if (!latestByCustomer.has(row.customer_id)) {
      latestByCustomer.set(row.customer_id, row)
    }
  }

  const orderIds = [...latestByCustomer.values()].map(r => r.id)
  if (!orderIds.length) return 0

  // Step 2a: get product_ids per order.
  const { data: itemRows, error: itemErr } = await supabase
    .from('order_items')
    .select('order_id, product_id')
    .in('order_id', orderIds)

  if (itemErr || !itemRows?.length) return 0

  // Build map: order_id → product_ids
  const productIdsByOrder = new Map<string, string[]>()
  for (const row of itemRows) {
    const list = productIdsByOrder.get(row.order_id) ?? []
    list.push(row.product_id)
    productIdsByOrder.set(row.order_id, list)
  }

  const allProductIds = [...new Set(itemRows.map(r => r.product_id))]
  if (!allProductIds.length) return 0

  // Step 2b: get cycle_length_weeks from product_protocols for those products.
  const { data: protocolRows, error: protoErr } = await supabase
    .from('product_protocols')
    .select('product_id, cycle_length_weeks')
    .in('product_id', allProductIds)
    .not('cycle_length_weeks', 'is', null)

  if (protoErr || !protocolRows?.length) return 0

  // Build map: product_id → cycle_length_weeks
  const cycleByProduct = new Map<string, number>()
  for (const row of protocolRows) {
    if (row.cycle_length_weeks != null) {
      cycleByProduct.set(row.product_id, row.cycle_length_weeks)
    }
  }

  // Build map: order_id → max cycle_length_weeks across its products
  const cycleLengthByOrder = new Map<string, number>()
  for (const [orderId, productIds] of productIdsByOrder.entries()) {
    for (const pid of productIds) {
      const weeks = cycleByProduct.get(pid)
      if (weeks == null) continue
      const existing = cycleLengthByOrder.get(orderId) ?? 0
      if (weeks > existing) cycleLengthByOrder.set(orderId, weeks)
    }
  }

  // Build final CustomerProtocolRow list
  const customers: CustomerProtocolRow[] = []
  for (const [customerId, order] of latestByCustomer.entries()) {
    const cycleWeeks = cycleLengthByOrder.get(order.id)
    if (!cycleWeeks || !order.delivered_at) continue
    customers.push({
      customer_id: customerId,
      tenant_id: order.tenant_id,
      delivered_at: order.delivered_at,
      cycle_length_weeks: cycleWeeks,
    })
  }

  if (!customers.length) return 0

  const now = Date.now()
  let inserted = 0

  for (const rawAuto of automations) {
    const automation = rawAuto as unknown as Automation
    const tp = automation.trigger_params as { days_before_end?: number }
    const daysBeforeEnd = tp.days_before_end
    if (daysBeforeEnd == null) continue

    for (const customer of customers) {
      // Only process customers that belong to this automation's tenant
      if (customer.tenant_id !== automation.tenant_id) continue

      const cycleDays = customer.cycle_length_weeks * 7
      const deliveredAt = new Date(customer.delivered_at).getTime()
      const daysSinceDelivery = (now - deliveredAt) / (1000 * 60 * 60 * 24)
      const daysRemaining = Math.round(cycleDays - daysSinceDelivery)

      if (daysRemaining !== daysBeforeEnd) continue

      // Deduplication: skip if a run already exists for this automation +
      // customer within the last cycle_length_weeks * 7 days.
      const windowStart = new Date(now - cycleDays * 24 * 60 * 60 * 1000).toISOString()
      const { count: existingCount } = await supabase
        .from('automation_runs')
        .select('id', { count: 'exact', head: true })
        .eq('automation_id', automation.id)
        .eq('context_ref', customer.customer_id)
        .gte('created_at', windowStart)

      if ((existingCount ?? 0) > 0) continue

      try {
        const context = { customerId: customer.customer_id, automationId: automation.id }
        const conditions = (automation.conditions ?? []) as Condition[]
        const condResults = await Promise.all(
          conditions.map(c => evaluateCondition(c, context, supabase)),
        )
        const conditionsPassed = condResults.every(Boolean)

        if (!conditionsPassed) {
          await supabase.from('automation_runs').insert({
            automation_id: automation.id,
            tenant_id: automation.tenant_id,
            state: 'skip',
            context_ref: customer.customer_id,
            context_label: null,
            action_summary: 'Conditions not met',
            action_payload: null,
          })
          inserted++
          continue
        }

        const result = await executeAction(automation, context, supabase)

        await supabase.from('automation_runs').insert({
          automation_id: automation.id,
          tenant_id: automation.tenant_id,
          state: result.state,
          context_ref: customer.customer_id,
          context_label: null,
          action_summary: result.action_summary,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          action_payload: result.action_payload as any,
        })
        inserted++
      } catch (err) {
        console.error(`[cron] protocol_progress automation ${automation.id} customer ${customer.customer_id} failed:`, err)
        try {
          await supabase.from('automation_runs').insert({
            automation_id: automation.id,
            tenant_id: automation.tenant_id,
            state: 'err',
            context_ref: customer.customer_id,
            context_label: null,
            action_summary: err instanceof Error ? err.message : String(err),
            action_payload: null,
          })
          inserted++
        } catch { /* swallow */ }
      }
    }
  }

  return inserted
}

// ---------------------------------------------------------------------------
// Scheduled-run (deferred) handler
// ---------------------------------------------------------------------------

async function processScheduledRuns(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const now = new Date().toISOString()

  const { data: dueRuns, error } = await supabase
    .from('automation_runs')
    .select('id, automation_id, tenant_id, action_payload, context_ref')
    .eq('state', 'scheduled')
    .lte('fire_at', now)
    .limit(100)

  if (error || !dueRuns || dueRuns.length === 0) return 0

  let processed = 0
  for (const run of dueRuns) {
    try {
      const { data: rawAuto } = await supabase
        .from('automations')
        .select('*')
        .eq('id', run.automation_id)
        .eq('tenant_id', run.tenant_id)
        .single()

      // If automation was deleted or disabled since scheduling, skip
      if (!rawAuto || rawAuto.state !== 'on') {
        await supabase.from('automation_runs')
          .update({ state: 'skip', action_summary: 'Automation was disabled before fire time' })
          .eq('id', run.id)
        processed++
        continue
      }

      const automation = rawAuto as unknown as Automation

      // Re-evaluate conditions with the stored context
      const storedPayload = run.action_payload as { context?: { customerId?: string | null; orderId?: string | null; conversationId?: string | null } } | null
      const ctx = {
        customerId: storedPayload?.context?.customerId ?? undefined,
        orderId: storedPayload?.context?.orderId ?? undefined,
        conversationId: storedPayload?.context?.conversationId ?? undefined,
        automationId: run.automation_id,
      }

      const condResults = await Promise.all(
        (automation.conditions as Condition[]).map(c => evaluateCondition(c, ctx, supabase)),
      )
      if (condResults.some(r => !r)) {
        await supabase.from('automation_runs')
          .update({ state: 'skip', action_summary: 'Conditions no longer met at fire time' })
          .eq('id', run.id)
        processed++
        continue
      }

      // Execute the action
      const result = await executeAction(automation, ctx, supabase)
      await supabase.from('automation_runs')
        .update({
          state: result.state,
          action_summary: result.action_summary,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(result.action_payload ? { action_payload: result.action_payload as any } : {}),
        })
        .eq('id', run.id)
      processed++
    } catch (e) {
      await supabase.from('automation_runs')
        .update({ state: 'err', action_summary: e instanceof Error ? e.message : 'Unknown error' })
        .eq('id', run.id)
      processed++
    }
  }
  return processed
}

// ---------------------------------------------------------------------------
// GET handler — called by Vercel Cron every hour
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  if (!authorised(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createServiceClient()

  const [scheduleCount, protocolCount, deferredCount] = await Promise.all([
    processScheduleAutomations(supabase),
    processProtocolProgressAutomations(supabase),
    processScheduledRuns(supabase),
  ])

  return Response.json({ ok: true, processed: scheduleCount + protocolCount + deferredCount })
}
