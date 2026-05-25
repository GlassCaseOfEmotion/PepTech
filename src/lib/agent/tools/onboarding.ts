import type { AgentTool, AgentSupabase } from '../types'
import { CATALOG_PRESETS, type BusinessType } from '@/lib/catalog-presets'
import { extractCatalog as runExtraction } from '@/lib/catalog/extraction/extract'
import { loadPeptideReference } from '@/lib/catalog/reference/lookup'
import { enrichWithReference } from '@/lib/catalog/extraction/enrich'
import { OFF_PLATFORM_METHODS } from '@/types/payments'
import type { PaymentType } from '@/types/payments'

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

export interface OnboardingStateSnapshot {
  business_name: string | null
  display_name: string | null
  timezone: string | null
  business_type: string | null
  base_currency: string | null
  intended_channels: string[]
  product_count: number
  steps: {
    profile: boolean
    business_type: boolean
    currency: boolean
    catalog: boolean
    channels: boolean
    payments: boolean
    timezone_asked: boolean
    currency_asked: boolean
  }
  complete: boolean
}

/** Fetches the canonical onboarding state for a tenant. Shared by the
 * read_onboarding_state tool (model-callable) and the executor's
 * per-turn system-prompt injection (deterministic, doesn't rely on the
 * model remembering to call the tool). */
export async function fetchOnboardingStateSnapshot(
  supabase: AgentSupabase,
  tenantId: string,
): Promise<OnboardingStateSnapshot> {
  const userId = await currentUserId(supabase)
  const [
    { data: tenant },
    { data: user },
    { count: productCount },
    { count: paymentConfigCount },
    { count: cryptoWalletCount },
  ] = await Promise.all([
    supabase.from('tenants')
      .select('name, business_type, base_currency, timezone, intended_channels, onboarded_at')
      .eq('id', tenantId).single(),
    supabase.from('users').select('display_name').eq('id', userId).single(),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('tenant_payment_configs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('tenant_crypto_wallets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  ])

  // Defaults present at signup that should NOT count as "answered":
  //  - tenants.base_currency defaults to 'USD'
  //  - tenants.timezone defaults to 'UTC'
  //  - users.display_name is now null at signup (older tenants may have an
  //    email-prefix value — treated as answered for them).
  const currencyAnswered = !!tenant?.base_currency && tenant.base_currency !== 'USD'
  const timezoneAnswered = !!tenant?.timezone && tenant.timezone !== 'UTC'
  // Profile is one rail step covering both name AND timezone; without this
  // bundling the agent reads steps.profile=true after just the name and
  // skips timezone entirely. Matches the rail's deriveSteps() exactly.
  const profileDone = !!user?.display_name && timezoneAnswered
  const businessTypeDone = !!tenant?.business_type
  const catalogDone = (productCount ?? 0) > 0
  const channelsDone = (tenant?.intended_channels?.length ?? 0) > 0
  const paymentsConfigured = (paymentConfigCount ?? 0) > 0 || (cryptoWalletCount ?? 0) > 0
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
      payments: paymentsConfigured,
      timezone_asked: timezoneAnswered,
      currency_asked: currencyAnswered,
    },
    complete,
  }
}

export const readOnboardingState: AgentTool = {
  name: 'read_onboarding_state',
  description: 'Refresh the onboarding state shown in your system prompt. The system prompt already includes the latest state at the start of every turn — only call this tool if you want to re-read after a save tool ran in this same turn.',
  requiresConfirmation: false,
  inputSchema: { type: 'object', properties: {} },
  async execute(_raw, supabase, tenantId) {
    return fetchOnboardingStateSnapshot(supabase, tenantId)
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
    'BEFORE calling extract_catalog, write a warm 2–3 sentence briefing that EXPLAINS the value-add you are about to perform, then call the tool in the same response. Cover all three of these points so the user understands what they\'re waiting for AND knows how to interpret the result:',
    '  1. You\'ll pull each product out of their file (PDF / screenshot / pasted text).',
    '  2. You\'ll cross-reference each product against the Peptech peptide reference database — for well-known peptides this pre-fills the description and dosing protocol automatically (those rows show a "matched" badge in the table).',
    '  3. You\'ll lay it all out as an editable table they can review row by row — they\'ll need to add details for the unmatched rows, and we recommend they sanity-check the matched ones too.',
    'Tone: warm concierge, not clinical. Set the expectation that it usually takes 60–90 seconds on a typical price list. End with a gentle "please wait" or equivalent. Examples (use the spirit, not the exact words):',
    '  * "Wonderful. I\'ll read through your price list and pull each product out, cross-reference them against our peptide reference database to pre-fill descriptions and dosing protocols for the ones we recognise, and lay the whole thing out as an editable table for you. Anything with a \'matched\' badge has its protocol pre-filled — you\'ll just need to fill in details for the rest. Usually about 60–90 seconds, please hang tight."',
    '  * "Lovely. Reading through your list now — I\'ll extract each product, match the well-known peptides against our reference data so the descriptions and protocols come pre-populated, and present everything as a tidy table you can review. Takes about a minute, please wait."',
    'If the tenant\'s business_type is NOT peptides (nootropics, sarms, general), drop the protocol-prefill line — the reference matching is peptide-specific. The extraction + table-format value still apply.',
    '',
    'AFTER IT RETURNS: The UI renders the extracted products as an editable proposal card BELOW your follow-up message. Write a brief, confident one-sentence follow-up like "Done — 24 products extracted. Review them below and hit Import when they look right." DO NOT list the products in chat — the proposal card shows them.',
    '',
    'CRITICAL: After writing that follow-up, STOP. Do not call any other tool, do not ask the next-step question (channels, etc.), do not call present_choices. The user has not imported yet — they need to review and click Import first. Any further conversation would jam against the proposal card and confuse them.',
    '',
    'AFTER IMPORT: The client will send you a synthetic message that begins with "I imported N products from <file>." THAT is your signal that the catalog step is done. React briefly (one short congratulatory sentence) and THEN move on to the next step (channels) — typically by calling present_choices for the channel options.',
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
    // model wants the original filename when describing the file.
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

    const [result, references] = await Promise.all([
      runExtraction({
        businessType:    (tenant?.business_type ?? null) as 'peptides' | 'nootropics' | 'sarms' | 'general' | null,
        baseCurrency:    tenant?.base_currency ?? 'USD',
        fileUrl:         signed.signedUrl,
        mimeType:        mimeFromExt,
        source_file_ref: input.file_ref,
        source_filename: filename,
      }),
      loadPeptideReference(supabase).catch((e: unknown) => {
        // Non-fatal: extraction without reference enrichment still works.
        console.error('[extract_catalog] peptide_reference load failed', e instanceof Error ? e.message : e)
        return []
      }),
    ])
    const enriched = enrichWithReference(result, references)

    // Empty extraction is almost never useful — the UI would render an empty
    // proposal card. Surface a diagnostic the model can pass through to the
    // user, and let the UI fall back to the generic "tool ran" indicator.
    if (enriched.products.length === 0) {
      return {
        error: `Extracted 0 products from "${filename}". The file may be unclear, password-protected, or not a product list. The user can try a sharper image/PDF, paste the contents as text, or use seed_catalog_preset as a starter.`,
        detected_currency: enriched.detected_currency,
        tenant_notes: enriched.tenant_notes,
      }
    }
    return enriched
  },
}

export const completeOnboarding: AgentTool = {
  name: 'complete_onboarding',
  description: 'Mark onboarding as complete and send the user to their dashboard. Only call when profile, business_type, currency, channels, and payments are all set. Catalog is optional (user can add products later). Refuses to run until at least one payment method has been saved.',
  requiresConfirmation: true,
  inputSchema: { type: 'object', properties: {} },
  summarise() {
    return 'Finish onboarding and go to dashboard'
  },
  async execute(_raw, supabase, tenantId) {
    const [{ count: paymentConfigCount }, { count: cryptoWalletCount }] = await Promise.all([
      supabase.from('tenant_payment_configs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('tenant_crypto_wallets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    ])
    if ((paymentConfigCount ?? 0) === 0 && (cryptoWalletCount ?? 0) === 0) {
      throw new Error('Cannot complete onboarding yet: no payment methods configured. Call propose_payment_methods first.')
    }
    const { error } = await supabase.from('tenants').update({ onboarded_at: new Date().toISOString() }).eq('id', tenantId)
    if (error) throw new Error(error.message)
    return { complete: true }
  },
}

export const presentChoices: AgentTool = {
  name: 'present_choices',
  description: [
    'Render a set of clickable chip choices for the user to pick from. Use this WHENEVER you ask a closed-enum question — instead of listing the options as text in your reply.',
    '',
    'When to use:',
    '  - "Which currency?" — options: ["USD","EUR","GBP","AUD","SGD","IDR","MYR","THB"], multi: false',
    '  - "What kind of products?" — options: ["peptides","nootropics","sarms","general"], multi: false',
    '  - "Which channels?" — options: ["WhatsApp","Telegram","Email"], multi: true',
    '',
    'How it flows: you call this tool with the prompt + options. The UI renders the chips inline below your message. When the user clicks (single-select) or clicks Submit (multi-select), their selection arrives as a normal user message in the next turn — handle it the same way you would handle a typed response.',
    '',
    'Rules:',
    '  - Prompt should be one short sentence ("Which currency for orders?"), NOT a verbose recap of the question.',
    '  - Options are user-facing labels — capitalise nicely (e.g. "WhatsApp" not "whatsapp", "Peptides" not "peptides"). The downstream save_* tools accept canonical lowercase values; you do the mapping when calling the actual save tool.',
    '  - Keep the chip set short — 4–8 options ideal. For long lists (timezones, countries), ask as free text instead.',
    '  - Always still ALSO accept typed responses — chips are an accelerator, not the only path.',
  ].join('\n'),
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    required: ['prompt', 'options'],
    properties: {
      prompt:  { type: 'string', description: 'Short question shown above the chips. One sentence.' },
      options: { type: 'array', items: { type: 'string' }, description: 'User-facing labels for each chip. 4–8 ideal.' },
      multi:   { type: 'boolean', description: 'true for multi-select (chips toggle, then Submit). false (default) for single-select (click sends immediately).' },
    },
  },
  async execute(raw) {
    const input = raw as { prompt: string; options: string[]; multi?: boolean }
    // No-op server side. The output is consumed by the UI to render chips.
    return {
      prompt:  typeof input.prompt === 'string' ? input.prompt.trim().slice(0, 200) : '',
      options: Array.isArray(input.options) ? input.options.map(o => String(o).slice(0, 60)).filter(Boolean).slice(0, 12) : [],
      multi:   !!input.multi,
    }
  },
}

const CRYPTO_TYPES = ['btc', 'eth', 'usdt_trc20', 'usdt_erc20', 'usdc_erc20', 'sol', 'ltc', 'xmr'] as const

export const proposePaymentMethods: AgentTool = {
  name: 'propose_payment_methods',
  description: [
    'Open the payment-methods proposal card after the user has chosen what they want to support. The card lets them paste BYO crypto addresses, write off-platform payment instructions, and confirm managed-wallet provisioning. The tenant edits and submits — on submit we provision Privy (if managed_crypto) and write tenant_payment_configs rows.',
    '',
    "When to call: after asking via present_choices \"Which payment methods would you like to support?\" (multi-select with at least these options: ['Managed crypto wallet (we provision)','Bring my own crypto wallets','Bank transfer','Cash','Zelle','Venmo','Cash App','Wise']).",
    '',
    'How to map user selection to args:',
    "  - 'Managed crypto wallet (we provision)' → managed_crypto: true",
    "  - 'Bring my own crypto wallets' → ask a follow-up present_choices multi-select for which assets, options: ['BTC','ETH','USDT (TRC20)','USDT (ERC20)','USDC (ERC20)','SOL','LTC','XMR'] → map to ['btc','eth','usdt_trc20','usdt_erc20','usdc_erc20','sol','ltc','xmr']",
    "  - 'Bank transfer' → off_platform_methods includes 'bank_transfer'",
    "  - 'Cash' → 'cash'; 'Zelle' → 'zelle'; 'Venmo' → 'venmo'; 'Cash App' → 'cashapp'; 'Wise' → 'wise'",
    '',
    'Wait for the synthetic "I\'ve saved N payment methods" message before continuing to complete_onboarding.',
  ].join('\n'),
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    required: ['managed_crypto', 'byo_crypto_assets', 'off_platform_methods'],
    properties: {
      managed_crypto: {
        type: 'boolean',
        description: 'true if the tenant wants Peptech to provision a Solana wallet that auto-converts inbound USDT/BTC/ETH/etc. to USDC (Privy + NowPayments).',
      },
      byo_crypto_assets: {
        type: 'array',
        items: { type: 'string', enum: ['btc', 'eth', 'usdt_trc20', 'usdt_erc20', 'usdc_erc20', 'sol', 'ltc', 'xmr'] },
        description: 'Crypto assets the tenant will accept with their own wallet. Each becomes an editable row in the proposal card where they paste their address.',
      },
      off_platform_methods: {
        type: 'array',
        items: { type: 'string', enum: ['bank_transfer', 'cash', 'zelle', 'venmo', 'cashapp', 'wise'] },
        description: 'Off-platform methods (bank, cash, Zelle, Venmo, Cash App, Wise). Each becomes a textarea where the tenant writes payment instructions.',
      },
    },
  },
  async execute(raw) {
    // No-op server side — output consumed by the UI to render PaymentMethodsProposalCard.
    // Validate and echo a clean payload.
    const input = raw as {
      managed_crypto?: boolean
      byo_crypto_assets?: string[]
      off_platform_methods?: string[]
    }
    console.log('[propose_payment_methods] raw input from model', input)
    const off = (input.off_platform_methods ?? []).filter(t => OFF_PLATFORM_METHODS.includes(t as PaymentType))
    const byo = (input.byo_crypto_assets ?? []).filter(t => (CRYPTO_TYPES as readonly string[]).includes(t))
    const output = {
      managed_crypto: !!input.managed_crypto,
      byo_crypto_assets: byo,
      off_platform_methods: off,
    }
    console.log('[propose_payment_methods] validated output to UI', output)
    return output
  },
}

export const ONBOARDING_TOOLS: AgentTool[] = [
  readOnboardingState,
  presentChoices,
  saveProfile,
  saveBusinessType,
  saveCurrency,
  saveChannelIntent,
  seedCatalogPreset,
  extractCatalog,
  proposePaymentMethods,
  completeOnboarding,
]
