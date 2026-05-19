import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage, sendWhatsAppMedia, sendWhatsAppTemplate, TwilioWindowError } from '@/lib/channels/whatsapp'
import { sendTelegramMessage, sendTelegramPhoto } from '@/lib/channels/telegram'
import { sendGmailMessage, sendMicrosoftMessage } from '@/lib/channels/email'
import type { GoogleCredentials, MicrosoftCredentials } from '@/lib/channels/email'
import { generateSignedUrl, generateSignedUrlFromBucket } from '@/lib/media/storage'

export async function POST(request: Request) {
  const body = await request.json() as {
    conversationId?: string; content?: string; storagePath?: string
    bucket?: 'media' | 'coa' | 'product-media'
    templateId?: string; templateVariables?: Record<string, string>
  }

  if (!body.conversationId || (!body.content?.trim() && !body.storagePath && !body.templateId)) {
    return NextResponse.json({ error: 'conversationId and content or storagePath are required' }, { status: 400 })
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

  // For WhatsApp, credentials holds {phone_number} and Twilio creds come from env vars.
  // The guard here validates channel existence and activation, not credential use.
  if (!channel?.is_active || !channel.credentials) {
    return NextResponse.json({ error: 'Channel not connected' }, { status: 422 })
  }

  const to = conv.channel_identifier
  const text = body.content ?? ''
  const { storagePath } = body
  const SEND_ALLOWED_BUCKETS = new Set(['media', 'coa', 'product-media', 'invoices'])
  const bucket = body.bucket ?? 'media'
  if (!SEND_ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 })
  }
  let effectiveContent = text
  let twilioSid: string | undefined

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const statusCallbackUrl = appUrl ? `${appUrl}/api/webhooks/twilio-status` : undefined

  if (conv.channel_type === 'whatsapp') {
    try {
      if (body.templateId) {
        const { data: tmpl } = await supabase
          .from('whatsapp_templates').select('content_sid, body')
          .eq('id', body.templateId)
          .eq('status', 'approved')
          .single()
        if (!tmpl?.content_sid) return NextResponse.json({ error: 'Template not approved' }, { status: 422 })
        effectiveContent = tmpl.body ?? text
        twilioSid = await sendWhatsAppTemplate(to, tmpl.content_sid, body.templateVariables ?? {}, statusCallbackUrl)
      } else if (storagePath) {
        const mediaUrl = bucket === 'media'
          ? await generateSignedUrl(supabase, storagePath)
          : await generateSignedUrlFromBucket(supabase, bucket, storagePath)
        twilioSid = await sendWhatsAppMedia(mediaUrl, to, statusCallbackUrl)
      } else {
        twilioSid = await sendWhatsAppMessage(to, text, statusCallbackUrl)
      }
    } catch (err) {
      if (err instanceof TwilioWindowError) {
        const { data: failedMsg } = await supabase.from('messages').insert({
          tenant_id: conv.tenant_id, conversation_id: conv.id,
          direction: 'outbound', content: effectiveContent, status: 'failed',
          metadata: { error_code: 63016, ...(body.templateId ? { templateId: body.templateId } : {}) },
        }).select('id').single()
        return NextResponse.json({ error: 'window_expired', messageId: failedMsg?.id }, { status: 422 })
      }
      throw err
    }
  } else if (conv.channel_type === 'telegram') {
    const creds = channel.credentials as { bot_token: string; business_connection_id?: string }
    if (storagePath) {
      try {
        const { data: blob } = await supabase.storage.from(bucket).download(storagePath)
        if (!blob) throw new Error('Failed to download media from storage')
        await sendTelegramPhoto(creds.bot_token, to, blob, creds.business_connection_id)
      } catch {
        await supabase.from('messages').insert({
          tenant_id: conv.tenant_id,
          conversation_id: conv.id,
          direction: 'outbound' as const,
          content: '[Photo — send failed]',
          status: 'failed',
          metadata: { kind: 'photo', storagePath },
        })
        return NextResponse.json({ error: 'Failed to send photo' }, { status: 500 })
      }
    } else {
      await sendTelegramMessage(creds.bot_token, to, text, creds.business_connection_id)
    }
  } else if (conv.channel_type === 'email') {
    const creds = channel.credentials as unknown as GoogleCredentials | MicrosoftCredentials
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
      content: storagePath ? '[Photo]' : effectiveContent,
      status: 'sent',
      external_id: twilioSid ?? null,
      metadata: storagePath ? { kind: 'photo', storagePath, bucket } : null,
    })
    .select('id')
    .single()

  // Update conversation snippet
  await supabase
    .from('conversations')
    .update({
      status: 'in_progress',
      last_message_at: new Date().toISOString(),
      last_message_snippet: storagePath ? 'You: [Photo]' : `You: ${effectiveContent.slice(0, 97)}`,
    })
    .eq('id', conv.id)

  return NextResponse.json({ messageId: message?.id })
}
