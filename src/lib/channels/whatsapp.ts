import { createHmac, timingSafeEqual } from 'crypto'

export class TwilioWindowError extends Error {
  readonly code = 63016
  constructor() { super('WhatsApp 24-hour messaging window has expired') }
}

export function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string,
): boolean {
  const sortedKeys = Object.keys(params).sort()
  const str = url + sortedKeys.map(k => k + params[k]).join('')
  const expected = createHmac('sha1', authToken).update(str).digest('base64')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export function extractTwilioMessage(params: Record<string, string>): {
  externalId: string
  from: string
  displayName: string
  content: string
  sentAt: string
  mediaUrl?: string
  mimeType?: string
} | null {
  const { MessageSid, From, Body, ProfileName, DateSent, NumMedia, MediaUrl0, MediaContentType0 } = params
  if (!MessageSid || !From) return null
  const hasMedia = NumMedia !== undefined && parseInt(NumMedia) > 0
  if (!Body && !hasMedia) return null
  const from = From.replace(/^whatsapp:/, '')
  return {
    externalId: MessageSid,
    from,
    displayName: ProfileName ?? from,
    content: Body ?? '',
    sentAt: DateSent ? new Date(DateSent).toISOString() : new Date().toISOString(),
    mediaUrl: hasMedia ? MediaUrl0 : undefined,
    mimeType: hasMedia ? MediaContentType0 : undefined,
  }
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (!to || !text) throw new Error('to and text are required')
  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const from = process.env.TWILIO_WHATSAPP_NUMBER!

  const body = new URLSearchParams({
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    Body: text,
  })

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      },
      body: body.toString(),
    },
  )
  if (!res.ok) {
    const errText = await res.text()
    try {
      const errJson = JSON.parse(errText) as { code?: number }
      if (errJson.code === 63016) throw new TwilioWindowError()
    } catch (e) { if (e instanceof TwilioWindowError) throw e }
    throw new Error(`Twilio send failed: ${res.status} ${errText}`)
  }
}

export async function sendWhatsAppMedia(mediaUrl: string, to: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const from = process.env.TWILIO_WHATSAPP_NUMBER!

  const body = new URLSearchParams({
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    MediaUrl: mediaUrl,
  })

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      },
      body: body.toString(),
    },
  )
  if (!res.ok) {
    const errText = await res.text()
    try {
      const errJson = JSON.parse(errText) as { code?: number }
      if (errJson.code === 63016) throw new TwilioWindowError()
    } catch (e) { if (e instanceof TwilioWindowError) throw e }
    throw new Error(`Twilio media send failed: ${res.status} ${errText}`)
  }
}

export async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,
  variables: Record<string, string>,
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const from = process.env.TWILIO_WHATSAPP_NUMBER!
  const body = new URLSearchParams({
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(variables),
  })
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      },
      body: body.toString(),
    },
  )
  if (!res.ok) throw new Error(`Twilio template send failed: ${res.status} ${await res.text()}`)
}
