import type { AgentTool, AgentSupabase } from '../types'
import { CATALOG_PRESETS, type BusinessType } from '@/lib/catalog-presets'
import { extractCatalog as runExtraction } from '@/lib/catalog/extraction/extract'

const VALID_TYPES = new Set(['peptides', 'nootropics', 'sarms', 'general'])
const VALID_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'AUD', 'SGD', 'IDR', 'MYR', 'THB'])
const VALID_CHANNELS = new Set(['whatsapp', 'telegram', 'email'])
const VALID_TIMEZONES = new Set([
  'Pacific/Honolulu','America/Anchorage','America/Los_Angeles','America/Denver',
  'America/Chicago','America/New_York','America/Sao_Paulo','Europe/London',
  'Europe/Amsterdam','Europe/Lisbon','Europe/Istanbul','Asia/Dubai',
  'Asia/Karachi','Asia/Kolkata','Asia/Bangkok','Asia/Jakarta','Asia/Makassar',
  'Asia/Singapore','Asia/Shanghai','Asia/Tokyo','Australia/Sydney',
  'Pacific/Auckland','UTC',
])

// Deprecated IANA aliases — accepted on input, canonicalised before lookup so we
// don't reject valid zones that models commonly emit from older training data.
const TIMEZONE_ALIASES: Record<string, string> = {
  'Asia/Ujung_Pandang':  'Asia/Makassar',
  'Asia/Saigon':         'Asia/Ho_Chi_Minh',
  'Asia/Calcutta':       'Asia/Kolkata',
  'Asia/Katmandu':       'Asia/Kathmandu',
  'Asia/Rangoon':        'Asia/Yangon',
  'Europe/Kiev':         'Europe/Kyiv',
  'America/Buenos_Aires':'America/Argentina/Buenos_Aires',
  'Pacific/Truk':        'Pacific/Chuuk',
}

function canonicalTimezone(tz: string): string {
  return TIMEZONE_ALIASES[tz] ?? tz
}

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

    // Defaults present at signup that should NOT count as "answered":
    //  - tenants.base_currency defaults to 'USD'
    //  - tenants.timezone defaults to 'UTC'
    //  - users.display_name is now null at signup (older tenants may have an
    //    email-prefix value — treated as answered for them).
    const profileDone = !!user?.display_name
    const businessTypeDone = !!tenant?.business_type
    const currencyAnswered = !!tenant?.base_currency && tenant.base_currency !== 'USD'
    const timezoneAnswered = !!tenant?.timezone && tenant.timezone !== 'UTC'
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
        currency: currencyAnswered,
        catalog: catalogDone,
        channels: channelsDone,
        // Explicit "asked" signals for fields whose columns have non-null defaults.
        // The agent should keep asking until these flip true even if the column already has a value.
        timezone_asked: timezoneAnswered,
        currency_asked: currencyAnswered,
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
      const requested = input.timezone.trim()
      const canonical = canonicalTimezone(requested)
      if (!VALID_TIMEZONES.has(canonical)) throw new Error(`Unknown timezone "${requested}". Use an IANA zone like "Asia/Singapore".`)
      tz = canonical
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

    // Seed protocols for peptide presets that ship with protocol metadata
    if (tenant.business_type === 'peptides' && inserted) {
      const protocolRows = inserted
        .map(p => {
          const preset = presets.find(sp => sp.sku === p.sku)
          const proto = preset?.protocol
          if (!proto) return null
          return {
            tenant_id:          tenantId,
            product_id:         p.id,
            vial_strength:      proto.vial_strength,
            reconstitution_ml:  proto.reconstitution_ml,
            draw_volume_ml:     proto.draw_volume_ml,
            frequency:          proto.frequency,
            timing:             proto.timing ?? null,
            cycle_length_weeks: proto.cycle_length_weeks,
            notes:              proto.notes ?? null,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
      if (protocolRows.length > 0) {
        await supabase.from('product_protocols').insert(protocolRows).then(() => {})
      }
    }

    // Starter batches, non-fatal but logged. batch_number must be unique per
    // tenant (DB constraint), so suffix with SKU rather than 'SEED-001' for all.
    if (inserted && inserted.length > 0) {
      const batchRows = inserted.map(p => ({
        tenant_id: tenantId, product_id: p.id, batch_number: `SEED-${p.sku}`, stock: 10,
      }))
      const { error: batchErr } = await supabase.from('batches').insert(batchRows)
      if (batchErr) console.error('[seed_catalog_preset] batches insert failed', { message: batchErr.message, count: batchRows.length })
    }

    return { count: inserted?.length ?? rows.length }
  },
}

export const extractCatalog: AgentTool = {
  name: 'extract_catalog',
  description: [
    'Extract products from a price list the user has uploaded (PDF, screenshot, or pasted text).',
    '',
    'WHEN TO INVITE UPLOAD: At the catalog step, ask the user to share their price list. They can drag the file into the composer, click the paperclip, or paste it — invite broadly ("Drag in your price list — PDF, screenshot, or pasted text all work.").',
    '',
    'WHEN TO CALL THIS TOOL: When the user\'s message contains a "[uploaded: <filename> (file_ref=<ref>)]" hint, pass that file_ref to this tool.',
    '',
    'IMPORTANT — extraction takes ~10 seconds. BEFORE calling extract_catalog, write one short reassuring sentence in plain text so the user isn\'t left waiting in silence (e.g. "Got it — reading through your price list now…" or "Nice — let me pull the products out for you."). Then call the tool in the same response.',
    '',
    'AFTER IT RETURNS: The UI renders the extracted products as an editable proposal card BELOW your follow-up message. Write a brief, confident one-sentence follow-up like "Done — 24 products extracted. Review them below and hit Import when they look right." DO NOT list the products in chat — the proposal card shows them.',
    '',
    'AFTER IMPORT: The client will send you a synthetic message confirming the import — react briefly (one sentence) and move on to the next step (channels).',
    '',
    'FALLBACK: If the user says they don\'t have a price list or want to skip, offer seed_catalog_preset instead — a starter product list for their business type that they can edit later.',
  ].join('\n'),
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    required: ['file_ref'],
    properties: {
      file_ref: { type: 'string', description: 'Storage object name returned by the upload endpoint, e.g. "<tenant_id>/<uuid>.pdf"' },
    },
  },
  async execute(raw, supabase, tenantId) {
    const input = raw as { file_ref: string }

    // Find the most recent attachment metadata stored on the latest user message in this session
    // so we know the filename + mime type. The file_ref alone is enough to fetch, but the
    // model and provenance want the original filename.
    const { data: msgs } = await supabase
      .from('agent_messages')
      .select('content')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20)
    let filename = input.file_ref.split('/').pop() ?? 'upload'
    let mimeFromExt = 'application/octet-stream'
    const m = filename.match(/\.([a-z0-9]+)$/i)
    if (m) {
      const ext = m[1].toLowerCase()
      if (ext === 'pdf')                 mimeFromExt = 'application/pdf'
      else if (ext === 'png')            mimeFromExt = 'image/png'
      else if (ext === 'jpg' || ext === 'jpeg') mimeFromExt = 'image/jpeg'
      else if (ext === 'webp')           mimeFromExt = 'image/webp'
    }
    // Recover the original display filename if it was logged in the user message
    for (const row of msgs ?? []) {
      const txt = (row.content as string | null) ?? ''
      const match = txt.match(/\[uploaded: ([^\]]+) \(file_ref=([^)]+)\)\]/)
      if (match && match[2] === input.file_ref) { filename = match[1]; break }
    }

    // Read tenant context for the prompt
    const { data: tenant } = await supabase.from('tenants').select('business_type, base_currency').eq('id', tenantId).single()

    // Sign a short-lived URL for the file so the extraction call can fetch it
    const { data: signed, error: signErr } = await supabase.storage
      .from('onboarding-uploads').createSignedUrl(input.file_ref, 60 * 10)
    if (signErr || !signed?.signedUrl) throw new Error('Could not sign uploaded file URL')

    const result = await runExtraction({
      businessType:    (tenant?.business_type ?? null) as 'peptides' | 'nootropics' | 'sarms' | 'general' | null,
      baseCurrency:    tenant?.base_currency ?? 'USD',
      fileUrl:         signed.signedUrl,
      mimeType:        mimeFromExt,
      source_file_ref: input.file_ref,
      source_filename: filename,
    })

    // Empty extraction is almost never useful — the UI would render an empty
    // proposal card. Surface a diagnostic the model can pass through to the
    // user, and let the UI fall back to the generic "tool ran" indicator.
    if (result.products.length === 0) {
      return {
        error: `Extracted 0 products from "${filename}". The file may be unclear, password-protected, or not a product list. The user can try a sharper image/PDF, paste the contents as text, or use seed_catalog_preset as a starter.`,
        detected_currency: result.detected_currency,
        tenant_notes: result.tenant_notes,
      }
    }
    return result
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
