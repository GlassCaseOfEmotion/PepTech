import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/channels/whatsapp'
import { sendTelegramMessage } from '@/lib/channels/telegram'
import { sendGmailMessage, sendMicrosoftMessage } from '@/lib/channels/email'
import type { GoogleCredentials, MicrosoftCredentials } from '@/lib/channels/email'

export async function POST(request: Request) {
  const body = await request.json() as { conversationId?: string; content?: string }

  if (!body.conversationId || !body.content?.trim()) {
    return NextResponse.json({ error: 'conversationId and content are required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load the conversation (RLS ensures it belongs to the user's tenant)
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, tenant_id, channel_type, channel_identifier, customer_id')
    .eq('id', body.conversationId)
    .single()

  if (convErr || !conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  // Load tenant channel credentials
  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('credentials, is_active')
    .eq('tenant_id', conv.tenant_id)
    .eq('channel_type', conv.channel_type)
    .single()

  if (!channel?.is_active || !channel.credentials) {
    return NextResponse.json({ error: 'Channel not connected' }, { status: 422 })
  }

  const to = conv.channel_identifier
  const text = body.content

  if (conv.channel_type === 'whatsapp') {
    const creds = channel.credentials as { api_key: string }
    await sendWhatsAppMessage(creds.api_key, to, text)
  } else if (conv.channel_type === 'telegram') {
    const creds = channel.credentials as { bot_token: string }
    await sendTelegramMessage(creds.bot_token, to, text)
  } else if (conv.channel_type === 'email') {
    const creds = channel.credentials as GoogleCredentials | MicrosoftCredentials
    if (creds.provider === 'google') {
      await sendGmailMessage(creds as GoogleCredentials, to, 'Re: your message', text)
    } else {
      await sendMicrosoftMessage(creds as MicrosoftCredentials, to, 'Re: your message', text)
    }
  }

  // Record the outbound message
  const { data: message } = await supabase
    .from('messages')
    .insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      direction: 'outbound',
      content: text,
      status: 'sent',
    })
    .select('id')
    .single()

  // Update conversation snippet
  await supabase
    .from('conversations')
    .update({
      status: 'in_progress',
      last_message_at: new Date().toISOString(),
      last_message_snippet: `You: ${text.slice(0, 97)}`,
    })
    .eq('id', conv.id)

  return NextResponse.json({ messageId: message?.id })
}
