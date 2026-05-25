'use server'

import { createClient, getServerUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { commitPaymentMethods } from '@/lib/payments/onboarding/commit'
import type { PaymentMethodsCommitInput, PaymentMethodsCommitResult } from '@/lib/payments/onboarding/types'

async function ctx() {
  const user = await getServerUser()
  if (!user) return null
  const supabase = await createClient()
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return null
  return { supabase, tenantId: userRow.tenant_id as string }
}

export async function commitPaymentMethodsAction(
  input: PaymentMethodsCommitInput,
): Promise<({ success: true } & PaymentMethodsCommitResult) | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Unauthorized' }
  try {
    const result = await commitPaymentMethods({ supabase: c.supabase, tenantId: c.tenantId, input })
    revalidatePath('/onboarding')
    return { success: true, ...result }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Commit failed' }
  }
}
