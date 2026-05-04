import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processInboundMessage } from '@/lib/webhooks/processor'
import { extractTelegramMessage } from '@/lib/channels/telegram'
import type { TelegramUpdate } from '@/lib/channels/telegram'

interface RouteContext { params: Promise<{ tenantId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const { tenantId } = await params

  const supabase = createServiceClient()
  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('credentials, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'telegram')
    .single()

  if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const update = await request.json() as TelegramUpdate
  const creds = (channel.credentials ?? {}) as Record<string, unknown>

  // business_connection event fires when the tenant links/unlinks their bot in Telegram Business settings
  if (update.business_connection) {
    if (update.business_connection.is_enabled && !creds.business_connection_id) {
      await supabase
        .from('tenant_channels')
        .update({ credentials: { ...creds, business_connection_id: update.business_connection.id } })
        .eq('tenant_id', tenantId)
        .eq('channel_type', 'telegram')
    }
    return NextResponse.json({ ok: true })
  }

  const extracted = extractTelegramMessage(update)
  if (!extracted) return NextResponse.json({ ok: true })

  // Auto-capture business_connection_id from first business message if not yet stored
  if (extracted.businessConnectionId && !creds.business_connection_id) {
    await supabase
      .from('tenant_channels')
      .update({ credentials: { ...creds, business_connection_id: extracted.businessConnectionId } })
      .eq('tenant_id', tenantId)
      .eq('channel_type', 'telegram')
  }

  await processInboundMessage(supabase, {
    tenantId,
    channelType: 'telegram',
    identifier: extracted.chatId,
    displayHandle: extracted.displayHandle,
    content: extracted.content,
    externalId: extracted.externalId,
    sentAt: extracted.sentAt,
  })

  return NextResponse.json({ ok: true })
}
