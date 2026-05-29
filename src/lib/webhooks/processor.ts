import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createServiceClient } from '@/lib/supabase/server'
import { runAutomationsForEvent } from '@/lib/automations/engine'
import { runCopilotPass } from '@/lib/copilot/run'

export interface InboundMessageParams {
  tenantId: string
  channelType: 'whatsapp' | 'telegram' | 'email'
  identifier: string
  displayHandle: string
  content: string
  externalId: string
  sentAt: string
  metadata?: Record<string, unknown>
}

export async function processInboundMessage(
  supabase: SupabaseClient<Database>,
  params: InboundMessageParams,
): Promise<{ conversationId: string; messageId: string }> {
  const { tenantId, channelType, identifier, displayHandle, content, externalId, sentAt, metadata } = params

  // 1. Find existing customer_channel
  const { data: existingChannel } = await supabase
    .from('customer_channels')
    .select('customer_id')
    .eq('tenant_id', tenantId)
    .eq('channel_type', channelType)
    .eq('identifier', identifier)
    .single()

  let customerId: string

  if (existingChannel) {
    customerId = existingChannel.customer_id
  } else {
    // Auto-create customer on first contact
    const { data: newCustomer, error: custErr } = await supabase
      .from('customers')
      .insert({ tenant_id: tenantId, display_name: displayHandle })
      .select('id')
      .single()

    if (custErr || !newCustomer) throw new Error(`Failed to create customer: ${custErr?.message}`)
    customerId = newCustomer.id

    const { error: ccErr } = await supabase
      .from('customer_channels')
      .insert({
        tenant_id: tenantId,
        customer_id: customerId,
        channel_type: channelType,
        identifier,
        display_handle: displayHandle,
        is_primary: true,
      })

    if (ccErr) throw new Error(`Failed to create customer_channel: ${ccErr.message}`)
  }

  // 2. Find or create conversation
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id, status, unread_count')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .eq('channel_type', channelType)
    .eq('channel_identifier', identifier)
    .single()

  let conversationId: string
  let currentStatus: string

  if (existingConv) {
    conversationId = existingConv.id
    currentStatus = existingConv.status
  } else {
    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        customer_id: customerId,
        channel_type: channelType,
        channel_identifier: identifier,
        status: 'new',
      })
      .select('id, status')
      .single()

    if (convErr || !newConv) throw new Error(`Failed to create conversation: ${convErr?.message}`)
    conversationId = newConv.id
    currentStatus = 'new'

    void runAutomationsForEvent(createServiceClient(), tenantId, 'new_thread', {
      conversationId: newConv.id,
      customerId,
    }).catch(console.error)
  }

  // 3. Insert message — idempotent: catch duplicate external_id (23505) and skip
  const { data: message, error: msgErr } = await supabase
    .from('messages')
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'inbound',
      content,
      sent_at: sentAt,
      status: 'delivered',
      external_id: externalId,
      metadata: (metadata ?? null) as never,
    })
    .select('id')
    .single()

  if (msgErr) {
    // 23505 = unique_violation: message already processed, skip side effects
    if (msgErr.code === '23505') return { conversationId, messageId: '' }
    throw new Error(`Failed to insert message: ${msgErr.message}`)
  }

  // 4. Update conversation snippet + status
  // (unread_count is incremented by the trg_message_insert DB trigger on messages INSERT)
  const newStatus = ['resolved', 'snoozed'].includes(currentStatus) ? 'needs_reply'
    : currentStatus === 'new' ? 'new'
    : 'needs_reply'

  const windowUpdate = channelType === 'whatsapp'
    ? { window_expires_at: new Date((sentAt ? new Date(sentAt).getTime() : Date.now()) + 24 * 60 * 60 * 1000).toISOString() }
    : {}

  await supabase
    .from('conversations')
    .update({
      status: newStatus,
      last_message_at: sentAt,
      last_message_snippet: content.slice(0, 100),
      ...windowUpdate,
    })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)

  // Proactive AI copilot: draft suggestions as the conversation progresses.
  // Fire-and-forget on a service client (no user session in a webhook).
  void runCopilotPass(createServiceClient(), {
    tenantId,
    conversationId,
    customerId,
    messageId: message.id,
  }).catch(console.error)

  return { conversationId, messageId: message.id }
}
