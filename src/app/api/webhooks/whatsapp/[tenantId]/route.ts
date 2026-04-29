import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processInboundMessage } from '@/lib/webhooks/processor'
import { verifyTwilioSignature, extractTwilioMessage } from '@/lib/channels/whatsapp'

interface RouteContext { params: Promise<{ tenantId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const { tenantId } = await params
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const webhookUrl = `${appUrl}/api/webhooks/whatsapp/${tenantId}`

  const text = await request.text()
  const formParams = Object.fromEntries(new URLSearchParams(text))
  const signature = request.headers.get('x-twilio-signature') ?? ''

  if (!verifyTwilioSignature(authToken, webhookUrl, formParams, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const msg = extractTwilioMessage(formParams)
  if (!msg) return NextResponse.json({ ok: true })

  const supabase = createServiceClient()
  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('tenant_id')
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'whatsapp')
    .eq('is_active', true)
    .single()

  if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await processInboundMessage(supabase, {
    tenantId,
    channelType: 'whatsapp',
    identifier: msg.from,
    displayHandle: msg.displayName,
    content: msg.content,
    externalId: msg.externalId,
    sentAt: msg.sentAt,
  })

  return NextResponse.json({ ok: true })
}
