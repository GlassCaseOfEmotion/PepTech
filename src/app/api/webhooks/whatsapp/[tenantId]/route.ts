import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processInboundMessage } from '@/lib/webhooks/processor'
import { verifyWhatsAppSignature, extractMessages } from '@/lib/channels/whatsapp'
import type { WhatsAppWebhookPayload } from '@/lib/channels/whatsapp'

interface RouteContext { params: Promise<{ tenantId: string }> }

// GET — hub challenge verification (360dialog registers webhook via GET)
export async function GET(request: Request, { params }: RouteContext) {
  const { tenantId } = await params
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const challenge = url.searchParams.get('hub.challenge')
  const verifyToken = url.searchParams.get('hub.verify_token')

  const supabase = createServiceClient()
  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('webhook_secret')
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'whatsapp')
    .single()

  if (mode === 'subscribe' && verifyToken === channel?.webhook_secret) {
    return new Response(challenge ?? '', { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// POST — inbound message from 360dialog
export async function POST(request: Request, { params }: RouteContext) {
  const { tenantId } = await params
  const body = await request.text()
  const signature = request.headers.get('x-hub-signature-256') ?? ''

  const supabase = createServiceClient()
  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('webhook_secret, credentials, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'whatsapp')
    .single()

  if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!channel.webhook_secret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 })
  }
  if (!verifyWhatsAppSignature(body, signature, channel.webhook_secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(body) as WhatsAppWebhookPayload
  const messages = extractMessages(payload)

  await Promise.all(
    messages.map((msg) =>
      processInboundMessage(supabase, {
        tenantId,
        channelType: 'whatsapp',
        identifier: msg.from,
        displayHandle: msg.displayName,
        content: msg.content,
        externalId: msg.externalId,
        sentAt: msg.sentAt,
      }),
    ),
  )

  return NextResponse.json({ ok: true })
}
