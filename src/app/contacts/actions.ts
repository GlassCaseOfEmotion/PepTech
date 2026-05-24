'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id as string, userId: user.id }
}

export async function setLifecycleStage(
  customerId: string,
  stage: 'lead' | 'customer',
): Promise<{ success: true } | { error: string }> {
  if (stage !== 'lead' && stage !== 'customer') {
    return { error: 'Invalid lifecycle stage' }
  }
  try {
    const { supabase, tenantId, userId } = await getTenantId()

    const update: Record<string, unknown> = { lifecycle_stage: stage }
    if (stage === 'customer') update.converted_at = new Date().toISOString()
    else                       update.converted_at = null

    const { error } = await supabase
      .from('customers')
      .update(update)
      .eq('tenant_id', tenantId)
      .eq('id', customerId)

    if (error) return { error: error.message }

    await supabase.from('customer_events').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      event_type: stage === 'customer' ? 'lifecycle_flip_to_customer' : 'lifecycle_flip_to_lead',
      reason: 'manual',
      actor_user_id: userId,
    })

    revalidatePath('/contacts')
    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
