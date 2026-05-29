import { defaultComplete, parseJsonContent, type CompleteFn } from './client'
import {
  COPILOT_DRAFT_MODEL,
  COPILOT_CONFIDENCE_THRESHOLD,
  type SuggestionDraft,
  type SuggestionKind,
} from './types'
import type { CopilotContext } from './context'

const KINDS: SuggestionKind[] = ['cross_sell', 'draft_order', 'quote', 'reply', 'payment_link']

function systemPrompt(currency: string): string {
  return `You are a commerce copilot for a peptide-supply seller. You watch a live conversation and DRAFT actions for the seller to approve. You never send anything yourself.

All catalog prices, and every monetary amount you produce, are in ${currency}. Express prices in ${currency} (do not use $ unless the currency is USD).

You may propose these suggestion kinds:
- "cross_sell": a product to offer, with an affinity reason. payload: {product_id, product_name, offer_message, affinity_pct}. offer_message is a short, ready-to-send reply offering it.
- "draft_order": an order to build. payload: {customer_id, payment_asset, items:[{product_id, product_name, qty, unit_price}], total}. customer_id MUST be the id of the provided customer.
- "quote": a drafted message stating price + stock availability for what the customer asked. payload: {message}.
- "reply": a drafted conversational reply. payload: {message}.
- "payment_link": only when an order is ready to pay. payload: {draft_order:{...}} or {order_id}.

Matching customer wording to the catalog:
- Customers use shorthand/abbreviations. Match them to catalog products by fuzzy name / SKU / product_family — e.g. "reta"→Retatrutide, "bpc"→BPC-157, "tb"/"tb500"→TB-500, "tesa"→Tesamorelin, "nad"/"nad+"→NAD+, "ghk"→GHK-Cu, "teso"→Testosterone.
- Prefer matching over asking. Only treat an item as unidentifiable if there is genuinely no reasonable catalog match — then add a single short "reply" asking to clarify just those items.

Rules:
- Use ONLY product_ids, names and prices present in the provided catalog. Never invent SKUs or prices.
- affinity_pct must come from the provided affinity data, not guessed; omit cross_sell entirely if there is no affinity signal for the product.
- Be decisive: prefer one strong primary suggestion over many weak ones.
- confidence is 0..1: use >0.8 for explicit price/stock/reorder asks on in-stock catalog items; lower it when you are inferring intent.

Respond ONLY with JSON: {"suggestions":[{"kind","payload","confidence","reasoning"}]}.`
}

function dedupKeyFor(kind: SuggestionKind, payload: Record<string, unknown>): string {
  if (kind === 'cross_sell') return `cross_sell:${String(payload.product_id ?? '')}`
  if (kind === 'draft_order' || kind === 'payment_link') {
    const items = (payload.items as { product_id: string }[] | undefined) ?? []
    const key = items.map(i => i.product_id).sort().join(',')
    return `${kind}:${key}`
  }
  return kind  // quote / reply: at most one open at a time per conversation
}

export async function draftSuggestions(
  ctx: CopilotContext,
  deps: { complete?: CompleteFn } = {},
): Promise<SuggestionDraft[]> {
  const complete = deps.complete ?? defaultComplete
  let parsed: unknown
  let rawContent = ''
  try {
    rawContent = await complete({
      model: COPILOT_DRAFT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt(ctx.currency) },
        { role: 'user', content: JSON.stringify(ctx) },
      ],
    })
    parsed = parseJsonContent(rawContent)
  } catch (err) {
    console.error('[copilot] drafting pass failed:', err instanceof Error ? err.message : err, '| raw:', rawContent.slice(0, 500))
    return []
  }

  // Tolerate model output variance: accept {suggestions:[...]} OR a bare [...] array.
  const container = parsed as { suggestions?: unknown }
  const raw = Array.isArray(container?.suggestions) ? container.suggestions
    : Array.isArray(parsed) ? parsed
    : []
  if (raw.length === 0) {
    console.warn('[copilot] draft produced no suggestions array | raw:', rawContent.slice(0, 500))
  }

  const drafts: SuggestionDraft[] = []
  for (const entry of raw as Record<string, unknown>[]) {
    const kind = entry.kind as SuggestionKind
    if (!KINDS.includes(kind)) {
      console.warn(`[copilot] dropped suggestion: unknown kind "${String(entry.kind)}"`)
      continue
    }
    // Coerce confidence — some models return it as a string ("0.8").
    const confidence = Number(entry.confidence)
    if (!Number.isFinite(confidence) || confidence < COPILOT_CONFIDENCE_THRESHOLD) {
      console.warn(`[copilot] dropped ${kind}: confidence ${JSON.stringify(entry.confidence)} below ${COPILOT_CONFIDENCE_THRESHOLD}`)
      continue
    }
    const payload = (entry.payload && typeof entry.payload === 'object'
      ? entry.payload
      : {}) as Record<string, unknown>
    drafts.push({
      kind,
      payload,
      confidence: Math.max(0, Math.min(1, confidence)),
      reasoning: typeof entry.reasoning === 'string' ? entry.reasoning : '',
      dedupKey: dedupKeyFor(kind, payload),
    })
  }
  return drafts
}
