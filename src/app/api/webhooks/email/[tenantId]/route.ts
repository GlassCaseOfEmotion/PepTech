import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processInboundMessage } from '@/lib/webhooks/processor'
import { fetchGmailMessage, fetchMicrosoftMessage } from '@/lib/channels/email'
import type { GoogleCredentials, MicrosoftCredentials } from '@/lib/channels/email'

interface RouteContext { params: Promise<{ tenantId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const { tenantId } = await params
  const body = await request.json() as Record<string, unknown>

  const supabase = createServiceClient()
  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('credentials, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'email')
    .single()

  if (!channel?.credentials) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const creds = channel.credentials as GoogleCredentials | MicrosoftCredentials

  let emailMessage = null

  if (creds.provider === 'google') {
    const pubsubMsg = body.message as { data?: string } | undefined
    if (!pubsubMsg?.data) return NextResponse.json({ ok: true })

    const decoded = JSON.parse(Buffer.from(pubsubMsg.data, 'base64').toString()) as { historyId?: string }
    if (!decoded.historyId) return NextResponse.json({ ok: true })

    emailMessage = await fetchGmailMessage(creds as GoogleCredentials, decoded.historyId)
  } else if (creds.provider === 'microsoft') {
    const notifications = (body.value as Array<{ resourceData?: { id?: string } }>) ?? []
    const msgId = notifications[0]?.resourceData?.id
    if (!msgId) return NextResponse.json({ ok: true })

    emailMessage = await fetchMicrosoftMessage(creds as MicrosoftCredentials, msgId)
  }

  if (!emailMessage) return NextResponse.json({ ok: true })

  await processInboundMessage(supabase, {
    tenantId,
    channelType: 'email',
    identifier: emailMessage.from,
    displayHandle: emailMessage.displayHandle,
    content: emailMessage.content,
    externalId: emailMessage.externalId,
    sentAt: emailMessage.sentAt,
  })

  return NextResponse.json({ ok: true })
}
