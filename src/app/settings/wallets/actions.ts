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

export async function upsertPaymentConfig(data: {
  type: string
  walletAddress?: string
  bankName?: string
  accountName?: string
  accountNumber?: string
  sortCode?: string
  iban?: string
  instructions?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    // Read the existing row so we don't accidentally null out fields the
    // current caller didn't provide. Onboarding writes only `instructions`;
    // the structured fields on a bank_transfer should survive a later edit
    // that only touches instructions, and vice versa.
    const { data: existing } = await supabase
      .from('tenant_payment_configs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('type', data.type)
      .maybeSingle()

    const row = {
      tenant_id: tenantId,
      type: data.type,
      wallet_address: data.walletAddress ?? existing?.wallet_address ?? null,
      bank_name:      data.bankName      ?? existing?.bank_name      ?? null,
      account_name:   data.accountName   ?? existing?.account_name   ?? null,
      account_number: data.accountNumber ?? existing?.account_number ?? null,
      sort_code:      data.sortCode      ?? existing?.sort_code      ?? null,
      iban:           data.iban          ?? existing?.iban           ?? null,
      instructions:   data.instructions  ?? existing?.instructions   ?? null,
      is_active: true,
    }

    const { error } = await supabase
      .from('tenant_payment_configs')
      .upsert(row, { onConflict: 'tenant_id,type' })
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
