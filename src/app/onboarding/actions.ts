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

export async function seedCatalog(
  type: string,
  selectedSkus?: string[],
): Promise<{ count?: number; error?: string }> {
  if (!VALID_TYPES.has(type)) return { error: 'Invalid type' }
  const c = await ctx()
  if (!c) return { error: 'Unauthorized' }

  // Idempotency: skip if products already exist
  const { count } = await c.supabase.from('products')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', c.tenantId)
  if ((count ?? 0) > 0) return { count: count! }

  const allPresets = CATALOG_PRESETS[type as BusinessType]
  const chosen = selectedSkus && selectedSkus.length > 0
    ? allPresets.filter(p => selectedSkus.includes(p.sku))
    : allPresets

  if (chosen.length === 0) return { error: 'Select at least one product' }

  const rows = chosen.map(p => ({
    name: p.name, sku: p.sku,
    product_family: p.product_family,
    unit_price: p.unit_price,
    description: p.description,
    tenant_id: c.tenantId,
  }))

  const { data: inserted, error } = await c.supabase
    .from('products').insert(rows).select('id, sku')
  if (error) return { error: error.message }

  // Seed protocols for peptides that have protocol data
  if (type === 'peptides' && inserted && inserted.length > 0) {
    const protocolRows = inserted
      .map(p => {
        const preset = chosen.find(sp => sp.sku === p.sku)
        const proto = preset?.protocol
        if (!proto) return null
        return {
          tenant_id: c.tenantId,
          product_id: p.id,
          vial_strength: proto.vial_strength,
          reconstitution_ml: proto.reconstitution_ml,
          draw_volume_ml: proto.draw_volume_ml,
          frequency: proto.frequency,
          timing: proto.timing ?? null,
          cycle_length_weeks: proto.cycle_length_weeks,
          notes: proto.notes ?? null,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (protocolRows.length > 0) {
      // Non-fatal if protocol seeding fails — products are already created
      await c.supabase.from('product_protocols').insert(protocolRows).then(() => {})
    }
  }

  return { count: inserted?.length ?? rows.length }
}

const VALID_CHANNELS = new Set(['whatsapp', 'telegram', 'email'])

export async function saveChannelIntent(
  channels: string[]
): Promise<{ error?: string }> {
  const valid = channels.filter(c => VALID_CHANNELS.has(c))
  const c = await ctx()
  if (!c) return { error: 'Unauthorized' }
  const { error } = await c.supabase
    .from('tenants')
    .update({ intended_channels: valid })
    .eq('id', c.tenantId)
  if (error) return { error: error.message }
  return {}
}

export async function completeOnboarding(): Promise<void> {
  const c = await ctx()
  if (!c) redirect('/login')
  await c.supabase.from('tenants').update({ onboarded_at: new Date().toISOString() }).eq('id', c.tenantId)
  revalidatePath('/', 'layout')
  redirect('/')
}
