import { createHmac, timingSafeEqual } from 'crypto'

export interface WhatsAppMessage {
  id: string
  from: string
  timestamp: string
  text?: { body: string }
  type: string
}

export interface WhatsAppContact {
  profile: { name: string }
  wa_id: string
}

export interface WhatsAppWebhookPayload {
  object: string
  entry: Array<{
    changes: Array<{
      value: {
        messages?: WhatsAppMessage[]
        contacts?: WhatsAppContact[]
      }
    }>
  }>
}

export function verifyWhatsAppSignature(body: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export function extractMessages(payload: WhatsAppWebhookPayload): Array<{
  externalId: string
  from: string
  displayName: string
  content: string
  sentAt: string
}> {
  const results = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages ?? []
      const contacts = change.value?.contacts ?? []
      for (const msg of messages) {
        if (msg.type !== 'text' || !msg.text?.body) continue
        const contact = contacts.find((c) => c.wa_id === msg.from)
        results.push({
          externalId: msg.id,
          from: msg.from,
          displayName: contact?.profile?.name ?? `+${msg.from}`,
          content: msg.text.body,
          sentAt: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
        })
      }
    }
  }
  return results
}

export async function sendWhatsAppMessage(apiKey: string, to: string, text: string): Promise<void> {
  const res = await fetch('https://waba.360dialog.io/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'D360-API-KEY': apiKey },
    body: JSON.stringify({ recipient_type: 'individual', to, type: 'text', text: { body: text } }),
  })
  if (!res.ok) throw new Error(`360dialog send failed: ${res.status} ${await res.text()}`)
}
