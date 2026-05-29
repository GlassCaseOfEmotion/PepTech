'use server'
import { cache } from 'react'

import { createClient, getServerUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const getTenantId = cache(async function getTenantId() {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id as string }
})

export async function setCopilotEnabled(enabled: boolean): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase
      .from('tenants')
      .update({ copilot_enabled: enabled })
      .eq('id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/settings/profile')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
