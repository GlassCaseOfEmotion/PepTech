import {
  CANONICAL_FAMILIES,
  PRESENTATION_OPTIONS,
  type ExtractedProduct,
  type ExtractionResult,
  type Presentation,
} from './types'

interface RawProduct {
  name: unknown
  raw_name: unknown
  raw_category: unknown
  family: unknown
  presentation: unknown
  unit_price: unknown
  confidence: unknown
}

interface RawResult {
  detected_currency: unknown
  products: unknown
  tenant_notes: unknown
}

interface NormaliseCtx {
  source_file_ref: string
  source_filename: string
  model: string
  businessType: 'peptides' | 'nootropics' | 'sarms' | 'general' | null
}

const MAX_NAME = 200
const DEFAULT_STOCK = 10
const PRESENTATION_SET = new Set<string>(PRESENTATION_OPTIONS)

function clean(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim().slice(0, MAX_NAME) : fallback
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function clamp01(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

function normaliseFamily(v: unknown, businessType: NormaliseCtx['businessType']): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const slug = v.trim().toUpperCase()
  if (!businessType) return slug.slice(0, 40)
  const canonical = CANONICAL_FAMILIES[businessType]
  if (canonical.includes(slug)) return slug
  // Best-effort coercion: if the model returned a known synonym, map it.
  const synonyms: Record<string, string> = {
    'GROWTH HORMONE': 'GH',
    'GROWTH-HORMONE': 'GH',
    'GH-AXIS': 'GH',
    'RECOVERY': 'HEALING',
    'REPAIR': 'HEALING',
    'HEALING & RECOVERY': 'HEALING',
    'MITOCHONDRIAL': 'MITO',
    'COGNITION': 'NEURO',
    'BRAIN': 'NEURO',
    'COGNITIVE': businessType === 'peptides' ? 'NEURO' : 'COGNITIVE',
    'SKIN': 'COSMETIC',
    'TANNING': 'COSMETIC',
    'LIBIDO': 'COSMETIC',
  }
  if (synonyms[slug] && canonical.includes(synonyms[slug])) return synonyms[slug]
  return canonical.includes('OTHER') ? 'OTHER' : null
}

function normalisePresentation(v: unknown, businessType: NormaliseCtx['businessType']): Presentation | null {
  if (typeof v === 'string' && v.trim()) {
    const lower = v.trim().toLowerCase()
    if (PRESENTATION_SET.has(lower)) return lower as Presentation
    if (lower === 'tablet' || lower === 'pill') return 'oral'
    if (lower === 'sublingual') return 'spray'
  }
  // Peptides ship in vials by default — better to assume something useful
  // than leave the column blank for every row.
  return businessType === 'peptides' ? 'vial' : null
}

/**
 * Suggest a short, human-readable SKU from a product name.
 *
 * Heuristic chosen to match the convention already used by CATALOG_PRESETS:
 *  - "Retatrutide 10mg"  → "RETA-10"  (first 4 letters of compound + dose)
 *  - "Tirzepatide 30mg"  → "TIRZ-30"
 *  - "Semaglutide 10mg"  → "SEMA-10"
 *  - "BPC-157 5mg"       → "BPC-157"  (compound name carries digits → already unique)
 *  - "TB-500 5mg"        → "TB-500"
 *  - "GHK-Cu 50mg"       → "GHK-CU-50"
 *  - "5-Amino-1MQ 50mg"  → "5-AMINO-1MQ"
 *
 * Output is uppercase, alphanumeric with hyphens only — suitable as a real SKU.
 * Users can edit it in the proposal table before commit.
 */
export function suggestSku(name: string): string {
  // Strip trailing dose/quantity ("10mg", "50mg x 60caps", "5mg+5mg") and anything after.
  const stripped = name.replace(/\s+\d+(?:\.\d+)?\s*(?:mg|mcg|iu|ml|caps)\b.*$/i, '').trim()
  // First "word" (split on whitespace or +) — for blends, just take the first compound.
  const firstWord = stripped.split(/[\s+]+/)[0] ?? ''
  const compoundHasDigits = /\d/.test(firstWord)

  let abbrev: string
  if (/-/.test(firstWord) || /\d/.test(firstWord)) {
    // BPC-157, TB-500, GHK-Cu, 5-Amino-1MQ, CJC1295 — keep the compound as-is, uppercased.
    abbrev = firstWord.toUpperCase().replace(/[^A-Z0-9-]/g, '')
  } else {
    // Plain alphabetic compound — first 4 letters as the abbreviation.
    abbrev = firstWord.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '')
  }
  if (!abbrev) abbrev = 'PROD'

  // Compounds that already carry a digit (BPC-157, TB-500) don't need a dose
  // suffix — they're inherently unique to the compound. Only suffix when the
  // abbreviation is alpha-only.
  if (compoundHasDigits) return abbrev

  const doseMatch = name.match(/\b(\d+(?:\.\d+)?)\s*(?:mg|mcg|iu)\b/i)
  return doseMatch ? `${abbrev}-${doseMatch[1]}` : abbrev
}

/**
 * Take a candidate SKU and ensure it doesn't collide with any in `taken`.
 * Mutates `taken` to include the chosen SKU.
 *
 * The candidate is normalised to uppercase + alphanumeric/hyphen first, so
 * even free-text user edits in the proposal end up well-formed in the DB.
 */
export function reserveSku(candidate: string, taken: Set<string>, fallbackName: string): string {
  const cleaned = (candidate || '').toUpperCase().replace(/[^A-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
    || suggestSku(fallbackName)
  if (!taken.has(cleaned)) { taken.add(cleaned); return cleaned }
  let i = 2
  while (taken.has(`${cleaned}-${i}`)) i++
  const final = `${cleaned}-${i}`
  taken.add(final)
  return final
}

/** Legacy slug-style SKU generator. Kept for back-compat with seed_catalog_preset
 * and tests; new extraction commits use suggestSku + reserveSku instead. */
export function generateSku(name: string, taken: Set<string>): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'product'
  if (!taken.has(base)) { taken.add(base); return base }
  let i = 2
  while (taken.has(`${base}-${i}`)) i++
  const sku = `${base}-${i}`
  taken.add(sku)
  return sku
}

export function validateAndNormalise(raw: RawResult, ctx: NormaliseCtx): ExtractionResult {
  if (!Array.isArray(raw.products)) {
    throw new Error('Extraction response: products is not an array')
  }
  const products: ExtractedProduct[] = []
  for (const r of raw.products as RawProduct[]) {
    const price = num(r.unit_price)
    if (price === null || price <= 0) continue
    const name = clean(r.name)
    if (!name) continue
    products.push({
      name,
      sku: suggestSku(name),
      raw_name: clean(r.raw_name, name),
      raw_category: typeof r.raw_category === 'string' && r.raw_category.trim() ? r.raw_category.trim().slice(0, 100) : null,
      family: normaliseFamily(r.family, ctx.businessType),
      presentation: normalisePresentation(r.presentation, ctx.businessType),
      unit_price: price,
      stock: DEFAULT_STOCK,
      confidence: clamp01(r.confidence),
    })
  }
  const tenant_notes = Array.isArray(raw.tenant_notes)
    ? (raw.tenant_notes as unknown[]).filter((x): x is string => typeof x === 'string').map(s => s.trim()).filter(Boolean)
    : []
  return {
    detected_currency: typeof raw.detected_currency === 'string' ? raw.detected_currency.toUpperCase().slice(0, 6) : null,
    products,
    tenant_notes,
    source_file_ref: ctx.source_file_ref,
    source_filename: ctx.source_filename,
    model: ctx.model,
  }
}
