import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processInboundMessage } from '@/lib/webhooks/processor'
import { extractTelegramMessage, getTelegramFileBuffer } from '@/lib/channels/telegram'
import type { TelegramUpdate } from '@/lib/channels/telegram'
import { uploadToStorage } from '@/lib/media/storage'

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

  if (update.business_connection) {
    if (update.business_connection.is_enabled && !creds.business_connection_id) {
      await supabase
        .from('tenant_channels')
        .update({ credentials: { ...creds, business_connection_id: update.business_connection.id } })
        .eq('tenant_id', tenantId)
        .eq('channel_type', 'telegram')
    } else if (!update.business_connection.is_enabled && creds.business_connection_id) {
      const { business_connection_id: _, ...rest } = creds
      await supabase
        .from('tenant_channels')
        .update({ credentials: rest as never })
        .eq('tenant_id', tenantId)
        .eq('channel_type', 'telegram')
    }
    return NextResponse.json({ ok: true })
  }

  const extracted = extractTelegramMessage(update)
  if (!extracted) return NextResponse.json({ ok: true })

  if (extracted.businessConnectionId && !creds.business_connection_id) {
    await supabase
      .from('tenant_channels')
      .update({ credentials: { ...creds, business_connection_id: extracted.businessConnectionId } })
      .eq('tenant_id', tenantId)
      .eq('channel_type', 'telegram')
  }

  let metadata: Record<string, unknown> | undefined

  if (extracted.photoFileId) {
    const botToken = (creds.bot_token as string) ?? ''
    const { buffer, mimeType } = await getTelegramFileBuffer(botToken, extracted.photoFileId)
    const ext = mimeType.split('/')[1] ?? 'jpg'
    const storagePath = `${tenantId}/${extracted.externalId}.${ext}`
    await uploadToStorage(supabase, buffer, storagePath, mimeType)
    metadata = { kind: 'photo', storagePath }
  }

  await processInboundMessage(supabase, {
    tenantId,
    channelType: 'telegram',
    identifier: extracted.chatId,
    displayHandle: extracted.displayHandle,
    content: metadata ? '[Photo]' : extracted.content,
    externalId: extracted.externalId,
    sentAt: extracted.sentAt,
    metadata,
  })

  return NextResponse.json({ ok: true })
}
