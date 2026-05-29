import type { AgentSupabase } from '../types'
import { sendWhatsAppMessage, TwilioWindowError } from '@/lib/channels/whatsapp'
import { sendTelegramMessage } from '@/lib/channels/telegram'
import { sendGmailMessage, sendMicrosoftMessage, type GoogleCredentials, type MicrosoftCredentials } from '@/lib/channels/email'

/** Send a message to the customer in a conversation, from a service-role /
 * background context. Replicates /api/send's text dispatch (which is cookie-
 * gated). Tenant-scoped on every query. Returns the new message id or an error. */
export async function deliverMessage(
  supabase: AgentSupabase, tenantId: string, conversationId: string, content: string,
): Promise<{ messageId: string } | { error: string }> {
  const text = content.trim()
  if (!text) return { error: 'Message is empty' }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, tenant_id, channel_type, channel_identifier, customer_id')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .single()
  if (!conv) return { error: 'Conversation not found' }

  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('credentials, is_active')
    .eq('tenant_id', tenantId)
    .eq('channel_type', conv.channel_type)
    .single()
  if (!channel?.is_active || !channel.credentials) return { error: 'Channel not connected' }

  const to = conv.channel_identifier as string
  const creds = channel.credentials as Record<string, unknown>
  let externalId: string | null = null

  try {
    if (conv.channel_type === 'whatsapp') {
      const statusCallbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/webhooks/twilio-status`
      externalId = await sendWhatsAppMessage(to, text, statusCallbackUrl)
    } else if (conv.channel_type === 'telegram') {
      await sendTelegramMessage(creds.bot_token as string, to, text, creds.business_connection_id as string | undefined)
    } else if (conv.channel_type === 'email') {
      const c = creds as unknown as GoogleCredentials | MicrosoftCredentials
      if (c.provider === 'google') await sendGmailMessage(c as GoogleCredentials, to, 'Re: your message', text)
      else await sendMicrosoftMessage(c as MicrosoftCredentials, to, 'Re: your message', text)
    } else {
      return { error: `Unsupported channel: ${conv.channel_type}` }
    }
  } catch (e) {
    if (e instanceof TwilioWindowError) return { error: 'The 24-hour messaging window has closed — the customer must message first.' }
    return { error: e instanceof Error ? e.message : 'Failed to send' }
  }

  const { data: msg, error: insErr } = await supabase
    .from('messages')
    .insert({ tenant_id: tenantId, conversation_id: conv.id, direction: 'outbound', content: text, status: 'sent', external_id: externalId } as never)
    .select('id')
    .single()
  if (insErr || !msg) return { error: insErr?.message ?? 'Failed to record message' }

  await supabase
    .from('conversations')
    .update({ status: 'in_progress', last_message_at: new Date().toISOString(), last_message_snippet: 'You: ' + text.slice(0, 97) } as never)
    .eq('id', conv.id)
    .eq('tenant_id', tenantId)

  return { messageId: msg.id as string }
}
