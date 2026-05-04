# Twilio WhatsApp Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 360dialog WhatsApp integration with Twilio so tenants only need to enter their phone number — no API keys or third-party accounts required.

**Architecture:** Peptech holds a single set of Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`) in env vars. Each tenant's `tenant_channels` record stores only their WhatsApp phone number. Twilio delivers inbound messages as form-encoded POSTs, verified with HMAC-SHA1 using the Twilio Auth Token. Outbound messages go via Twilio's Messages REST API with Basic Auth.

**Tech Stack:** Twilio Messages API, Next.js 15 App Router, Supabase, Vitest

---

## File Structure

```
src/lib/channels/
  whatsapp.ts                     REWRITE — Twilio adapter (verify, extract, send)

src/app/api/webhooks/whatsapp/[tenantId]/
  route.ts                        REWRITE — remove GET hub handler, Twilio POST handler
  __tests__/route.test.ts         REWRITE — Twilio form body + HMAC-SHA1 tests

src/app/settings/channels/
  actions.ts                      MODIFY — replace saveWhatsAppCredentials with connectWhatsAppNumber
  page.tsx                        MODIFY — replace 3-field form with single phone number field

src/app/api/send/route.ts         MODIFY — use env vars for Twilio creds, not DB credentials

supabase/migrations/
  20260429000001_twilio_whatsapp_credentials.sql   NEW — clean up credentials shape in DB
```

---

## Task 1: Rewrite the WhatsApp channel adapter

**Files:**
- Rewrite: `src/lib/channels/whatsapp.ts`
- Create: `src/lib/channels/__tests__/whatsapp.test.ts`

### Background

Twilio's webhook signature works as follows:
1. Take the full URL of the request
2. Sort all POST parameters alphabetically and append each key+value (no separator) to the URL string
3. Sign with HMAC-SHA1 using the Twilio Auth Token as the key
4. Base64-encode the result
5. Compare to `X-Twilio-Signature` header

Twilio sends inbound WhatsApp messages as form-encoded POST bodies with these fields:
- `MessageSid` — unique message ID (use as externalId)
- `From` — sender number, prefixed: `whatsapp:+15005550001`
- `To` — your Twilio number, prefixed: `whatsapp:+14155551234`
- `Body` — message text
- `ProfileName` — WhatsApp display name of the sender
- `WaId` — sender's WhatsApp ID (same number without `whatsapp:` prefix)

Outbound: POST to `https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json` with Basic Auth and form-encoded body containing `From`, `To`, `Body`.

- [ ] **Step 1: Write failing tests**

Create `src/lib/channels/__tests__/whatsapp.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import {
  verifyTwilioSignature,
  extractTwilioMessage,
} from '../whatsapp'

const AUTH_TOKEN = 'test-auth-token'
const WEBHOOK_URL = 'https://peptech.app/api/webhooks/whatsapp/tenant-123'

function twilioSign(url: string, params: Record<string, string>, token: string): string {
  const sortedKeys = Object.keys(params).sort()
  const str = url + sortedKeys.map(k => k + params[k]).join('')
  return createHmac('sha1', token).update(str).digest('base64')
}

describe('verifyTwilioSignature', () => {
  it('returns true for a valid signature', () => {
    const params = { Body: 'Hello', From: 'whatsapp:+15005550001', MessageSid: 'SM123', To: 'whatsapp:+14155551234' }
    const sig = twilioSign(WEBHOOK_URL, params, AUTH_TOKEN)
    expect(verifyTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, params, sig)).toBe(true)
  })

  it('returns false for a tampered signature', () => {
    const params = { Body: 'Hello', From: 'whatsapp:+15005550001', MessageSid: 'SM123', To: 'whatsapp:+14155551234' }
    expect(verifyTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, params, 'badsig')).toBe(false)
  })

  it('returns false when params differ from signed params', () => {
    const params = { Body: 'Hello', From: 'whatsapp:+15005550001', MessageSid: 'SM123', To: 'whatsapp:+14155551234' }
    const sig = twilioSign(WEBHOOK_URL, params, AUTH_TOKEN)
    const tamperedParams = { ...params, Body: 'Hacked' }
    expect(verifyTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, tamperedParams, sig)).toBe(false)
  })
})

describe('extractTwilioMessage', () => {
  it('extracts message fields and strips whatsapp: prefix from From', () => {
    const params = {
      MessageSid: 'SM001',
      From: 'whatsapp:+15005550001',
      Body: 'Hello world',
      ProfileName: 'John Doe',
      To: 'whatsapp:+14155551234',
      WaId: '15005550001',
    }
    const msg = extractTwilioMessage(params)
    expect(msg).not.toBeNull()
    expect(msg!.externalId).toBe('SM001')
    expect(msg!.from).toBe('+15005550001')
    expect(msg!.displayName).toBe('John Doe')
    expect(msg!.content).toBe('Hello world')
    expect(msg!.sentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('falls back to from number as displayName when ProfileName missing', () => {
    const params = { MessageSid: 'SM002', From: 'whatsapp:+15005550001', Body: 'Hi', To: 'whatsapp:+14155551234' }
    const msg = extractTwilioMessage(params)
    expect(msg!.displayName).toBe('+15005550001')
  })

  it('returns null when required fields are missing', () => {
    expect(extractTwilioMessage({ MessageSid: 'SM003', From: 'whatsapp:+1500' })).toBeNull()
    expect(extractTwilioMessage({ Body: 'Hi', From: 'whatsapp:+1500' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "c:\Users\alana\OneDrive\Documents\Pep Tech"
npm run test:run -- src/lib/channels/__tests__/whatsapp.test.ts
```

Expected: FAIL — `verifyTwilioSignature` and `extractTwilioMessage` not found.

- [ ] **Step 3: Rewrite `src/lib/channels/whatsapp.ts`**

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
} | null {
  const { MessageSid, From, Body, ProfileName } = params
  if (!MessageSid || !From || !Body) return null
  const from = From.replace(/^whatsapp:/, '')
  return {
    externalId: MessageSid,
    from,
    displayName: ProfileName ?? from,
    content: Body,
    sentAt: new Date().toISOString(),
  }
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- src/lib/channels/__tests__/whatsapp.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/channels/whatsapp.ts src/lib/channels/__tests__/whatsapp.test.ts
git commit -m "feat: replace 360dialog WhatsApp adapter with Twilio"
```

---

## Task 2: Rewrite the WhatsApp webhook route

**Files:**
- Rewrite: `src/app/api/webhooks/whatsapp/[tenantId]/route.ts`
- Rewrite: `src/app/api/webhooks/whatsapp/[tenantId]/__tests__/route.test.ts`

### Background

Twilio does **not** use the Meta hub challenge (`GET` with `hub.mode`). The webhook is registered in the Twilio console by Peptech — tenants never touch it. Remove the `GET` handler entirely.

Twilio sends `X-Twilio-Signature` (not `X-Hub-Signature-256`). The auth token comes from env vars, not the DB. The DB is only queried to confirm the tenant has an active whatsapp channel.

The route must reconstruct the full public URL for signature verification — Twilio signs against the public URL, not `localhost`. Use `process.env.NEXT_PUBLIC_APP_URL`.

- [ ] **Step 1: Write failing tests**

Replace all contents of `src/app/api/webhooks/whatsapp/[tenantId]/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}))
vi.mock('@/lib/webhooks/processor', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1' }),
}))
vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-auth-token')
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://peptech.app')

const { POST } = await import('../route')
const { createServiceClient } = await import('@/lib/supabase/server')
const { processInboundMessage } = await import('@/lib/webhooks/processor')

const TENANT_ID = 'tenant-123'
const AUTH_TOKEN = 'test-auth-token'
const WEBHOOK_URL = `https://peptech.app/api/webhooks/whatsapp/${TENANT_ID}`

function makeSupabase(channel: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: channel, error: null }),
    }),
  }
}

function twilioSign(url: string, params: Record<string, string>, token: string): string {
  const sortedKeys = Object.keys(params).sort()
  const str = url + sortedKeys.map(k => k + params[k]).join('')
  return createHmac('sha1', token).update(str).digest('base64')
}

function makeFormRequest(params: Record<string, string>, signature: string) {
  const body = new URLSearchParams(params).toString()
  return new Request(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': signature,
    },
    body,
  })
}

const VALID_PARAMS = {
  MessageSid: 'SM001',
  From: 'whatsapp:+15005550001',
  To: 'whatsapp:+14155551234',
  Body: 'Hello',
  ProfileName: 'Test User',
}

describe('WhatsApp webhook (Twilio)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 and calls processInboundMessage for a valid request', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabase({ tenant_id: TENANT_ID })
    )
    const sig = twilioSign(WEBHOOK_URL, VALID_PARAMS, AUTH_TOKEN)
    const res = await POST(makeFormRequest(VALID_PARAMS, sig), { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).toHaveBeenCalledOnce()
    expect(processInboundMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        channelType: 'whatsapp',
        identifier: '+15005550001',
        content: 'Hello',
        externalId: 'SM001',
      }),
    )
  })

  it('returns 401 for an invalid signature', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabase({ tenant_id: TENANT_ID })
    )
    const res = await POST(makeFormRequest(VALID_PARAMS, 'bad-signature'), { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(401)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })

  it('returns 200 without calling processInboundMessage when Body is missing (status callback)', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabase({ tenant_id: TENANT_ID })
    )
    const params = { MessageSid: 'SM001', From: 'whatsapp:+15005550001', MessageStatus: 'delivered' }
    const sig = twilioSign(WEBHOOK_URL, params, AUTH_TOKEN)
    const res = await POST(makeFormRequest(params, sig), { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })

  it('returns 404 when tenant has no active whatsapp channel', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabase(null)
    )
    const sig = twilioSign(WEBHOOK_URL, VALID_PARAMS, AUTH_TOKEN)
    const res = await POST(makeFormRequest(VALID_PARAMS, sig), { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:run -- "src/app/api/webhooks/whatsapp/\[tenantId\]/__tests__/route.test.ts"
```

Expected: FAIL — route still has old 360dialog implementation.

- [ ] **Step 3: Rewrite the route**

Replace all contents of `src/app/api/webhooks/whatsapp/[tenantId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processInboundMessage } from '@/lib/webhooks/processor'
import { verifyTwilioSignature, extractTwilioMessage } from '@/lib/channels/whatsapp'

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
  if (!msg) return NextResponse.json({ ok: true }) // status callback or non-text event

  const supabase = createServiceClient()
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
    content: msg.content,
    externalId: msg.externalId,
    sentAt: msg.sentAt,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- "src/app/api/webhooks/whatsapp/\[tenantId\]/__tests__/route.test.ts"
```

Expected: 4 tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npm run test:run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/whatsapp/
git commit -m "feat: switch WhatsApp webhook to Twilio (form body, HMAC-SHA1, no hub challenge)"
```

---

## Task 3: Update outbound send route

**Files:**
- Modify: `src/app/api/send/route.ts` (lines 44–46)

Currently the WhatsApp branch reads `api_key` from the DB credentials:
```typescript
const creds = channel.credentials as { api_key: string }
await sendWhatsAppMessage(creds.api_key, to, text)
```

With Twilio, credentials come from env vars. Only the `to` number is needed.

- [ ] **Step 1: Update the WhatsApp branch in the send route**

In `src/app/api/send/route.ts`, find lines 44–46 and replace:

```typescript
  if (conv.channel_type === 'whatsapp') {
    const creds = channel.credentials as { api_key: string }
    await sendWhatsAppMessage(creds.api_key, to, text)
  }
```

With:

```typescript
  if (conv.channel_type === 'whatsapp') {
    await sendWhatsAppMessage(to, text)
  }
```

- [ ] **Step 2: Run full test suite**

```bash
npm run test:run
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/send/route.ts
git commit -m "feat: outbound WhatsApp send uses Twilio env vars instead of per-tenant API key"
```

---

## Task 4: Update settings actions and UI

**Files:**
- Modify: `src/app/settings/channels/actions.ts`
- Modify: `src/app/settings/channels/page.tsx`

### Actions

Replace `saveWhatsAppCredentials` (which took `apiKey`, `phoneNumberId`, `webhookSecret`) with `connectWhatsAppNumber` (which takes only a phone number).

- [ ] **Step 1: Replace `saveWhatsAppCredentials` in `src/app/settings/channels/actions.ts`**

Remove the existing `saveWhatsAppCredentials` function and replace with:

```typescript
export async function connectWhatsAppNumber(formData: FormData) {
  const raw = (formData.get('phoneNumber') as string)?.trim()
  if (!raw) return { error: 'Phone number is required' }
  const phoneNumber = raw.startsWith('+') ? raw : `+${raw}`

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'User not found' }

  await supabase.from('tenant_channels').upsert({
    tenant_id: userRow.tenant_id,
    channel_type: 'whatsapp',
    identifier: phoneNumber,
    credentials: { phone_number: phoneNumber },
    is_active: true,
  }, { onConflict: 'tenant_id,channel_type' })

  revalidatePath('/settings/channels')
  return { success: true }
}
```

Also update the import at the top of `actions.ts` — `revalidatePath` is already imported, nothing else changes.

### Settings UI

- [ ] **Step 2: Update `src/app/settings/channels/page.tsx`**

At line 2, change the import:
```typescript
import { saveTelegramCredentials, saveWhatsAppCredentials, disconnectChannel } from './actions'
```
to:
```typescript
import { saveTelegramCredentials, connectWhatsAppNumber, disconnectChannel } from './actions'
```

Find the WhatsApp connect form (lines 80–89) and replace with:

```tsx
<details style={{ width: '100%' }}>
  <summary className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer', fontSize: 12 }}>Connect</summary>
  <form action={connectWhatsAppNumber} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
    <input name="phoneNumber" placeholder="+1 555 000 0000" required style={inputStyle} />
    <p style={{ fontSize: 11, color: 'var(--pt-fg-4)', margin: 0 }}>
      Your WhatsApp Business number in international format. Twilio will route messages to this number.
    </p>
    <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>Connect</button>
  </form>
</details>
```

- [ ] **Step 3: Run full test suite**

```bash
npm run test:run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/channels/actions.ts src/app/settings/channels/page.tsx
git commit -m "feat: WhatsApp setup now requires only a phone number (Twilio integration)"
```

---

## Task 5: DB migration — clean up credentials shape

**Files:**
- Create: `supabase/migrations/20260429000001_twilio_whatsapp_credentials.sql`

Any existing `tenant_channels` rows with 360dialog credentials (`api_key`, `phone_number_id`) need to be updated to the new shape (`phone_number`). The `identifier` column already stores the phone number, so we can use it.

- [ ] **Step 1: Apply migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `twilio_whatsapp_credentials` and SQL:

```sql
UPDATE public.tenant_channels
SET credentials = jsonb_build_object('phone_number', identifier)
WHERE channel_type = 'whatsapp'
  AND (credentials ? 'api_key' OR credentials ? 'phone_number_id');
```

- [ ] **Step 2: Create the local migration file**

Create `supabase/migrations/20260429000001_twilio_whatsapp_credentials.sql` with the same SQL so it's in version control:

```sql
UPDATE public.tenant_channels
SET credentials = jsonb_build_object('phone_number', identifier)
WHERE channel_type = 'whatsapp'
  AND (credentials ? 'api_key' OR credentials ? 'phone_number_id');
```

- [ ] **Step 3: Verify**

Use `mcp__supabase__execute_sql` to confirm:

```sql
SELECT credentials FROM public.tenant_channels WHERE channel_type = 'whatsapp';
```

Expected: any rows have `{"phone_number": "+..."}` shape (or no rows if none were configured).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260429000001_twilio_whatsapp_credentials.sql
git commit -m "chore: migrate WhatsApp tenant_channels credentials to Twilio shape"
```

---

## Environment Variables Required

Add to `.env.local` (these are Peptech-level, not per-tenant):

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_NUMBER=+14155551234
```

`TWILIO_WHATSAPP_NUMBER` is the Twilio-provisioned WhatsApp sender number registered in the Twilio console. All tenants' outbound messages appear from this number (or from a Messaging Service SID if you use one).

The webhook URL to register in the Twilio console per tenant is:
```
https://peptech.app/api/webhooks/whatsapp/{tenantId}
```

---

## Verification Checklist

After all tasks:
- [ ] All tests pass (`npm run test:run`)
- [ ] Settings → Channels → WhatsApp shows a single phone number field
- [ ] Saving a phone number creates a `tenant_channels` row with `credentials: {phone_number: "+..."}`
- [ ] With valid `TWILIO_*` env vars and a registered Twilio sandbox number, sending a message from WhatsApp delivers it to the inbox
- [ ] Outbound messages sent from the inbox go via Twilio (check Twilio console logs)
- [ ] Sending a message via SQL INSERT does not break anything (trigger still fires)
