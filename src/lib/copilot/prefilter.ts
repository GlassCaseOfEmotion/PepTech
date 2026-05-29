import { defaultComplete, parseJsonContent, type CompleteFn } from './client'
import { COPILOT_CLASSIFY_MODEL } from './types'

export interface ConvMessage {
  direction: string
  content: string
  sent_at: string
}

export interface PrefilterResult {
  actionable: boolean
  signals: string[]
}

const SYSTEM = `You are a fast classifier for a peptide-supply CRM. Read the recent conversation between a SELLER and a CUSTOMER. Decide if the latest customer activity is an ACTIONABLE commerce moment worth drafting a suggestion for.

Actionable signals include: product interest, a stock or price question, a reorder being due, readiness to buy, or a clear cross-sell opening.
NOT actionable: greetings, small talk, thanks, logistics chit-chat, already-resolved questions.

Respond ONLY with JSON: {"actionable": boolean, "signals": string[]}.
signals is a short list of snake_case tags (e.g. "price_question","stock_question","reorder_due","ready_to_buy","cross_sell_opening","product_interest").`

function renderTranscript(messages: ConvMessage[]): string {
  return messages
    .map(m => `${m.direction === 'inbound' ? 'CUSTOMER' : 'SELLER'}: ${m.content}`)
    .join('\n')
}

export async function classifyActionable(
  messages: ConvMessage[],
  deps: { complete?: CompleteFn } = {},
): Promise<PrefilterResult> {
  const complete = deps.complete ?? defaultComplete
  try {
    const content = await complete({
      model: COPILOT_CLASSIFY_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: renderTranscript(messages) },
      ],
    })
    const parsed = parseJsonContent(content) as Partial<PrefilterResult>
    return {
      actionable: parsed.actionable === true,
      signals: Array.isArray(parsed.signals) ? parsed.signals.filter(s => typeof s === 'string') : [],
    }
  } catch (err) {
    // Fail closed: never let a classifier error trigger the expensive pass.
    // Log it though — a missing OPENROUTER_API_KEY or model error is otherwise invisible.
    console.error('[copilot] pre-filter classify failed:', err instanceof Error ? err.message : err)
    return { actionable: false, signals: [] }
  }
}
