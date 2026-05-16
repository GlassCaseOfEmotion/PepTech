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
  return { user, supabase: await createClient() }
}

export async function saveBusinessType(type: string): Promise<{ error?: string }> {
  if (!VALID_TYPES.has(type)) return { error: 'Invalid type' }
  const c = await ctx()
  if (!c) return { error: 'Unauthorized' }
  const { error } = await c.supabase.from('tenants').update({ business_type: type })
  if (error) return { error: error.message }
  revalidatePath('/onboarding')
  return {}
}

export async function saveCurrency(currency: string): Promise<{ error?: string }> {
  if (!VALID_CURRENCIES.has(currency)) return { error: 'Unsupported currency' }
  const c = await ctx()
  if (!c) return { error: 'Unauthorized' }
  const { error } = await c.supabase.from('tenants').update({ base_currency: currency })
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

  const { data: userRow } = await c.supabase
    .from('users').select('tenant_id').eq('id', c.user.id).single()
  if (!userRow) return { error: 'Could not resolve tenant' }

  const rows = CATALOG_PRESETS[type as BusinessType].map(p => ({
    ...p, tenant_id: userRow.tenant_id,
  }))
  const { error } = await c.supabase.from('products').insert(rows)
  if (error) return { error: error.message }
  return { count: rows.length }
}

export async function completeOnboarding(): Promise<void> {
  const c = await ctx()
  if (!c) redirect('/login')
  await c.supabase.from('tenants').update({ onboarded_at: new Date().toISOString() })
  revalidatePath('/', 'layout')
  redirect('/')
}
