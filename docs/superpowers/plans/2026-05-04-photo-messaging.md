# Photo Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inbound and outbound photo support across WhatsApp and Telegram, with photos stored in a private Supabase Storage bucket and served via short-lived signed URLs.

**Architecture:** Photos are stored in a private `media` Supabase Storage bucket under `{tenantId}/{uuid}.{ext}`. Inbound webhooks download photos from Twilio/Telegram and upload to Storage before calling `processInboundMessage` with `metadata: { kind: 'photo', storagePath }`. Outbound uses a two-step flow: `POST /api/upload` stores the file and returns `storagePath`, then `POST /api/send` with `storagePath` sends the image via the channel's native photo API. `InboxProvider` generates 1-hour signed URLs for photo messages at fetch time and in the realtime handler.

**Tech Stack:** Next.js 15 App Router, Supabase Storage, Twilio (WhatsApp), Telegram Bot API, Vitest

---

## File Structure

```
supabase/migrations/
  20260504000001_media_bucket.sql         NEW — private media bucket + storage policy

src/lib/media/
  storage.ts                              NEW — uploadToStorage(), generateSignedUrl()
  __tests__/storage.test.ts              NEW — unit tests

src/lib/channels/
  whatsapp.ts                             MODIFY — extractTwilioMessage detects NumMedia; add sendWhatsAppMedia()
  telegram.ts                             MODIFY — extractTelegramMessage detects photo; add getTelegramFileBuffer(), sendTelegramPhoto()
  __tests__/whatsapp.test.ts             MODIFY — add photo extraction + sendWhatsAppMedia tests
  __tests__/telegram.test.ts             MODIFY — add photo extraction + sendTelegramPhoto tests

src/app/api/webhooks/whatsapp/[tenantId]/
  route.ts                                MODIFY — download Twilio media, upload to Storage, pass metadata to processor
  __tests__/route.test.ts                MODIFY — add photo webhook test

src/app/api/webhooks/telegram/[tenantId]/
  route.ts                                MODIFY — call getTelegramFileBuffer, upload to Storage, pass metadata
  __tests__/route.test.ts                MODIFY — add photo webhook test

src/app/api/upload/
  route.ts                                NEW — POST multipart: validate, store, return { storagePath }
  __tests__/route.test.ts                NEW — unit tests

src/app/api/send/
  route.ts                                MODIFY — accept storagePath; WhatsApp → signed URL + MediaUrl; Telegram → sendTelegramPhoto
  __tests__/route.test.ts                MODIFY — add photo send tests

src/types/inbox.ts                        MODIFY — add 'photo' kind; add storagePath/mediaUrl to MessageMetadata

src/components/inbox/
  InboxProvider.tsx                       MODIFY — generate signed URLs for photo messages in fetchMessages + realtime handler
  InboxView.tsx                           MODIFY — photo bubble + wire attach button
```

---

## Task 1: Media storage module + bucket migration

**Files:**
- Create: `supabase/migrations/20260504000001_media_bucket.sql`
- Create: `src/lib/media/storage.ts`
- Create: `src/lib/media/__tests__/storage.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/media/__tests__/storage.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { uploadToStorage, generateSignedUrl } from '../storage'

function makeSupabase(
  uploadResult = { error: null },
  signedUrlResult = { data: { signedUrl: 'https://sb.co/signed-url' }, error: null },
) {
  const bucket = {
    upload: vi.fn().mockResolvedValue(uploadResult),
    createSignedUrl: vi.fn().mockResolvedValue(signedUrlResult),
  }
  return { storage: { from: vi.fn().mockReturnValue(bucket) }, _bucket: bucket }
}

describe('uploadToStorage', () => {
  it('uploads buffer to the media bucket and returns the path', async () => {
    const { storage, _bucket } = makeSupabase()
    await uploadToStorage({ storage } as never, Buffer.from('imgdata'), 'tid/abc.jpg', 'image/jpeg')
    expect(storage.from).toHaveBeenCalledWith('media')
    expect(_bucket.upload).toHaveBeenCalledWith('tid/abc.jpg', expect.any(Buffer), {
      contentType: 'image/jpeg',
      upsert: false,
    })
  })

  it('returns the storage path', async () => {
    const { storage } = makeSupabase()
    const result = await uploadToStorage({ storage } as never, Buffer.from('x'), 'tid/abc.jpg', 'image/jpeg')
    expect(result).toBe('tid/abc.jpg')
  })

  it('throws when upload fails', async () => {
    const { storage } = makeSupabase({ error: { message: 'Quota exceeded' } })
    await expect(uploadToStorage({ storage } as never, Buffer.from('x'), 'p', 'image/jpeg'))
      .rejects.toThrow('Storage upload failed: Quota exceeded')
  })
})

describe('generateSignedUrl', () => {
  it('returns the signed URL for a storage path', async () => {
    const { storage } = makeSupabase()
    const url = await generateSignedUrl({ storage } as never, 'tid/abc.jpg')
    expect(url).toBe('https://sb.co/signed-url')
    expect(storage.from).toHaveBeenCalledWith('media')
  })

  it('uses the provided expiresIn value', async () => {
    const { storage, _bucket } = makeSupabase()
    await generateSignedUrl({ storage } as never, 'tid/abc.jpg', 7200)
    expect(_bucket.createSignedUrl).toHaveBeenCalledWith('tid/abc.jpg', 7200)
  })

  it('throws when signing fails', async () => {
    const { storage } = makeSupabase(
      { error: null },
      { data: null, error: { message: 'Object not found' } },
    )
    await expect(generateSignedUrl({ storage } as never, 'tid/abc.jpg'))
      .rejects.toThrow('Failed to generate signed URL: Object not found')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "c:\Users\alana\OneDrive\Documents\Pep Tech"
npm run test:run -- src/lib/media/__tests__/storage.test.ts
```

Expected: FAIL — `../storage` module does not exist.

- [ ] **Step 3: Create `src/lib/media/storage.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export async function uploadToStorage(
  supabase: SupabaseClient,
  buffer: Buffer,
  path: string,
  mimeType: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from('media')
    .upload(path, buffer, { contentType: mimeType, upsert: false })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  return path
}

export async function generateSignedUrl(
  supabase: SupabaseClient,
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('media')
    .createSignedUrl(path, expiresIn)
  if (error || !data) throw new Error(`Failed to generate signed URL: ${error?.message}`)
  return data.signedUrl
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- src/lib/media/__tests__/storage.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Apply the bucket migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `media_bucket` and SQL:

```sql
-- Create private media bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can manage objects within their own tenant folder
CREATE POLICY "tenant_media_access" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  )
  WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

-- Service role bypasses RLS — no extra policy needed for webhook uploads
```

- [ ] **Step 6: Create the local migration file**

Create `supabase/migrations/20260504000001_media_bucket.sql` with the same SQL from Step 5.

- [ ] **Step 7: Run full test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260504000001_media_bucket.sql src/lib/media/
git commit -m "feat: add private media storage bucket and storage module"
```

---

## Task 2: Update types

**Files:**
- Modify: `src/types/inbox.ts`

Add `'photo'` to the `kind` union and add photo fields to `MessageMetadata`. Also add `'photo'` to `InboxMessage.kind`.

- [ ] **Step 1: Update `src/types/inbox.ts`**

Find `MessageMetadata` and replace it:

```typescript
export type MessageMetadata = {
  kind?: 'wallet' | 'tx' | 'photo'
  // wallet
  asset?: string
  network?: string
  address?: string
  amount?: number
  // tx
  tx_id?: string
  confirmations?: number
  required_confirmations?: number
  state?: 'pending' | 'confirmed' | 'failed'
  // photo
  storagePath?: string
  mediaUrl?: string   // signed URL, populated client-side — not stored in DB
  mimeType?: string
}
```

Find `InboxMessage.kind` and replace:

```typescript
  kind?: 'text' | 'wallet' | 'tx' | 'photo'
```

- [ ] **Step 2: Run full test suite**

```bash
npm run test:run
```

Expected: all tests pass (type-only change, no logic change).

- [ ] **Step 3: Commit**

```bash
git add src/types/inbox.ts
git commit -m "feat: add photo kind and storage fields to inbox types"
```

---

## Task 3: WhatsApp channel adapter — photo support

**Files:**
- Modify: `src/lib/channels/whatsapp.ts`
- Modify: `src/lib/channels/__tests__/whatsapp.test.ts`

Two changes:
1. `extractTwilioMessage` — detect `NumMedia > 0` and return `mediaUrl` + `mimeType` (the Twilio CDN URL to download from, not the storage URL).
2. New export `sendWhatsAppMedia(mediaUrl, to)` — sends a photo outbound via Twilio's `MediaUrl` parameter.

- [ ] **Step 1: Add failing tests**

In `src/lib/channels/__tests__/whatsapp.test.ts`, add these two `describe` blocks after the existing ones:

```typescript
describe('extractTwilioMessage — photo', () => {
  it('returns mediaUrl and mimeType when NumMedia is 1', () => {
    const params = {
      MessageSid: 'MM001',
      From: 'whatsapp:+15005550001',
      To: 'whatsapp:+14155551234',
      Body: '',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/media/ME001',
      MediaContentType0: 'image/jpeg',
    }
    const msg = extractTwilioMessage(params)
    expect(msg).not.toBeNull()
    expect(msg!.mediaUrl).toBe('https://api.twilio.com/media/ME001')
    expect(msg!.mimeType).toBe('image/jpeg')
    expect(msg!.content).toBe('')
  })

  it('returns no mediaUrl when NumMedia is 0 or absent', () => {
    const params = {
      MessageSid: 'SM002',
      From: 'whatsapp:+15005550001',
      To: 'whatsapp:+14155551234',
      Body: 'Hello',
    }
    const msg = extractTwilioMessage(params)
    expect(msg!.mediaUrl).toBeUndefined()
    expect(msg!.mimeType).toBeUndefined()
  })

  it('returns null when MessageSid absent and no media', () => {
    expect(extractTwilioMessage({ Body: 'Hi', From: 'whatsapp:+1500', NumMedia: '0' })).toBeNull()
  })
})

describe('sendWhatsAppMedia', () => {
  const originalEnv = process.env
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TWILIO_ACCOUNT_SID: 'ACtest123',
      TWILIO_AUTH_TOKEN: 'authtoken123',
      TWILIO_WHATSAPP_NUMBER: '+14155551234',
    }
  })
  afterEach(() => { process.env = originalEnv; vi.restoreAllMocks() })

  it('POSTs to Twilio with MediaUrl and no Body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    await sendWhatsAppMedia('https://sb.co/signed', '+15005550001')
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest123/Messages.json')
    const body = new URLSearchParams(options.body)
    expect(body.get('MediaUrl')).toBe('https://sb.co/signed')
    expect(body.get('To')).toBe('whatsapp:+15005550001')
    expect(body.get('From')).toBe('whatsapp:+14155551234')
    expect(body.get('Body')).toBeNull()
  })

  it('throws when Twilio responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad Request' }))
    await expect(sendWhatsAppMedia('https://sb.co/signed', '+15005550001'))
      .rejects.toThrow('Twilio media send failed')
  })
})
```

Also add `import { ..., sendWhatsAppMedia } from '../whatsapp'` to the imports at the top.

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:run -- src/lib/channels/__tests__/whatsapp.test.ts
```

Expected: FAIL — `sendWhatsAppMedia` not exported, `extractTwilioMessage` doesn't return `mediaUrl`.

- [ ] **Step 3: Update `src/lib/channels/whatsapp.ts`**

Replace the entire file:

```typescript
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
  if (!res.ok) throw new Error(`Twilio send failed: ${res.status} ${await res.text()}`)
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
  if (!res.ok) throw new Error(`Twilio media send failed: ${res.status} ${await res.text()}`)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- src/lib/channels/__tests__/whatsapp.test.ts
```

Expected: all whatsapp tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/channels/whatsapp.ts src/lib/channels/__tests__/whatsapp.test.ts
git commit -m "feat: WhatsApp adapter detects inbound photos and adds sendWhatsAppMedia"
```

---

## Task 4: Telegram channel adapter — photo support

**Files:**
- Modify: `src/lib/channels/telegram.ts`
- Modify: `src/lib/channels/__tests__/telegram.test.ts`

Three changes:
1. Add `photo?` array to `TelegramUpdate.message` type.
2. `extractTelegramMessage` — return `photoFileId` (the `file_id` of the largest photo) when `message.photo` is present.
3. New exports: `getTelegramFileBuffer(botToken, fileId)` — calls `getFile` then downloads bytes. `sendTelegramPhoto(botToken, chatId, photo, businessConnectionId?)` — multipart upload to `sendPhoto`.

- [ ] **Step 1: Add failing tests**

In `src/lib/channels/__tests__/telegram.test.ts`, add these blocks after the existing ones:

```typescript
describe('extractTelegramMessage — photo', () => {
  it('returns photoFileId when message.photo is present', () => {
    const update: TelegramUpdate = {
      update_id: 10,
      message: {
        message_id: 99,
        chat: { id: 11223344, type: 'private' },
        from: { id: 11223344, username: 'customer1' },
        date: 1714204900,
        photo: [
          { file_id: 'small_id', file_unique_id: 'u1', width: 90, height: 90 },
          { file_id: 'large_id', file_unique_id: 'u2', width: 800, height: 600 },
        ],
      },
    }
    const result = extractTelegramMessage(update)
    expect(result).not.toBeNull()
    expect(result!.photoFileId).toBe('large_id')
    expect(result!.content).toBe('')
  })

  it('returns null content and correct chatId for photo-only message', () => {
    const update: TelegramUpdate = {
      update_id: 11,
      message: {
        message_id: 100,
        chat: { id: 55667788, type: 'private' },
        from: { id: 55667788, first_name: 'Bob' },
        date: 1714204900,
        photo: [{ file_id: 'fid1', file_unique_id: 'u1', width: 320, height: 240 }],
      },
    }
    const result = extractTelegramMessage(update)
    expect(result!.chatId).toBe('55667788')
    expect(result!.photoFileId).toBe('fid1')
  })

  it('returns null for message with neither text nor photo', () => {
    const update: TelegramUpdate = {
      update_id: 12,
      message: { message_id: 101, chat: { id: 123, type: 'private' }, date: 1714204900 },
    }
    expect(extractTelegramMessage(update)).toBeNull()
  })
})

describe('getTelegramFileBuffer', () => {
  it('calls getFile then downloads the file and returns buffer + mimeType', async () => {
    const getFileRes = { ok: true, result: { file_path: 'photos/abc.jpg' } }
    const fileBytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => getFileRes })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => fileBytes })
    vi.stubGlobal('fetch', mockFetch)

    const { buffer, mimeType } = await getTelegramFileBuffer('bot-token', 'file-id-abc')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[0][0]).toContain('getFile?file_id=file-id-abc')
    expect(mockFetch.mock.calls[1][0]).toContain('photos/abc.jpg')
    expect(mimeType).toBe('image/jpeg')
    expect(buffer).toBeInstanceOf(Buffer)
    vi.restoreAllMocks()
  })

  it('throws when getFile fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false }) }))
    await expect(getTelegramFileBuffer('token', 'bad-id')).rejects.toThrow('getFile failed')
    vi.restoreAllMocks()
  })
})

describe('sendTelegramPhoto', () => {
  it('POSTs multipart form to sendPhoto with chat_id and photo', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    await sendTelegramPhoto('bot-token', '11223344', new Blob(['img']))
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('sendPhoto')
    expect(options.body).toBeInstanceOf(FormData)
    vi.restoreAllMocks()
  })

  it('includes business_connection_id when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    await sendTelegramPhoto('bot-token', '11223344', new Blob(['img']), 'biz-conn-abc')
    const form = mockFetch.mock.calls[0][1].body as FormData
    expect(form.get('business_connection_id')).toBe('biz-conn-abc')
    vi.restoreAllMocks()
  })

  it('throws when Telegram responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }))
    await expect(sendTelegramPhoto('token', '123', new Blob(['x']))).rejects.toThrow('Telegram sendPhoto failed')
    vi.restoreAllMocks()
  })
})
```

Also add `getTelegramFileBuffer, sendTelegramPhoto` to the import at the top of the test file.

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:run -- src/lib/channels/__tests__/telegram.test.ts
```

Expected: FAIL — new exports and `photo` field don't exist yet.

- [ ] **Step 3: Rewrite `src/lib/channels/telegram.ts`**

```typescript
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

export async function registerTelegramWebhook(botToken: string, webhookUrl: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  })
  const json = await res.json() as { ok: boolean; description?: string }
  if (!json.ok) throw new Error(`setWebhook failed: ${json.description}`)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- src/lib/channels/__tests__/telegram.test.ts
```

Expected: all telegram tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/channels/telegram.ts src/lib/channels/__tests__/telegram.test.ts
git commit -m "feat: Telegram adapter detects inbound photos, adds getTelegramFileBuffer and sendTelegramPhoto"
```

---

## Task 5: WhatsApp webhook — download and store inbound photos

**Files:**
- Modify: `src/app/api/webhooks/whatsapp/[tenantId]/route.ts`
- Modify: `src/app/api/webhooks/whatsapp/[tenantId]/__tests__/route.test.ts`

When `extracted.mediaUrl` is present, the route downloads the image from Twilio (using Basic auth) and uploads to Supabase Storage. The storage path `{tenantId}/{externalId}.{ext}` is passed to `processInboundMessage` as `metadata: { kind: 'photo', storagePath }`.

- [ ] **Step 1: Add a failing test**

In `src/app/api/webhooks/whatsapp/[tenantId]/__tests__/route.test.ts`, add this mock at the top of the file and a new test:

Add to the `vi.mock` calls at the top:
```typescript
vi.mock('@/lib/media/storage', () => ({
  uploadToStorage: vi.fn().mockResolvedValue('tenant-123/SM001.jpg'),
}))
```

Add import:
```typescript
const { uploadToStorage } = await import('@/lib/media/storage')
```

Add this test inside the existing `describe` block:
```typescript
  it('downloads Twilio media, uploads to storage, and passes photo metadata to processInboundMessage', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabase({ tenant_id: TENANT_ID })
    )
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'authtest')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8]).buffer,
    })
    vi.stubGlobal('fetch', mockFetch)

    const params = {
      MessageSid: 'MM001',
      From: 'whatsapp:+15005550001',
      To: 'whatsapp:+14155551234',
      Body: '',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/media/ME001',
      MediaContentType0: 'image/jpeg',
    }
    const sig = twilioSign(WEBHOOK_URL, params, AUTH_TOKEN)
    const res = await POST(makeFormRequest(params, sig), { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(uploadToStorage).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Buffer),
      `${TENANT_ID}/MM001.jpg`,
      'image/jpeg',
    )
    expect(processInboundMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: '[Photo]',
        metadata: { kind: 'photo', storagePath: `${TENANT_ID}/MM001.jpg` },
      }),
    )
    vi.restoreAllMocks()
  })
```

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
npm run test:run -- "src/app/api/webhooks/whatsapp/\[tenantId\]/__tests__/route.test.ts"
```

Expected: the new photo test fails; existing tests pass.

- [ ] **Step 3: Update the route**

Replace all contents of `src/app/api/webhooks/whatsapp/[tenantId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processInboundMessage } from '@/lib/webhooks/processor'
import { verifyTwilioSignature, extractTwilioMessage } from '@/lib/channels/whatsapp'
import { uploadToStorage } from '@/lib/media/storage'

interface RouteContext { params: Promise<{ tenantId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const { tenantId } = await params
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const webhookUrl = `${appUrl}/api/webhooks/whatsapp/${tenantId}`

  const text = await request.text()
  const formParams = Object.fromEntries(new URLSearchParams(text))
  const signature = request.headers.get('x-twilio-signature') ?? ''

  if (!verifyTwilioSignature(authToken, webhookUrl, formParams, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const msg = extractTwilioMessage(formParams)
  if (!msg) return NextResponse.json({ ok: true })

  const supabase = createServiceClient()

  let metadata: Record<string, unknown> | undefined

  if (msg.mediaUrl && msg.mimeType) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID ?? ''
    const token = process.env.TWILIO_AUTH_TOKEN ?? ''
    const mediaRes = await fetch(msg.mediaUrl, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${accountSid}:${token}`).toString('base64') },
    })
    if (mediaRes.ok) {
      const buffer = Buffer.from(await mediaRes.arrayBuffer())
      const ext = msg.mimeType.split('/')[1] ?? 'jpg'
      const storagePath = `${tenantId}/${msg.externalId}.${ext}`
      await uploadToStorage(supabase, buffer, storagePath, msg.mimeType)
      metadata = { kind: 'photo', storagePath }
    }
  }

  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('tenant_id')
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'whatsapp')
    .eq('is_active', true)
    .single()

  if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await processInboundMessage(supabase, {
    tenantId,
    channelType: 'whatsapp',
    identifier: msg.from,
    displayHandle: msg.displayName,
    content: metadata ? '[Photo]' : msg.content,
    externalId: msg.externalId,
    sentAt: msg.sentAt,
    metadata,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- "src/app/api/webhooks/whatsapp/\[tenantId\]/__tests__/route.test.ts"
```

Expected: all tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/whatsapp/
git commit -m "feat: WhatsApp webhook downloads inbound photos and stores in Supabase Storage"
```

---

## Task 6: Telegram webhook — download and store inbound photos

**Files:**
- Modify: `src/app/api/webhooks/telegram/[tenantId]/route.ts`
- Modify: `src/app/api/webhooks/telegram/[tenantId]/__tests__/route.test.ts`

When `extracted.photoFileId` is present, the route calls `getTelegramFileBuffer` then uploads to Storage. Storage path: `{tenantId}/{externalId}.{ext}`.

- [ ] **Step 1: Add a failing test**

In `src/app/api/webhooks/telegram/[tenantId]/__tests__/route.test.ts`, add mocks and a test:

Add to `vi.mock` calls at the top:
```typescript
vi.mock('@/lib/media/storage', () => ({
  uploadToStorage: vi.fn().mockResolvedValue('tg-tenant-456/tg-50.jpg'),
}))
vi.mock('@/lib/channels/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/channels/telegram')>()
  return {
    ...actual,
    getTelegramFileBuffer: vi.fn().mockResolvedValue({
      buffer: Buffer.from('imgdata'),
      mimeType: 'image/jpeg',
    }),
  }
})
```

Add imports:
```typescript
const { uploadToStorage } = await import('@/lib/media/storage')
const { getTelegramFileBuffer } = await import('@/lib/channels/telegram')
```

Add this test inside the `describe` block:
```typescript
  it('downloads photo via getTelegramFileBuffer, uploads to storage, and passes photo metadata', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN, business_connection_id: BIZ_CONN_ID } }
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabase(channel))

    const update = {
      update_id: 10,
      message: {
        message_id: 50,
        business_connection_id: BIZ_CONN_ID,
        chat: { id: 11223344, type: 'private' },
        from: { id: 11223344, username: 'customer1' },
        date: 1714205000,
        photo: [
          { file_id: 'small_fid', file_unique_id: 'u1', width: 90, height: 90 },
          { file_id: 'large_fid', file_unique_id: 'u2', width: 800, height: 600 },
        ],
      },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST', body: JSON.stringify(update), headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(getTelegramFileBuffer).toHaveBeenCalledWith(BOT_TOKEN, 'large_fid')
    expect(uploadToStorage).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Buffer),
      `${TENANT_ID}/tg-50.jpg`,
      'image/jpeg',
    )
    expect(processInboundMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: '[Photo]',
        metadata: { kind: 'photo', storagePath: `${TENANT_ID}/tg-50.jpg` },
      }),
    )
  })
```

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
npm run test:run -- "src/app/api/webhooks/telegram/\[tenantId\]/__tests__/route.test.ts"
```

Expected: the new photo test fails; existing tests pass.

- [ ] **Step 3: Update the route**

Replace all contents of `src/app/api/webhooks/telegram/[tenantId]/route.ts`:

```typescript
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
        .update({ credentials: rest })
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- "src/app/api/webhooks/telegram/\[tenantId\]/__tests__/route.test.ts"
```

Expected: all tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/telegram/
git commit -m "feat: Telegram webhook downloads inbound photos and stores in Supabase Storage"
```

---

## Task 7: Upload API endpoint

**Files:**
- Create: `src/app/api/upload/route.ts`
- Create: `src/app/api/upload/__tests__/route.test.ts`

POST multipart endpoint: validates file type and size, uploads to Storage, returns `{ storagePath }`.

- [ ] **Step 1: Write failing tests**

Create `src/app/api/upload/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/media/storage', () => ({
  uploadToStorage: vi.fn().mockResolvedValue('tenant-1/uuid.jpg'),
}))

const { POST } = await import('../route')
const { createClient } = await import('@/lib/supabase/server')
const { uploadToStorage } = await import('@/lib/media/storage')

const TENANT_ID = 'tenant-uuid-1'
const USER_ID = 'user-uuid-1'

function makeSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { tenant_id: TENANT_ID }, error: null }),
    }),
  }
}

function makeRequest(file: File | null, conversationId: string | null) {
  const form = new FormData()
  if (file) form.append('file', file)
  if (conversationId) form.append('conversationId', conversationId)
  return new Request('http://localhost/api/upload', { method: 'POST', body: form })
}

describe('POST /api/upload', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uploads an image and returns storagePath', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const file = new File([new Uint8Array(100)], 'photo.jpg', { type: 'image/jpeg' })
    const res = await POST(makeRequest(file, 'conv-1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { storagePath: string }
    expect(body.storagePath).toMatch(/^tenant-uuid-1\/.+\.jpg$/)
    expect(uploadToStorage).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Buffer),
      expect.stringMatching(/^tenant-uuid-1\/.+\.jpg$/),
      'image/jpeg',
    )
  })

  it('returns 401 when not authenticated', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      from: vi.fn(),
    })
    const file = new File([new Uint8Array(10)], 'p.jpg', { type: 'image/jpeg' })
    const res = await POST(makeRequest(file, 'conv-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for an unsupported file type', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const file = new File([new Uint8Array(10)], 'doc.pdf', { type: 'application/pdf' })
    const res = await POST(makeRequest(file, 'conv-1'))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('file type')
  })

  it('returns 400 when file exceeds 5MB', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    const res = await POST(makeRequest(bigFile, 'conv-1'))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('large')
  })

  it('returns 400 when file or conversationId is missing', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const res = await POST(makeRequest(null, 'conv-1'))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:run -- src/app/api/upload/__tests__/route.test.ts
```

Expected: FAIL — route does not exist.

- [ ] **Step 3: Create `src/app/api/upload/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { uploadToStorage } from '@/lib/media/storage'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_BYTES = 5 * 1024 * 1024

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const conversationId = formData.get('conversationId') as string | null

  if (!file || !conversationId) {
    return NextResponse.json({ error: 'Missing file or conversationId' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Allowed: jpeg, png, webp, gif' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
  }

  const ext = file.type.split('/')[1]
  const storagePath = `${userRow.tenant_id}/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  await uploadToStorage(supabase, buffer, storagePath, file.type)
  return NextResponse.json({ storagePath })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- src/app/api/upload/__tests__/route.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/upload/
git commit -m "feat: add /api/upload endpoint for photo attachments"
```

---

## Task 8: Send route — outbound photo

**Files:**
- Modify: `src/app/api/send/route.ts`
- Modify: `src/app/api/send/__tests__/route.test.ts` (read first, then add photo tests)

Accept optional `storagePath` in the request body. For WhatsApp: generate a signed URL → Twilio `MediaUrl`. For Telegram: download blob from storage → `sendTelegramPhoto`.

- [ ] **Step 1: Read the current send route test file**

Read `src/app/api/send/__tests__/route.test.ts` in full to understand the existing test structure before modifying it.

- [ ] **Step 2: Add failing tests for photo sending**

The existing test file has these mocks at the top:
```typescript
vi.mock('@/lib/channels/whatsapp', async (importOriginal) => ({ ...spread, sendWhatsAppMessage: vi.fn() }))
vi.mock('@/lib/channels/telegram', async (importOriginal) => ({ ...spread, sendTelegramMessage: vi.fn() }))
```

**Replace** those two `vi.mock` calls and add new ones so the full mock block becomes:

```typescript
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/media/storage', () => ({
  generateSignedUrl: vi.fn().mockResolvedValue('https://sb.co/signed-photo'),
}))
vi.mock('@/lib/channels/whatsapp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/channels/whatsapp')>()),
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  sendWhatsAppMedia: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/channels/telegram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/channels/telegram')>()),
  sendTelegramMessage: vi.fn().mockResolvedValue(undefined),
  sendTelegramPhoto: vi.fn().mockResolvedValue(undefined),
}))
```

**Add** these import lines after the existing `const { POST }` / `const { createClient }` lines:

```typescript
const { generateSignedUrl } = await import('@/lib/media/storage')
const { sendWhatsAppMedia } = await import('@/lib/channels/whatsapp')
const { sendTelegramPhoto } = await import('@/lib/channels/telegram')
```

**Add** a `makeWhatsAppSupabase` helper after the existing `makeSupabase` function:

```typescript
function makeWhatsAppSupabase() {
  const convData = { id: CONV_ID, tenant_id: TENANT_ID, channel_type: 'whatsapp', channel_identifier: '+15005550001', customer_id: 'cust-1' }
  const channelData = { credentials: { phone_number: '+15005550001' }, is_active: true }
  let callCount = 0
  return {
    from: vi.fn().mockImplementation(() => {
      callCount++
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(
          callCount === 1 ? { data: convData, error: null }
          : callCount === 2 ? { data: channelData, error: null }
          : { data: { id: 'msg-new' }, error: null }
        ),
      }
    }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    storage: { from: vi.fn().mockReturnValue({ download: vi.fn().mockResolvedValue({ data: new Blob(['img']), error: null }) }) },
  }
}
```

Also add `storage` to the existing `makeSupabase` return value (needed for the Telegram photo test):

```typescript
    storage: { from: vi.fn().mockReturnValue({ download: vi.fn().mockResolvedValue({ data: new Blob(['img']), error: null }) }) },
```

**Add** these three tests inside the existing `describe('POST /api/send', ...)` block:

```typescript
  it('sends a WhatsApp photo: generates signed URL and calls sendWhatsAppMedia', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeWhatsAppSupabase())
    const req = new Request('http://localhost/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: CONV_ID, storagePath: 'tid/abc.jpg' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(generateSignedUrl).toHaveBeenCalledWith(expect.anything(), 'tid/abc.jpg')
    expect(sendWhatsAppMedia).toHaveBeenCalledWith('https://sb.co/signed-photo', '+15005550001')
  })

  it('sends a Telegram photo: downloads blob from storage and calls sendTelegramPhoto', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const req = new Request('http://localhost/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: CONV_ID, storagePath: 'tid/abc.jpg' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(sendTelegramPhoto).toHaveBeenCalledWith('bot:TOKEN', '99887766', expect.any(Blob), undefined)
  })

  it('returns 400 when neither content nor storagePath is provided', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const req = new Request('http://localhost/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: CONV_ID }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
```

- [ ] **Step 3: Run tests to confirm the new tests fail**

```bash
npm run test:run -- "src/app/api/send/__tests__/route.test.ts"
```

Expected: the new photo tests fail.

- [ ] **Step 4: Update `src/app/api/send/route.ts`**

Read the current file, then apply these changes:

1. Add imports at the top:
```typescript
import { generateSignedUrl } from '@/lib/media/storage'
import { sendWhatsAppMedia } from '@/lib/channels/whatsapp'
import { sendTelegramPhoto } from '@/lib/channels/telegram'
```

2. Update the request body type:
```typescript
const body = await request.json() as { conversationId?: string; content?: string; storagePath?: string }
```

3. Update the validation guard (allow storagePath as alternative to content):
```typescript
if (!body.conversationId || (!body.content?.trim() && !body.storagePath)) {
  return NextResponse.json({ error: 'conversationId and content or storagePath are required' }, { status: 400 })
}
```

4. Replace the channel dispatch block (the `if whatsapp / else if telegram / else if email` section):
```typescript
  const to = conv.channel_identifier
  const text = body.content ?? ''
  const { storagePath } = body

  if (conv.channel_type === 'whatsapp') {
    if (storagePath) {
      const signedUrl = await generateSignedUrl(supabase, storagePath)
      await sendWhatsAppMedia(signedUrl, to)
    } else {
      await sendWhatsAppMessage(to, text)
    }
  } else if (conv.channel_type === 'telegram') {
    const creds = channel.credentials as { bot_token: string; business_connection_id?: string }
    if (storagePath) {
      const { data: blob } = await supabase.storage.from('media').download(storagePath)
      if (!blob) throw new Error('Failed to download media from storage')
      await sendTelegramPhoto(creds.bot_token, to, blob, creds.business_connection_id)
    } else {
      await sendTelegramMessage(creds.bot_token, to, text, creds.business_connection_id)
    }
  } else if (conv.channel_type === 'email') {
    const creds = channel.credentials as unknown as GoogleCredentials | MicrosoftCredentials
    if (creds.provider === 'google') {
      await sendGmailMessage(creds as GoogleCredentials, to, 'Re: your message', text)
    } else {
      await sendMicrosoftMessage(creds as MicrosoftCredentials, to, 'Re: your message', text)
    }
  }
```

5. Update the message insert to handle photo:
```typescript
  const { data: message } = await supabase
    .from('messages')
    .insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      direction: 'outbound',
      content: storagePath ? '[Photo]' : text,
      status: 'sent',
      metadata: storagePath ? { kind: 'photo', storagePath } : null,
    })
    .select('id')
    .single()
```

6. Update the conversation snippet update:
```typescript
  await supabase
    .from('conversations')
    .update({
      status: 'in_progress',
      last_message_at: new Date().toISOString(),
      last_message_snippet: storagePath ? 'You: [Photo]' : `You: ${text.slice(0, 97)}`,
    })
    .eq('id', conv.id)
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm run test:run -- "src/app/api/send/__tests__/route.test.ts"
```

Expected: all tests pass.

- [ ] **Step 6: Run full suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/send/
git commit -m "feat: send route supports outbound photos via WhatsApp MediaUrl and Telegram sendPhoto"
```

---

## Task 9: InboxProvider — signed URLs for photo messages

**Files:**
- Modify: `src/components/inbox/InboxProvider.tsx`

Two places generate signed URLs:
1. `fetchMessages` — after loading messages, generate signed URLs for any with `kind === 'photo'`.
2. Real-time `INSERT` handler — generate signed URL before adding a photo message to state.

No unit tests for this task (the signed URL logic is thin and tested in storage.ts; the Provider is an integration concern).

- [ ] **Step 1: Read the current `InboxProvider.tsx`**

Read the full file to confirm current `fetchMessages` callback and the real-time INSERT handler.

- [ ] **Step 2: Update `fetchMessages` to generate signed URLs**

Find the `fetchMessages` callback (currently around lines 94–104). Replace:

```typescript
setMessages((data ?? []).map(m => dbMessageToInboxMessage(m as unknown as DbMessage)))
```

With:

```typescript
const mapped = (data ?? []).map(m => dbMessageToInboxMessage(m as unknown as DbMessage))
const withUrls = await Promise.all(mapped.map(async msg => {
  if (msg.kind === 'photo' && msg.metadata?.storagePath) {
    const { data: urlData } = await supabase.storage
      .from('media')
      .createSignedUrl(msg.metadata.storagePath as string, 3600)
    return { ...msg, metadata: { ...msg.metadata, mediaUrl: urlData?.signedUrl } }
  }
  return msg
}))
setMessages(withUrls)
```

- [ ] **Step 3: Update the real-time INSERT handler to generate signed URLs**

Find the `postgres_changes INSERT` callback (around line 250). It currently does:

```typescript
}, (payload) => {
  const newMsg = dbMessageToInboxMessage(payload.new as unknown as DbMessage)
  setMessages(prev => { ... })
})
```

Change the callback to `async` and add signed URL generation:

```typescript
}, async (payload) => {
  let newMsg = dbMessageToInboxMessage(payload.new as unknown as DbMessage)
  if (newMsg.kind === 'photo' && newMsg.metadata?.storagePath) {
    const { data: urlData } = await supabase.storage
      .from('media')
      .createSignedUrl(newMsg.metadata.storagePath as string, 3600)
    newMsg = { ...newMsg, metadata: { ...newMsg.metadata, mediaUrl: urlData?.signedUrl } }
  }
  setMessages(prev => {
    if (prev.some(m => m.id === newMsg.id)) return prev
    if (newMsg.from === 'me') {
      const optIdx = prev.findIndex(m => m.optimistic && m.text === newMsg.text)
      if (optIdx >= 0) return prev.map((m, i) => i === optIdx ? newMsg : m)
    }
    return [...prev, newMsg]
  })
})
```

- [ ] **Step 4: Run full test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/InboxProvider.tsx
git commit -m "feat: InboxProvider generates signed URLs for photo messages at fetch and realtime"
```

---

## Task 10: UI — photo bubble + wire attach button

**Files:**
- Modify: `src/components/inbox/InboxView.tsx`
- Modify: `styles/inbox.css`

Add a `photo` case to the `Bubble` component (full-width thumbnail, click opens full-size). Wire the existing (currently inert) paperclip button to a hidden file input → upload → send flow.

- [ ] **Step 1: Read the current InboxView.tsx**

Read the full file. The attach button is at line 264. The `Bubble` function is around lines 154–209. The `Composer` function starts around line 213.

- [ ] **Step 2: Add the photo bubble case to `Bubble`**

In the `Bubble` function, after the `if (m.kind === 'tx')` block and before the default text `return`, insert:

```tsx
  if (m.kind === 'photo') {
    return (
      <div className={`pt-bubble pt-bubble-${m.from} pt-bubble-photo`}>
        {m.metadata?.mediaUrl ? (
          <a href={m.metadata.mediaUrl as string} target="_blank" rel="noopener noreferrer" className="pt-bubble-img-link">
            <img
              src={m.metadata.mediaUrl as string}
              alt="Photo"
              className="pt-bubble-img"
            />
          </a>
        ) : (
          <div className="pt-bubble-img-placeholder">📷</div>
        )}
        <div className="pt-bubble-meta">
          {m.at}
          {m.from === 'me' && !m.optimistic && <span className="pt-bubble-read"> · sent</span>}
        </div>
      </div>
    )
  }
```

- [ ] **Step 3: Wire the attach button in `Composer`**

In the `Composer` function, add these at the top of the function body (after existing state):

```tsx
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const { activeId } = useInbox()

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeId) return
    setIsUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('conversationId', activeId)
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: form })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const { storagePath } = await uploadRes.json() as { storagePath: string }
      const sendRes = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, storagePath }),
      })
      if (!sendRes.ok) throw new Error('Send failed')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [activeId])
```

Replace the inert attach button (currently around line 264):

```tsx
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button
                className="pt-iconbtn"
                title="Attach photo"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-2.8-2.8L15 8.5"/></svg>
              </button>
            </>
```

Also add `activeId` to the `useInbox()` destructure in Composer:
```typescript
  const { quickReplies, templates, activeId } = useInbox()
```

- [ ] **Step 4: Add CSS for photo bubble to `styles/inbox.css`**

Append at the end of `styles/inbox.css`:

```css
/* ── Photo bubble ─────────────────────────────────────────────────────────── */
.pt-bubble-photo { padding: 4px 4px 0; }
.pt-bubble-img-link { display: block; }
.pt-bubble-img {
  display: block; max-width: 240px; width: 100%;
  border-radius: 6px; cursor: pointer;
  transition: opacity 0.15s;
}
.pt-bubble-img:hover { opacity: 0.88; }
.pt-bubble-img-placeholder {
  display: flex; align-items: center; justify-content: center;
  width: 240px; height: 160px; border-radius: 6px;
  background: oklch(from var(--pt-fg) l c h / 0.06);
  font-size: 24px;
}
```

- [ ] **Step 5: Run full test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/inbox/InboxView.tsx styles/inbox.css
git commit -m "feat: photo bubble and wired attach button in inbox composer"
```

---

## Verification Checklist

- [ ] All tests pass (`npm run test:run`)
- [ ] Customer sends a photo via WhatsApp → appears as full-width thumbnail in inbox
- [ ] Customer sends a photo via Telegram → appears as full-width thumbnail in inbox
- [ ] Click thumbnail → opens full-size photo in new tab
- [ ] Attach button in composer opens file picker (images only)
- [ ] Attach a photo → appears in the conversation after send
- [ ] Sent photo arrives on the customer's WhatsApp
- [ ] Sent photo arrives on the customer's Telegram
- [ ] Photos are in the private `media` bucket in Supabase dashboard
- [ ] Signed URLs expire after 1 hour (verify with a URL after 1h or by checking the expiry param)
- [ ] Non-image files (PDF, etc.) are rejected by the upload endpoint with a 400

---

## Notes for the implementer

- **Service client vs user client for storage:** Webhook routes use `createServiceClient()` which has the service role key — this bypasses storage RLS and can upload to any path. The upload endpoint and InboxProvider use the user's session client, which is restricted by the storage policy to paths under `{tenant_id}/`. Both are correct by design.
- **`processInboundMessage` already supports metadata:** The `InboundMessageParams.metadata?: Record<string, unknown>` field is already there — no changes needed to the processor.
- **`dbMessageToInboxMessage` does not need changes:** It already maps `metadata?.kind` to the `kind` field. Adding `'photo'` to the type union in Task 2 is sufficient.
- **The `activeId` field is already in `InboxCtx`** (from `InboxProvider`) but not currently destructured in `Composer`. Task 10 adds it to the `useInbox()` destructure.
- **Task 8 Step 2:** Write actual test implementations — the instructions describe what to test but you must write the full code matching the existing test file's helper patterns (read the file in Step 1 first).
