import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processInboundMessage } from '@/lib/webhooks/processor'
import { verifyTwilioSignature, extractTwilioMessage } from '@/lib/channels/whatsapp'
import { uploadToStorage } from '@/lib/media/storage'

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

  let metadata: Record<string, unknown> | undefined

  if (msg.mediaUrl && msg.mimeType) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID ?? ''
    const token = process.env.TWILIO_AUTH_TOKEN ?? ''
    const mediaRes = await fetch(msg.mediaUrl, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${accountSid}:${token}`).toString('base64') },
    })
    if (mediaRes.ok) {
      const buffer = Buffer.from(await mediaRes.arrayBuffer())
      const rawExt = msg.mimeType.split('/')[1] ?? 'jpg'
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt
      const storagePath = `${tenantId}/${msg.externalId}.${ext}`
      await uploadToStorage(supabase, buffer, storagePath, msg.mimeType)
      metadata = { kind: 'photo', storagePath }
    } else {
      metadata = { kind: 'photo', error: 'download_failed' }
    }
  }

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
    content: metadata?.kind === 'photo' ? '[Photo]' : msg.content,
    externalId: msg.externalId,
    sentAt: msg.sentAt,
    metadata,
  })

  return NextResponse.json({ ok: true })
}
