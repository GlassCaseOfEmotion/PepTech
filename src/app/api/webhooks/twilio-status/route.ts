import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyTwilioSignature } from '@/lib/channels/whatsapp'

// Twilio status values that map to our 'failed' status
const FAILED_STATUSES = new Set(['failed', 'undelivered'])
// Statuses we care about updating — ignore intermediate ones like 'queued', 'sending'
const TERMINAL_STATUSES = new Set(['sent', 'delivered', 'failed', 'undelivered', 'read'])

const STATUS_MAP: Record<string, 'sent' | 'delivered' | 'read' | 'failed'> = {
  sent:        'sent',
  delivered:   'delivered',
  read:        'read',
  failed:      'failed',
  undelivered: 'failed',
}

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? ''
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const webhookUrl = `${appUrl}/api/webhooks/twilio-status`

  const text = await request.text()
  const params = Object.fromEntries(new URLSearchParams(text))
  const signature = request.headers.get('x-twilio-signature') ?? ''

  if (!verifyTwilioSignature(authToken, webhookUrl, params, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const { MessageSid, MessageStatus, ErrorCode } = params

  if (!MessageSid || !MessageStatus) return NextResponse.json({ ok: true })
  if (!TERMINAL_STATUSES.has(MessageStatus)) return NextResponse.json({ ok: true })

  const newStatus = STATUS_MAP[MessageStatus]
  if (!newStatus) return NextResponse.json({ ok: true })

  const supabase = createServiceClient()

  const patch: { status: string; metadata?: Record<string, unknown> } = { status: newStatus }
  if (FAILED_STATUSES.has(MessageStatus) && ErrorCode) {
    // Preserve existing metadata and add the delivery error code
    const { data: existing } = await supabase
      .from('messages').select('metadata').eq('external_id', MessageSid).single()
    patch.metadata = { ...(existing?.metadata as Record<string, unknown> ?? {}), delivery_error_code: Number(ErrorCode) }
  }

  await supabase
    .from('messages')
    .update(patch as never)
    .eq('external_id', MessageSid)

  return NextResponse.json({ ok: true })
}
