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

function twilioAuth(accountSid: string, authToken: string) {
  return 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
}

function handleTwilioError(status: number, errText: string, label: string): never {
  let code: number | undefined
  try { code = (JSON.parse(errText) as { code?: number }).code } catch { /* ignore */ }
  if (code === 63016) throw new TwilioWindowError()
  throw new Error(`Twilio ${label} failed: ${status} ${errText}`)
}

export async function sendWhatsAppMessage(to: string, text: string, statusCallbackUrl?: string): Promise<string> {
  if (!to || !text) throw new Error('to and text are required')
  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const from = process.env.TWILIO_WHATSAPP_NUMBER!

  const params: Record<string, string> = {
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    Body: text,
  }
  if (statusCallbackUrl) params.StatusCallback = statusCallbackUrl

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: twilioAuth(accountSid, authToken) },
      body: new URLSearchParams(params).toString() },
  )
  if (!res.ok) {
    const errText = await res.text()
    handleTwilioError(res.status, errText, 'send')
  }
  const json = await res.json() as { sid: string }
  return json.sid
}

export async function sendWhatsAppMedia(mediaUrl: string, to: string, statusCallbackUrl?: string): Promise<string> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const from = process.env.TWILIO_WHATSAPP_NUMBER!

  const params: Record<string, string> = {
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    MediaUrl: mediaUrl,
  }
  if (statusCallbackUrl) params.StatusCallback = statusCallbackUrl

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: twilioAuth(accountSid, authToken) },
      body: new URLSearchParams(params).toString() },
  )
  if (!res.ok) {
    const errText = await res.text()
    handleTwilioError(res.status, errText, 'media send')
  }
  const json = await res.json() as { sid: string }
  return json.sid
}

export async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,
  variables: Record<string, string>,
  statusCallbackUrl?: string,
): Promise<string> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken  = process.env.TWILIO_AUTH_TOKEN!
  const from       = process.env.TWILIO_WHATSAPP_NUMBER!
  const params: Record<string, string> = {
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    To:   to.startsWith('whatsapp:')   ? to   : `whatsapp:${to}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(variables),
  }
  if (statusCallbackUrl) params.StatusCallback = statusCallbackUrl
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: twilioAuth(accountSid, authToken) },
      body: new URLSearchParams(params).toString() },
  )
  if (!res.ok) {
    const errText = await res.text()
    handleTwilioError(res.status, errText, 'template send')
  }
  const json = await res.json() as { sid: string }
  return json.sid
}
