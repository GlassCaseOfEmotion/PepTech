import type { AgentTool } from '../types'
import { loadPeptideReference } from '@/lib/catalog/reference/lookup'
import { mergeDraftItems, setShipping, setPaymentAsset, readDraftOrder, finalizeDraftOrder } from '@/lib/agent/copilot/draft-order'
import { deliverMessage } from '@/lib/agent/copilot/deliver'

/** Read-only: the platform-wide peptide reference (canonical names + informal
 * aliases) for resolving customer shorthand. Compact projection to keep the
 * prompt small. */
export const getPeptideReference: AgentTool = {
  name: 'get_peptide_reference',
  description: 'List known peptides with their canonical names and informal aliases (e.g. "reta" → Retatrutide). Use to interpret customer shorthand, then match the canonical name against the tenant catalog (query_catalog).',
  inputSchema: { type: 'object', properties: {} },
  requiresConfirmation: false,
  async execute(_raw, supabase) {
    const refs = await loadPeptideReference(supabase)
    return refs.map(r => ({ canonical_name: r.canonical_name, family: r.family, aliases: r.aliases }))
  },
}

const CONV_CUST = {
  conversation_id: { type: 'string', description: 'The conversation_id from your context block.' },
  customer_id: { type: 'string', description: 'The customer_id from your context block.' },
}

export const updateDraftOrder: AgentTool = {
  name: 'update_draft_order',
  description: 'Add/adjust line items on this conversation\'s draft order. qty replaces the line; qty 0 removes it. Only products in the tenant catalog are accepted.',
  inputSchema: {
    type: 'object',
    required: ['conversation_id', 'customer_id', 'items'],
    properties: {
      ...CONV_CUST,
      items: { type: 'array', items: { type: 'object', required: ['product_id', 'qty'], properties: { product_id: { type: 'string' }, qty: { type: 'number' } } } },
    },
  },
  requiresConfirmation: false,
  async execute(raw, supabase, tenantId) {
    const i = raw as { conversation_id: string; customer_id: string; items: { product_id: string; qty: number }[] }
    return mergeDraftItems(supabase, tenantId, i.conversation_id, i.customer_id, i.items)
  },
}

export const setShippingAddress: AgentTool = {
  name: 'set_shipping_address',
  description: 'Set the shipping address on this conversation\'s draft order.',
  inputSchema: {
    type: 'object',
    required: ['conversation_id', 'customer_id', 'shipping'],
    properties: { ...CONV_CUST, shipping: { type: 'object', description: 'Free-form shipping fields (e.g. {ln1, ln2, city, state, zip}).' } },
  },
  requiresConfirmation: false,
  async execute(raw, supabase, tenantId) {
    const i = raw as { conversation_id: string; customer_id: string; shipping: Record<string, unknown> }
    return setShipping(supabase, tenantId, i.conversation_id, i.customer_id, i.shipping)
  },
}

export const setPaymentAssetTool: AgentTool = {
  name: 'set_payment_asset',
  description: 'Set the payment asset/method on this conversation\'s draft order.',
  inputSchema: {
    type: 'object',
    required: ['conversation_id', 'customer_id', 'payment_asset'],
    properties: { ...CONV_CUST, payment_asset: { type: 'string' } },
  },
  requiresConfirmation: false,
  async execute(raw, supabase, tenantId) {
    const i = raw as { conversation_id: string; customer_id: string; payment_asset: string }
    return setPaymentAsset(supabase, tenantId, i.conversation_id, i.customer_id, i.payment_asset)
  },
}

export const getDraftOrder: AgentTool = {
  name: 'get_draft_order',
  description: 'Get the current draft order (items, total, shipping, payment asset) for this conversation, or null if none yet.',
  inputSchema: { type: 'object', required: ['conversation_id'], properties: { conversation_id: { type: 'string' } } },
  requiresConfirmation: false,
  async execute(raw, supabase, tenantId) {
    const i = raw as { conversation_id: string }
    return readDraftOrder(supabase, tenantId, i.conversation_id)
  },
}

export const finalizeOrder: AgentTool = {
  name: 'finalize_order',
  description: 'Finalize this conversation\'s draft order into a real order (status created). Requires operator approval.',
  inputSchema: { type: 'object', required: ['conversation_id'], properties: { conversation_id: { type: 'string' } } },
  requiresConfirmation: true,
  summarise: () => 'Finalize the draft order into a real order',
  async execute(raw, supabase, tenantId) {
    const i = raw as { conversation_id: string }
    return finalizeDraftOrder(supabase, tenantId, i.conversation_id)
  },
}

export const sendMessage: AgentTool = {
  name: 'send_message',
  description: 'Draft and send a message to the CUSTOMER in this conversation (a reply, a quote, a cross-sell offer, or a question like asking for the shipping address). REQUIRES operator approval — the operator reviews and may edit your draft before it is sent, so write it as a ready-to-send message.',
  inputSchema: {
    type: 'object',
    required: ['conversation_id', 'content'],
    properties: {
      conversation_id: { type: 'string', description: 'The conversation_id from your context block.' },
      content: { type: 'string', description: 'The message to send to the customer.' },
    },
  },
  requiresConfirmation: true,
  summarise: (input) => `Send: "${String((input as { content?: string }).content ?? '').slice(0, 80)}"`,
  async execute(raw, supabase, tenantId) {
    const i = raw as { conversation_id: string; content: string }
    return deliverMessage(supabase, tenantId, i.conversation_id, i.content)
  },
}
