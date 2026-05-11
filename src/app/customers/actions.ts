'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id }
}

export async function upsertProtocolOverride(data: {
  customerId: string
  productId: string
  drawVolumeMl: number | null
  frequency: string | null
  notes: string | null
}): Promise<{ success: true } | { error: string }> {
  if (data.drawVolumeMl != null && data.drawVolumeMl <= 0) {
    return { error: 'Draw volume must be greater than 0' }
  }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('customer_protocol_overrides').upsert({
      tenant_id: tenantId,
      customer_id: data.customerId,
      product_id: data.productId,
      draw_volume_ml: data.drawVolumeMl,
      frequency: data.frequency,
      notes: data.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,customer_id,product_id' })
    if (error) return { error: error.message }
    revalidatePath(`/customers/${data.customerId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
