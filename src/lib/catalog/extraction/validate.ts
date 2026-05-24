import type { ExtractedProduct, ExtractionResult } from './types'

interface RawProduct {
  name: unknown
  raw_name: unknown
  category: unknown
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
}

const MAX_NAME = 200

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
      raw_name: clean(r.raw_name, name),
      category: typeof r.category === 'string' && r.category.trim() ? r.category.trim().slice(0, 100) : null,
      unit_price: price,
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
