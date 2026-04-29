import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

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
  }

  // 3. Insert message — idempotent via external_id unique index
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: message, error: msgErr } = await (supabase as any)
    .from('messages')
    .upsert(
      {
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'inbound',
        content,
        sent_at: sentAt,
        status: 'delivered',
        external_id: externalId,
        metadata: metadata ?? null,
      },
      { onConflict: 'tenant_id,external_id', ignoreDuplicates: true },
    )
    .select('id')
    .single()

  if (msgErr) throw new Error(`Failed to insert message: ${msgErr.message}`)

  // Duplicate message (external_id already exists) — skip side effects
  if (!message) return { conversationId, messageId: '' }

  // 4. Atomically increment unread count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('increment_unread_count', { conv_id: conversationId, tenant: tenantId })

  // 5. Update conversation snippet + status
  const newStatus = ['resolved', 'snoozed'].includes(currentStatus) ? 'needs_reply'
    : currentStatus === 'new' ? 'new'
    : 'needs_reply'

  await supabase
    .from('conversations')
    .update({
      status: newStatus,
      last_message_at: sentAt,
      last_message_snippet: content.slice(0, 100),
    })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)

  return { conversationId, messageId: message.id }
}
