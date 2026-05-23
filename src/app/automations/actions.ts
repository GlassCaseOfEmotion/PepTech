'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createOrFindConversation } from '@/app/inbox/actions'
import type { AutoState, AutomationWithRuns, TriggerType, ActionType, Condition, Automation, QueuedRun } from '@/types/automations'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id as string }
}

export async function getAutomations(): Promise<AutomationWithRuns[]> {
  const { supabase } = await getTenantId()
  const { data, error } = await supabase
    .from('automations')
    .select('*, automation_runs(id, state, context_ref, context_label, action_summary, action_payload, created_at)')
    .order('sort_order', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((automation) => ({
    ...automation,
    automation_runs: (automation.automation_runs ?? [])
      .sort((a: { created_at: string }, b: { created_at: string }) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 5),
  })) as AutomationWithRuns[]
}

export async function getQueuedRuns(): Promise<QueuedRun[]> {
  try {
    const { supabase } = await getTenantId()
    const { data, error } = await supabase
      .from('automation_runs')
      .select('id, context_label, action_payload, created_at, automations(name)')
      .eq('state', 'queued')
      .order('created_at', { ascending: true })
      .limit(20)
    if (error) return []
    return (data ?? []).map(r => {
      const payload = (r.action_payload ?? {}) as Record<string, unknown>
      const auto = r.automations as { name: string } | null
      return {
        id: r.id,
        automationName: auto?.name ?? 'Automation',
        contextLabel: r.context_label,
        message: (payload.message as string) ?? '',
        conversationId: (payload.conversationId as string) ?? null,
        createdAt: r.created_at,
      }
    })
  } catch {
    return []
  }
}

export async function createAutomation(data: {
  name: string
  icon: string
  trigger_type: TriggerType
  trigger_params: Record<string, unknown>
  conditions: Condition[]
  action_type: ActionType
  action_params: Record<string, unknown>
  sort_order?: number
}): Promise<{ success: true; id: string } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { data: row, error } = await supabase
      .from('automations')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ ...data, tenant_id: tenantId } as any)
      .select('id')
      .single()
    if (error || !row) return { error: error?.message ?? 'Failed to create automation' }
    revalidatePath('/automations')
    return { success: true, id: row.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateAutomation(
  id: string,
  data: Partial<Pick<Automation, 'name' | 'icon' | 'trigger_type' | 'trigger_params' | 'conditions' | 'action_type' | 'action_params' | 'sort_order'>>
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase
      .from('automations')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(data as any)
      .eq('id', id)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/automations')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteAutomation(id: string): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase
      .from('automations')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/automations')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function toggleAutomation(id: string, state: AutoState): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase
      .from('automations')
      .update({ state })
      .eq('id', id)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/automations')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function approveAndSendQueuedRun(runId: string, overrideMessage?: string): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()

    const { data: run, error: fetchError } = await supabase
      .from('automation_runs')
      .select('*')
      .eq('id', runId)
      .eq('state', 'queued')
      .eq('tenant_id', tenantId)
      .single()

    if (fetchError || !run) return { error: 'Queued run not found' }

    const payload = run.action_payload as Record<string, unknown> | null
    let conversationId = payload?.conversationId as string | undefined
    const customerId = payload?.customerId as string | undefined
    const message = overrideMessage?.trim() || (payload?.message as string | undefined)

    if (!message) return { error: 'Run payload missing message' }

    // Order-triggered automations queue runs without a conversationId — resolve
    // the customer's primary channel and find/create a conversation now.
    if (!conversationId) {
      if (!customerId) return { error: 'Run payload missing conversationId or customerId' }
      const { data: primary } = await supabase
        .from('customer_channels')
        .select('channel_type')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!primary) return { error: 'No messaging handle on file for this customer' }
      const found = await createOrFindConversation(customerId, primary.channel_type)
      if ('error' in found) return { error: found.error }
      conversationId = found.conversationId

      // Persist on the run so subsequent retries / "Open chat" can use it
      await supabase
        .from('automation_runs')
        .update({ action_payload: { ...(payload ?? {}), conversationId } })
        .eq('id', runId)
        .eq('tenant_id', tenantId)
    }

    const cookieStore = await cookies()
    const cookieHeader = cookieStore.getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ')

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`
    const sendRes = await fetch(`${baseUrl}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({ conversationId, content: message }),
    })

    if (!sendRes.ok) {
      const body = await sendRes.json().catch(() => ({})) as Record<string, unknown>
      const errorMsg = (body.error as string) ?? `Send failed with status ${sendRes.status}`
      // Record the failure so it's visible in the run history
      await supabase
        .from('automation_runs')
        .update({ state: 'err', action_summary: errorMsg })
        .eq('id', runId)
        .eq('tenant_id', tenantId)
      return { error: errorMsg }
    }

    const { error: updateError } = await supabase
      .from('automation_runs')
      .update({ state: 'ok' })
      .eq('id', runId)
      .eq('tenant_id', tenantId)

    if (updateError) return { error: updateError.message }

    revalidatePath('/automations')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function dismissQueuedRun(runId: string): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase
      .from('automation_runs')
      .update({ state: 'skip' })
      .eq('id', runId)
      .eq('tenant_id', tenantId)
      .eq('state', 'queued')
    if (error) return { error: error.message }
    revalidatePath('/automations')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
