'use server'

import { createClient, getServerUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CATALOG_PRESETS, type BusinessType } from '@/lib/catalog-presets'

const VALID_TYPES = new Set(['peptides', 'nootropics', 'sarms', 'general'])
const VALID_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'AUD', 'SGD', 'IDR', 'MYR', 'THB'])

async function ctx() {
  const user = await getServerUser()
  if (!user) return null
  const supabase = await createClient()
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return null
  return { user, supabase, tenantId: userRow.tenant_id as string }
}

export async function saveBusinessType(type: string): Promise<{ error?: string }> {
  if (!VALID_TYPES.has(type)) return { error: 'Invalid type' }
  const c = await ctx()
  if (!c) return { error: 'Unauthorized' }
  const { error } = await c.supabase.from('tenants').update({ business_type: type }).eq('id', c.tenantId)
  if (error) return { error: error.message }
  revalidatePath('/onboarding')
  return {}
}

export async function saveCurrency(currency: string): Promise<{ error?: string }> {
  if (!VALID_CURRENCIES.has(currency)) return { error: 'Unsupported currency' }
  const c = await ctx()
  if (!c) return { error: 'Unauthorized' }
  const { error } = await c.supabase.from('tenants').update({ base_currency: currency }).eq('id', c.tenantId)
  if (error) return { error: error.message }
  revalidatePath('/onboarding')
  return {}
}

export async function seedCatalog(type: string): Promise<{ count?: number; error?: string }> {
  if (!VALID_TYPES.has(type)) return { error: 'Invalid type' }
  const c = await ctx()
  if (!c) return { error: 'Unauthorized' }

  // Idempotency: skip if products already exist
  const { count } = await c.supabase.from('products').select('id', { count: 'exact', head: true })
  if ((count ?? 0) > 0) return { count: count! }

  const rows = CATALOG_PRESETS[type as BusinessType].map(p => ({
    ...p, tenant_id: c.tenantId,
  }))
  const { error } = await c.supabase.from('products').insert(rows)
  if (error) return { error: error.message }
  return { count: rows.length }
}

export async function completeOnboarding(): Promise<void> {
  const c = await ctx()
  if (!c) redirect('/login')
  await c.supabase.from('tenants').update({ onboarded_at: new Date().toISOString() }).eq('id', c.tenantId)
  revalidatePath('/', 'layout')
  redirect('/')
}
