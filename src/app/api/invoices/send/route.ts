import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { sendWhatsAppMedia } from '@/lib/channels/whatsapp'
import { sendTelegramDocument } from '@/lib/channels/telegram'

export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId, invoicePath, invoiceName } =
    await request.json() as { conversationId?: string; invoicePath?: string; invoiceName?: string }

  if (!conversationId || !invoicePath || !invoiceName) {
    return NextResponse.json({ error: 'conversationId, invoicePath, invoiceName required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, tenant_id, channel_type, channel_identifier')
    .eq('id', conversationId)
    .single()
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('credentials, is_active')
    .eq('tenant_id', conv.tenant_id)
    .eq('channel_type', conv.channel_type)
    .single()
  if (!channel?.is_active || !channel.credentials) return NextResponse.json({ error: 'Channel not connected' }, { status: 422 })

  const to = conv.channel_identifier

  try {
    if (conv.channel_type === 'whatsapp') {
      const { data: signed, error: signedErr } = await supabase.storage.from('invoices').createSignedUrl(invoicePath, 300)
      if (signedErr || !signed) return NextResponse.json({ error: 'Could not sign PDF URL' }, { status: 500 })
      await sendWhatsAppMedia(signed.signedUrl, to)
    } else if (conv.channel_type === 'telegram') {
      const creds = channel.credentials as { bot_token: string; business_connection_id?: string }
      const { data: blob, error: dlErr } = await supabase.storage.from('invoices').download(invoicePath)
      if (dlErr || !blob) return NextResponse.json({ error: 'Could not download invoice PDF' }, { status: 500 })
      await sendTelegramDocument(creds.bot_token, to, blob, invoiceName, creds.business_connection_id)
    } else {
      return NextResponse.json({ error: `Invoice sending not yet supported for ${conv.channel_type}` }, { status: 422 })
    }
  } catch {
    return NextResponse.json({ error: 'Failed to send invoice' }, { status: 500 })
  }

  const { data: message } = await supabase
    .from('messages')
    .insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      direction: 'outbound',
      content: `[Invoice: ${invoiceName}]`,
      status: 'sent',
      metadata: { kind: 'invoice', invoicePath, invoiceName },
    })
    .select('id')
    .single()

  await supabase
    .from('conversations')
    .update({
      status: 'in_progress',
      last_message_at: new Date().toISOString(),
      last_message_snippet: `You: [Invoice: ${invoiceName}]`,
    })
    .eq('id', conv.id)

  return NextResponse.json({ messageId: message?.id })
}
