'use server'

import { createClient, getServerUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CATALOG_PRESETS, type BusinessType } from '@/lib/catalog-presets'
import { commitExtractedCatalog } from '@/lib/catalog/extraction/commit'
import type { CommitInput } from '@/lib/catalog/extraction/types'

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

  // Seed a starter batch (10 units) for every product — non-fatal but logged.
  // batches.batch_number is UNIQUE per tenant, so each product needs a distinct
  // SEED- batch number; suffix with sku.
  if (inserted && inserted.length > 0) {
    const batchRows = inserted.map(p => ({
      tenant_id: c.tenantId,
      product_id: p.id,
      batch_number: `SEED-${p.sku}`,
      stock: 10,
    }))
    const { error: batchErr } = await c.supabase.from('batches').insert(batchRows)
    if (batchErr) console.error('[seedCatalog] batches insert failed', { message: batchErr.message, count: batchRows.length })
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

const VALID_TIMEZONES = new Set([
  'Pacific/Honolulu','America/Anchorage','America/Los_Angeles','America/Denver',
  'America/Chicago','America/New_York','America/Sao_Paulo','Europe/London',
  'Europe/Amsterdam','Europe/Lisbon','Europe/Istanbul','Asia/Dubai',
  'Asia/Karachi','Asia/Kolkata','Asia/Bangkok','Asia/Singapore',
  'Asia/Shanghai','Asia/Tokyo','Australia/Sydney','Pacific/Auckland','UTC',
])

export async function saveProfile(
  displayName: string,
  timezone: string,
): Promise<{ error?: string }> {
  const name = displayName.trim().slice(0, 80)
  if (!name) return { error: 'Name is required' }
  const tz = VALID_TIMEZONES.has(timezone) ? timezone : 'UTC'
  const c = await ctx()
  if (!c) return { error: 'Unauthorized' }
  const [nameResult, tzResult] = await Promise.all([
    c.supabase.from('users').update({ display_name: name }).eq('id', c.user.id),
    c.supabase.from('tenants').update({ timezone: tz }).eq('id', c.tenantId),
  ])
  if (nameResult.error) return { error: nameResult.error.message }
  if (tzResult.error) return { error: tzResult.error.message }
  revalidatePath('/onboarding')
  return {}
}

export async function completeOnboarding(): Promise<void> {
  const c = await ctx()
  if (!c) redirect('/login')
  await c.supabase.from('tenants').update({ onboarded_at: new Date().toISOString() }).eq('id', c.tenantId)
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function commitExtractedCatalogAction(
  input: CommitInput,
): Promise<{ count?: number; error?: string }> {
  const c = await ctx()
  if (!c) return { error: 'Unauthorized' }
  if (!Array.isArray(input.rows) || input.rows.length === 0) return { error: 'No rows to import' }
  try {
    const out = await commitExtractedCatalog({ supabase: c.supabase, tenantId: c.tenantId, input })
    revalidatePath('/onboarding')
    return { count: out.count }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Commit failed' }
  }
}
