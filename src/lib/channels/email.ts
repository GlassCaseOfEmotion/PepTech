import { google } from 'googleapis'

export interface EmailMessage {
  externalId: string
  from: string
  displayHandle: string
  content: string
  sentAt: string
}

export interface GoogleCredentials {
  provider: 'google'
  email_address: string
  refresh_token: string
  access_token: string
  expires_at: string
}

export interface MicrosoftCredentials {
  provider: 'microsoft'
  email_address: string
  refresh_token: string
  access_token: string
  expires_at: string
}

export async function fetchGmailMessage(
  credentials: GoogleCredentials,
  historyId: string,
): Promise<EmailMessage | null> {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({
    refresh_token: credentials.refresh_token,
    access_token: credentials.access_token,
  })

  const gmail = google.gmail({ version: 'v1', auth })

  let historyRes
  try {
    historyRes = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: historyId,
      historyTypes: ['messageAdded'],
    })
  } catch {
    return null
  }

  const added = historyRes.data.history?.flatMap((h) => h.messagesAdded ?? []) ?? []
  if (added.length === 0) return null

  const msgId = added[0].message?.id
  if (!msgId) return null

  const msgRes = await gmail.users.messages.get({
    userId: 'me',
    id: msgId,
    format: 'full',
  })

  const headers = msgRes.data.payload?.headers ?? []
  const fromHeader = headers.find((h) => h.name?.toLowerCase() === 'from')?.value ?? ''
  const dateHeader = headers.find((h) => h.name?.toLowerCase() === 'date')?.value

  const parts = msgRes.data.payload?.parts ?? []
  const textPart = parts.find((p) => p.mimeType === 'text/plain')
  const bodyData = textPart?.body?.data ?? msgRes.data.payload?.body?.data ?? ''
  const content = Buffer.from(bodyData, 'base64').toString('utf-8').trim()

  const emailMatch = fromHeader.match(/<(.+?)>/)
  const fromEmail = emailMatch ? emailMatch[1] : fromHeader

  return {
    externalId: `gmail-${msgId}`,
    from: fromEmail,
    displayHandle: fromEmail,
    content: content || '(no text content)',
    sentAt: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
  }
}

export async function fetchMicrosoftMessage(
  credentials: MicrosoftCredentials,
  messageId: string,
): Promise<EmailMessage | null> {
  const expiresAt = new Date(credentials.expires_at).getTime()
  let accessToken = credentials.access_token

  if (Date.now() > expiresAt - 60000) {
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh_token,
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      }),
    })
    const tokenData = await tokenRes.json() as { access_token?: string }
    if (!tokenData.access_token) return null
    accessToken = tokenData.access_token
  }

  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null

  const msg = await res.json() as {
    id: string
    from: { emailAddress: { address: string; name?: string } }
    bodyPreview: string
    receivedDateTime: string
  }

  return {
    externalId: `ms-${msg.id}`,
    from: msg.from.emailAddress.address,
    displayHandle: msg.from.emailAddress.address,
    content: msg.bodyPreview,
    sentAt: msg.receivedDateTime,
  }
}

export async function sendGmailMessage(
  credentials: GoogleCredentials,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: credentials.refresh_token, access_token: credentials.access_token })
  const gmail = google.gmail({ version: 'v1', auth })

  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  ).toString('base64url')

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}

export async function sendMicrosoftMessage(
  credentials: MicrosoftCredentials,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${credentials.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    }),
  })
  if (!res.ok) throw new Error(`Microsoft sendMail failed: ${res.status}`)
}
