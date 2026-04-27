export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string }
    from?: { id: number; username?: string; first_name?: string }
    text?: string
    date: number
  }
}

export function extractTelegramMessage(update: TelegramUpdate): {
  externalId: string
  chatId: string
  displayHandle: string
  content: string
  sentAt: string
} | null {
  const msg = update.message
  if (!msg?.text) return null
  const username = msg.from?.username
  const firstName = msg.from?.first_name ?? 'Unknown'
  return {
    externalId: `tg-${msg.message_id}`,
    chatId: String(msg.chat.id),
    displayHandle: username ? `@${username}` : firstName,
    content: msg.text,
    sentAt: new Date(msg.date * 1000).toISOString(),
  }
}

export async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: parseInt(chatId), text }),
  })
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status}`)
}

export async function registerTelegramWebhook(botToken: string, webhookUrl: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  })
  const json = await res.json() as { ok: boolean; description?: string }
  if (!json.ok) throw new Error(`setWebhook failed: ${json.description}`)
}
