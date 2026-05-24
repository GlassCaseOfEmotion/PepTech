import type { AgentTool, AgentSupabase } from '../types'
import { CATALOG_PRESETS, type BusinessType } from '@/lib/catalog-presets'

const VALID_TYPES = new Set(['peptides', 'nootropics', 'sarms', 'general'])
const VALID_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'AUD', 'SGD', 'IDR', 'MYR', 'THB'])
const VALID_CHANNELS = new Set(['whatsapp', 'telegram', 'email'])
const VALID_TIMEZONES = new Set([
  'Pacific/Honolulu','America/Anchorage','America/Los_Angeles','America/Denver',
  'America/Chicago','America/New_York','America/Sao_Paulo','Europe/London',
  'Europe/Amsterdam','Europe/Lisbon','Europe/Istanbul','Asia/Dubai',
  'Asia/Karachi','Asia/Kolkata','Asia/Bangkok','Asia/Singapore',
  'Asia/Shanghai','Asia/Tokyo','Australia/Sydney','Pacific/Auckland','UTC',
])

async function currentUserId(supabase: AgentSupabase): Promise<string> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('No authenticated user')
  return data.user.id
}

export const readOnboardingState: AgentTool = {
  name: 'read_onboarding_state',
  description: 'Read the current onboarding progress. Returns which steps are done and the values captured so far. Call this at the start of every conversation so you know what to ask next.',
  requiresConfirmation: false,
  inputSchema: { type: 'object', properties: {} },
  async execute(_raw, supabase, tenantId) {
    const userId = await currentUserId(supabase)
    const [{ data: tenant }, { data: user }, { count: productCount }] = await Promise.all([
      supabase.from('tenants')
        .select('name, business_type, base_currency, timezone, intended_channels, onboarded_at')
        .eq('id', tenantId).single(),
      supabase.from('users').select('display_name').eq('id', userId).single(),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    ])

    const profileDone = !!(user?.display_name && tenant?.timezone && tenant.timezone !== 'UTC')
    const businessTypeDone = !!tenant?.business_type
    const currencyDone = !!tenant?.base_currency && tenant.base_currency !== 'USD' // crude default-check; user can re-set
    const catalogDone = (productCount ?? 0) > 0
    const channelsDone = (tenant?.intended_channels?.length ?? 0) > 0
    const complete = !!tenant?.onboarded_at

    return {
      business_name: tenant?.name ?? null,
      display_name: user?.display_name ?? null,
      timezone: tenant?.timezone ?? null,
      business_type: tenant?.business_type ?? null,
      base_currency: tenant?.base_currency ?? null,
      intended_channels: tenant?.intended_channels ?? [],
      product_count: productCount ?? 0,
      steps: {
        profile: profileDone,
        business_type: businessTypeDone,
        currency: currencyDone,
        catalog: catalogDone,
        channels: channelsDone,
      },
      complete,
    }
  },
}

export const saveProfile: AgentTool = {
  name: 'save_profile',
  description: 'Save the user\'s display name and/or timezone. Both fields are optional individually — pass only the values you have just learned from the user. Do NOT invent or default a value the user has not given you. If the user gives a city/region for timezone, map it to the closest IANA zone yourself (e.g. "Bali" → "Asia/Makassar", "London" → "Europe/London").',
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    properties: {
      display_name: { type: 'string', description: 'How the user wants to be addressed (e.g. first name)' },
      timezone:     { type: 'string', description: 'IANA timezone, e.g. "Asia/Singapore"' },
    },
  },
  async execute(raw, supabase, tenantId) {
    const input = raw as { display_name?: string; timezone?: string }
    const updates: { display_name?: string; timezone?: string } = {}
    let name: string | undefined
    let tz: string | undefined

    if (typeof input.display_name === 'string' && input.display_name.trim()) {
      name = input.display_name.trim().slice(0, 80)
      updates.display_name = name
    }
    if (typeof input.timezone === 'string' && input.timezone.trim()) {
      if (!VALID_TIMEZONES.has(input.timezone)) throw new Error(`Unknown timezone "${input.timezone}". Use an IANA zone like "Asia/Singapore".`)
      tz = input.timezone
      updates.timezone = tz
    }
    if (!name && !tz) throw new Error('Provide display_name and/or timezone — at least one is required.')

    const userId = await currentUserId(supabase)
    if (name) {
      const { error } = await supabase.from('users').update({ display_name: name }).eq('id', userId)
      if (error) throw new Error(error.message)
    }
    if (tz) {
      const { error } = await supabase.from('tenants').update({ timezone: tz }).eq('id', tenantId)
      if (error) throw new Error(error.message)
    }

    return { display_name: name ?? null, timezone: tz ?? null }
  },
}

export const saveBusinessType: AgentTool = {
  name: 'save_business_type',
  description: 'Save what kind of products the tenant sells. Must be one of: peptides, nootropics, sarms, general.',
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    required: ['business_type'],
    properties: {
      business_type: {
        type: 'string',
        enum: ['peptides', 'nootropics', 'sarms', 'general'],
        description: 'Category of products sold',
      },
    },
  },
  async execute(raw, supabase, tenantId) {
    const input = raw as { business_type: string }
    if (!VALID_TYPES.has(input.business_type)) throw new Error('Invalid business type')
    const { error } = await supabase.from('tenants').update({ business_type: input.business_type }).eq('id', tenantId)
    if (error) throw new Error(error.message)
    return { business_type: input.business_type }
  },
}

export const saveCurrency: AgentTool = {
  name: 'save_currency',
  description: 'Save the tenant\'s base currency for orders and reporting. Must be one of: USD, EUR, GBP, AUD, SGD, IDR, MYR, THB.',
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    required: ['currency'],
    properties: {
      currency: {
        type: 'string',
        enum: ['USD', 'EUR', 'GBP', 'AUD', 'SGD', 'IDR', 'MYR', 'THB'],
      },
    },
  },
  async execute(raw, supabase, tenantId) {
    const input = raw as { currency: string }
    if (!VALID_CURRENCIES.has(input.currency)) throw new Error('Unsupported currency')
    const { error } = await supabase.from('tenants').update({ base_currency: input.currency }).eq('id', tenantId)
    if (error) throw new Error(error.message)
    return { currency: input.currency }
  },
}

export const saveChannelIntent: AgentTool = {
  name: 'save_channel_intent',
  description: 'Record which messaging channels the tenant plans to use with customers. Valid channels: whatsapp, telegram, email. Does NOT connect the channel — just records intent. The user will connect them later.',
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    required: ['channels'],
    properties: {
      channels: {
        type: 'array',
        items: { type: 'string', enum: ['whatsapp', 'telegram', 'email'] },
      },
    },
  },
  async execute(raw, supabase, tenantId) {
    const input = raw as { channels: string[] }
    const valid = input.channels.filter(c => VALID_CHANNELS.has(c))
    const { error } = await supabase.from('tenants').update({ intended_channels: valid }).eq('id', tenantId)
    if (error) throw new Error(error.message)
    return { channels: valid }
  },
}

export const seedCatalogPreset: AgentTool = {
  name: 'seed_catalog_preset',
  description: 'TEMPORARY for v0.1 — seed the catalog with the preset product list for the tenant\'s business type. The full agent-driven catalog import (upload PDF / screenshot, extract, review) will replace this in the next release. Only call this after business_type is set.',
  requiresConfirmation: true,
  inputSchema: { type: 'object', properties: {} },
  summarise() {
    return 'Seed catalog from preset list (placeholder for full import)'
  },
  async execute(_raw, supabase, tenantId) {
    const { data: tenant } = await supabase.from('tenants').select('business_type').eq('id', tenantId).single()
    if (!tenant?.business_type) throw new Error('Business type not set yet')
    if (!VALID_TYPES.has(tenant.business_type)) throw new Error('Invalid business type on tenant')

    const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
    if ((count ?? 0) > 0) return { count: count!, skipped: 'catalog already populated' }

    const presets = CATALOG_PRESETS[tenant.business_type as BusinessType]
    const rows = presets.map(p => ({
      tenant_id: tenantId,
      name: p.name, sku: p.sku,
      product_family: p.product_family,
      unit_price: p.unit_price,
      description: p.description,
    }))
    const { data: inserted, error } = await supabase.from('products').insert(rows).select('id, sku')
    if (error) throw new Error(error.message)

    // starter batches, non-fatal
    if (inserted && inserted.length > 0) {
      const batchRows = inserted.map(p => ({
        tenant_id: tenantId, product_id: p.id, batch_number: 'SEED-001', stock: 10,
      }))
      await supabase.from('batches').insert(batchRows).then(() => {})
    }

    return { count: inserted?.length ?? rows.length }
  },
}

export const extractCatalog: AgentTool = {
  name: 'extract_catalog',
  description: 'PLACEHOLDER — will extract products from an uploaded PDF / image / pasted text. Coming in next release. For v0.1, tell the user to use seed_catalog_preset or proceed without it.',
  requiresConfirmation: false,
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    return { ready: false, message: 'Catalog import via upload is coming next. For now offer seed_catalog_preset or skip.' }
  },
}

export const completeOnboarding: AgentTool = {
  name: 'complete_onboarding',
  description: 'Mark onboarding as complete and send the user to their dashboard. Only call when profile, business_type, currency, and channels are all set. Catalog is optional (user can add products later).',
  requiresConfirmation: true,
  inputSchema: { type: 'object', properties: {} },
  summarise() {
    return 'Finish onboarding and go to dashboard'
  },
  async execute(_raw, supabase, tenantId) {
    const { error } = await supabase.from('tenants').update({ onboarded_at: new Date().toISOString() }).eq('id', tenantId)
    if (error) throw new Error(error.message)
    return { complete: true }
  },
}

export const ONBOARDING_TOOLS: AgentTool[] = [
  readOnboardingState,
  saveProfile,
  saveBusinessType,
  saveCurrency,
  saveChannelIntent,
  seedCatalogPreset,
  extractCatalog,
  completeOnboarding,
]
