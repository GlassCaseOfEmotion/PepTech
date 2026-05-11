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

export async function upsertPaymentConfig(data: {
  type: string
  walletAddress?: string
  bankName?: string
  accountName?: string
  accountNumber?: string
  sortCode?: string
  iban?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('tenant_payment_configs').upsert({
      tenant_id: tenantId,
      type: data.type,
      wallet_address: data.walletAddress ?? null,
      bank_name: data.bankName ?? null,
      account_name: data.accountName ?? null,
      account_number: data.accountNumber ?? null,
      sort_code: data.sortCode ?? null,
      iban: data.iban ?? null,
      is_active: true,
    }, { onConflict: 'tenant_id,type' })
    if (error) return { error: error.message }
    revalidatePath('/settings/wallets')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function togglePaymentConfig(
  type: string,
  isActive: boolean,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('tenant_payment_configs')
      .update({ is_active: isActive })
      .eq('tenant_id', tenantId)
      .eq('type', type)
    if (error) return { error: error.message }
    revalidatePath('/settings/wallets')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
