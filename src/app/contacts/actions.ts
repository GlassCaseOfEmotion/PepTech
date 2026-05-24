'use server'

import { cache } from 'react'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Database } from '@/types/database'

const getTenantId = cache(async function getTenantId() {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id as string, userId: user.id }
})

export async function setLifecycleStage(
  customerId: string,
  stage: 'lead' | 'customer',
): Promise<{ success: true } | { error: string }> {
  if (stage !== 'lead' && stage !== 'customer') {
    return { error: 'Invalid lifecycle stage' }
  }
  try {
    const { supabase, tenantId, userId } = await getTenantId()

    type CustomerUpdate = Database['public']['Tables']['customers']['Update']
    const update: Pick<CustomerUpdate, 'lifecycle_stage' | 'converted_at'> = {
      lifecycle_stage: stage,
      converted_at: stage === 'customer' ? new Date().toISOString() : null,
    }

    // NOTE: UPDATE + INSERT are not in a transaction. If the audit insert fails,
    // we return the error so the caller knows; but a process crash between the
    // two statements would leave a flipped stage with no audit row. The auto-flip
    // path (Postgres trigger in 20260524000003_lifecycle_auto_flip_trigger.sql)
    // runs inside the orders update's transaction and doesn't have this issue.
    const { error } = await supabase
      .from('customers')
      .update(update)
      .eq('tenant_id', tenantId)
      .eq('id', customerId)

    if (error) return { error: error.message }

    const { error: eventError } = await supabase.from('customer_events').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      event_type: stage === 'customer' ? 'lifecycle_flip_to_customer' : 'lifecycle_flip_to_lead',
      reason: 'manual',
      actor_user_id: userId,
    })
    if (eventError) return { error: eventError.message }

    revalidatePath('/contacts')
    revalidatePath(`/contacts/${customerId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export type AcquisitionSource = 'referral' | 'community' | 'group_chat' | 'direct' | 'other'

const VALID_SOURCES: AcquisitionSource[] = ['referral', 'community', 'group_chat', 'direct', 'other']

export async function setAcquisitionSource(
  customerId: string,
  input: {
    source: AcquisitionSource | null
    referredByCustomerId?: string | null
    note?: string | null
  },
): Promise<{ success: true } | { error: string }> {
  if (input.source !== null && !VALID_SOURCES.includes(input.source)) {
    return { error: 'Invalid acquisition source' }
  }
  if (input.source === 'other' && !input.note?.trim()) {
    return { error: 'Note required when source is "other"' }
  }
  try {
    const { supabase, tenantId } = await getTenantId()

    type CustomerUpdate = Database['public']['Tables']['customers']['Update']
    const update: Pick<CustomerUpdate, 'acquisition_source' | 'acquisition_source_note' | 'referred_by_customer_id'> = {
      acquisition_source: input.source,
      acquisition_source_note: input.note?.trim() || null,
      referred_by_customer_id: input.source === 'referral' ? (input.referredByCustomerId ?? null) : null,
    }

    const { error } = await supabase
      .from('customers')
      .update(update)
      .eq('tenant_id', tenantId)
      .eq('id', customerId)

    if (error) return { error: error.message }

    revalidatePath('/contacts')
    revalidatePath(`/contacts/${customerId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
