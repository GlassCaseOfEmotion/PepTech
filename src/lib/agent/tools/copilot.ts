import type { AgentTool } from '../types'
import { queryCustomers, getCustomer, queryOrders, getOrder, queryCatalog, getAnalytics, getConversationMessages } from './read'
import { getPeptideReference, updateDraftOrder, setShippingAddress, setPaymentAssetTool, getDraftOrder, finalizeOrder, sendMessage } from './copilot-commerce'

/** The copilot narrates to the operator by calling this. It performs no DB
 * write — the narration is the assistant message the executor persists; this
 * tool just gives the model an explicit, auto-executing way to "say something
 * to the operator" mid-turn and keep going. */
export const postCommentary: AgentTool = {
  name: 'post_commentary',
  description: 'Post a short internal note to the operator about what you are observing or doing in this conversation (e.g. "The customer is asking about RETA-10 stock."). Internal only — the customer never sees it. Use it to narrate; it does not message the customer.',
  inputSchema: {
    type: 'object',
    required: ['note'],
    properties: { note: { type: 'string', description: 'A short operator-facing note.' } },
  },
  requiresConfirmation: false,
  summarise: (input) => String((input as { note?: string }).note ?? ''),
  async execute(raw) {
    const input = raw as { note: string }
    return { posted: true, note: input.note }
  },
}

/** Read tools the copilot may use + post_commentary + draft-order commerce tools. */
export const COPILOT_TOOLS: AgentTool[] = [
  queryCustomers, getCustomer, queryOrders, getOrder, queryCatalog, getAnalytics, getConversationMessages,
  postCommentary,
  getPeptideReference, getDraftOrder, updateDraftOrder, setShippingAddress, setPaymentAssetTool, finalizeOrder, sendMessage,
]
