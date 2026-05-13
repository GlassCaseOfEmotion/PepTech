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
  revalidatePath('/settings/currency')
  return { success: true }
}
