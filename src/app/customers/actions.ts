'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { FREQUENCY_OPTIONS } from '@/types/protocols'
import type { Frequency } from '@/types/protocols'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id }
}

export async function addCustomerNote(
  customerId: string,
  content: string,
): Promise<{ success: true; note: { id: string; content: string; created_at: string } } | { error: string }> {
  if (!content.trim()) return { error: 'Note cannot be empty' }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('notes')
      .insert({ tenant_id: tenantId, customer_id: customerId, content: content.trim(), created_by: user?.id ?? null })
      .select('id, content, created_at')
      .single()
    if (error || !data) return { error: error?.message ?? 'Failed to save note' }
    revalidatePath(`/customers/${customerId}`)
    return { success: true, note: data as { id: string; content: string; created_at: string } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
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
  if (data.frequency != null && !FREQUENCY_OPTIONS.includes(data.frequency as Frequency)) {
    return { error: 'Invalid frequency value' }
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
