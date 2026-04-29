import { createHmac, timingSafeEqual } from 'crypto'

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
} | null {
  const { MessageSid, From, Body, ProfileName, DateSent } = params
  if (!MessageSid || !From || !Body) return null
  const from = From.replace(/^whatsapp:/, '')
  return {
    externalId: MessageSid,
    from,
    displayName: ProfileName ?? from,
    content: Body,
    sentAt: DateSent ? new Date(DateSent).toISOString() : new Date().toISOString(),
  }
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (!to?.trim() || !text?.trim()) throw new Error('sendWhatsAppMessage: to and text are required')
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
  if (!res.ok) throw new Error(`Twilio send failed: ${res.status} ${await res.text()}`)
}
