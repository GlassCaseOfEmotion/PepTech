import type { SuggestionKind, SuggestionStatus, DraftOrderPayload } from '@/lib/copilot/types'

export type { SuggestionKind, SuggestionStatus } from '@/lib/copilot/types'
export type {
  CrossSellPayload, DraftOrderPayload, QuotePayload, ReplyPayload, PaymentLinkPayload,
} from '@/lib/copilot/types'

export interface SuggestionRow {
  id: string
  conversationId: string
  customerId: string
  kind: SuggestionKind
  status: SuggestionStatus
  payload: Record<string, unknown>
  confidence: number
  reasoning: string | null
  createdAt: string
}

interface DbSuggestionRow {
  id: string
  conversation_id: string
  customer_id: string
  kind: SuggestionKind
  status: SuggestionStatus
  payload: Record<string, unknown>
  confidence: number
  reasoning: string | null
  created_at: string
}

export function mapSuggestionRow(row: DbSuggestionRow): SuggestionRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    customerId: row.customer_id,
    kind: row.kind,
    status: row.status,
    payload: row.payload ?? {},
    confidence: row.confidence,
    reasoning: row.reasoning,
    createdAt: row.created_at,
  }
}

export interface CreateOrderInput {
  customerId: string
  conversationId?: string
  paymentAsset?: string
  paymentAmount: number
  items: { productId: string; qty: number; unitPriceSnapshot: number }[]
}

export function draftOrderToCreateOrderInput(
  payload: DraftOrderPayload,
  conversationId: string,
): CreateOrderInput {
  return {
    customerId: payload.customer_id,
    conversationId,
    paymentAsset: payload.payment_asset,
    paymentAmount: payload.total,
    items: payload.items.map(i => ({
      productId: i.product_id,
      qty: i.qty,
      unitPriceSnapshot: i.unit_price,
    })),
  }
}
