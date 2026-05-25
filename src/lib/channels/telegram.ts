export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    business_connection_id?: string
    chat: { id: number; type: string }
    from?: { id: number; username?: string; first_name?: string }
    text?: string
    date: number
    photo?: { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }[]
  }
  business_connection?: {
    id: string
    user: { id: number; first_name: string; username?: string }
    user_chat_id: number
    date: number
    is_enabled: boolean
  }
}

export function extractTelegramMessage(update: TelegramUpdate): {
  externalId: string
  chatId: string
  displayHandle: string
  content: string
  sentAt: string
  businessConnectionId?: string
  photoFileId?: string
} | null {
  const msg = update.message
  if (!msg) return null
  if (!msg.text && !msg.photo) return null
  const username = msg.from?.username
  const firstName = msg.from?.first_name ?? 'Unknown'
  const largestPhoto = msg.photo ? msg.photo[msg.photo.length - 1] : undefined
  return {
    externalId: `tg-${msg.message_id}`,
    chatId: String(msg.chat.id),
    displayHandle: username ? `@${username}` : firstName,
    content: msg.text ?? '',
    sentAt: new Date(msg.date * 1000).toISOString(),
    businessConnectionId: msg.business_connection_id,
    photoFileId: largestPhoto?.file_id,
  }
}

export async function getTelegramFileBuffer(
  botToken: string,
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
  const json = await res.json() as { ok: boolean; result?: { file_path: string } }
  if (!json.ok || !json.result) throw new Error('getFile failed')

  const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${json.result.file_path}`)
  if (!fileRes.ok) throw new Error(`Telegram file download failed: ${fileRes.status}`)

  const buffer = Buffer.from(await fileRes.arrayBuffer())
  const ext = json.result.file_path.split('.').pop()?.toLowerCase() ?? 'jpg'
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  return { buffer, mimeType }
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  businessConnectionId?: string,
): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: parseInt(chatId),
      text,
      ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status}`)
}

export async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  photo: Blob,
  businessConnectionId?: string,
): Promise<void> {
  const form = new FormData()
  form.append('chat_id', chatId)
  form.append('photo', photo, 'photo.jpg')
  if (businessConnectionId) form.append('business_connection_id', businessConnectionId)

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(`Telegram sendPhoto failed: ${res.status}`)
}

export async function sendTelegramDocument(
  botToken: string,
  chatId: string,
  document: Blob,
  filename: string,
  businessConnectionId?: string,
): Promise<void> {
  const form = new FormData()
  form.append('chat_id', chatId)
  form.append('document', document, filename)
  if (businessConnectionId) form.append('business_connection_id', businessConnectionId)

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(`Telegram sendDocument failed: ${res.status}`)
}

export async function registerTelegramWebhook(botToken: string, webhookUrl: string): Promise<void> {
  // Telegram excludes the business_* update types from the default webhook
  // payload set — they MUST be listed in allowed_updates for the bot to
  // receive connection events or business messages. Without this, even a
  // bot with Business Mode enabled in BotFather will silently get no
  // inbound traffic from the linked Telegram Business account.
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: [
        'message',
        'edited_message',
        'callback_query',
        'business_connection',
        'business_message',
        'edited_business_message',
        'deleted_business_messages',
      ],
    }),
  })
  const json = await res.json() as { ok: boolean; description?: string }
  if (!json.ok) throw new Error(`setWebhook failed: ${json.description}`)
}
