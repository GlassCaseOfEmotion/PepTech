export type SuggestionKind = 'cross_sell' | 'draft_order' | 'quote' | 'reply' | 'payment_link'
export type SuggestionStatus = 'open' | 'sent' | 'committed' | 'dismissed' | 'expired'

// Per-kind payloads. Stored as jsonb; the drafting LLM fills these.
export interface CrossSellPayload {
  product_id: string
  product_name: string
  offer_message: string   // a ready-to-send reply offering the cross-sell
  affinity_pct: number    // 0-100, for the "67% of similar protocols" line
}
export interface DraftOrderPayload {
  customer_id: string
  payment_asset: string
  items: { product_id: string; product_name: string; qty: number; unit_price: number }[]
  total: number
}
export interface QuotePayload { message: string }   // drafted price/availability message
export interface ReplyPayload { message: string }   // drafted conversational reply
export interface PaymentLinkPayload {
  order_id?: string
  draft_order?: DraftOrderPayload
}

export interface SuggestionDraft {
  kind: SuggestionKind
  payload: Record<string, unknown>
  confidence: number   // 0-1
  reasoning: string
  dedupKey: string     // e.g. "cross_sell:<product_id>", "quote:<product_id>"
}

// Only surface/keep suggestions at or above this confidence. Tune in QA.
export const COPILOT_CONFIDENCE_THRESHOLD = 0.6

// Cheap classifier model + capable drafting model. Both overridable via env.
// Treat blank env vars as unset: `??` alone keeps an empty string (e.g. a
// `OPENROUTER_COPILOT_DRAFT_MODEL=` defined-but-blank var on Vercel would
// otherwise resolve the model to "" and every draft call would fail).
const envModel = (v: string | undefined): string | undefined => {
  const t = v?.trim()
  return t ? t : undefined
}
export const COPILOT_CLASSIFY_MODEL =
  envModel(process.env.OPENROUTER_COPILOT_CLASSIFY_MODEL) ?? 'anthropic/claude-haiku-4.5'
export const COPILOT_DRAFT_MODEL =
  envModel(process.env.OPENROUTER_COPILOT_DRAFT_MODEL)
  ?? envModel(process.env.OPENROUTER_MODEL)
  ?? 'google/gemini-flash-2.5'

// How many recent messages of the conversation to feed the LLM passes.
export const COPILOT_HISTORY_LIMIT = 20
