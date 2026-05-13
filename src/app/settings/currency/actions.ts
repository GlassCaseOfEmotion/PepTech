'use server'

import { createClient, getServerUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const ALLOWED_CURRENCIES = new Set(['USD', 'IDR'])

export async function saveBaseCurrency(
  currency: string
): Promise<{ success: true } | { error: string }> {
  if (!ALLOWED_CURRENCIES.has(currency)) return { error: 'Unsupported currency' }
  const user = await getServerUser()
  if (!user) return { error: 'Unauthorized' }
  const supabase = await createClient()
  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'Unauthorized' }
  const { error } = await supabase
    .from('tenants')
    .update({ base_currency: currency })
    .eq('id', userRow.tenant_id)
  if (error) return { error: error.message }

  // Nullify payment_amount_base on orders that were in the old currency
  await supabase
    .from('orders')
    .update({ payment_amount_base: null })
    .neq('currency', currency)

  // Reset all customer LTV to 0 (LTV trigger won't fire on payment_amount_base update)
  await supabase
    .from('customers')
    .update({ ltv: 0 })
    .neq('ltv', 0)  // skip already-zero rows for efficiency

  revalidatePath('/', 'layout')
  revalidatePath('/settings/currency')
  return { success: true }
}
