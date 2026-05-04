# Telegram Business API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Telegram integration from Bot-only to Telegram Business so customers message the tenant's personal account and replies feel like a real person, not a bot.

**Architecture:** The tenant still creates a bot via BotFather and provides the token (unchanged). They then link the bot to their personal Telegram account via Settings → Telegram Business → Chatbots. Telegram starts routing all personal-account messages through the bot's webhook, adding a `business_connection_id` field to every message. We auto-capture this ID on the first event and store it in `tenant_channels.credentials`. Outbound replies include this ID so they appear to come from the personal account.

**Tech Stack:** Telegram Bot API (with Business extensions), Next.js 15 App Router, Supabase, Vitest

---

## File Structure

```
src/lib/channels/
  telegram.ts                                         MODIFY — add business_connection_id to types + functions

src/lib/channels/__tests__/
  telegram.test.ts                                    CREATE — unit tests for adapter functions

src/app/api/webhooks/telegram/[tenantId]/
  route.ts                                            MODIFY — handle business_connection event, auto-capture ID
  __tests__/route.test.ts                             MODIFY — update tests for Business webhook behaviour

src/app/api/send/
  route.ts                                            MODIFY — pass business_connection_id to sendTelegramMessage

src/app/settings/channels/
  page.tsx                                            MODIFY — update Telegram connect form with Business setup steps
```

---

## Task 1: Update Telegram adapter + unit tests

**Files:**
- Modify: `src/lib/channels/telegram.ts`
- Create: `src/lib/channels/__tests__/telegram.test.ts`

### Changes to `telegram.ts`

Three things change:

1. `TelegramUpdate` — add `business_connection_id?` to the `message` field and add a top-level `business_connection?` event type.
2. `extractTelegramMessage` — return the `businessConnectionId` from the message (may be undefined for regular bot messages).
3. `sendTelegramMessage` — accept an optional `businessConnectionId` param and include it in the API body when present.

- [ ] **Step 1: Write failing tests**

Create `src/lib/channels/__tests__/telegram.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { extractTelegramMessage, sendTelegramMessage } from '../telegram'
import type { TelegramUpdate } from '../telegram'

describe('extractTelegramMessage', () => {
  it('extracts fields from a regular bot message', () => {
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 42,
        chat: { id: 99887766, type: 'private' },
        from: { id: 99887766, username: 'gymrat_84', first_name: 'John' },
        text: 'hello',
        date: 1714204800,
      },
    }
    const result = extractTelegramMessage(update)
    expect(result).not.toBeNull()
    expect(result!.externalId).toBe('tg-42')
    expect(result!.chatId).toBe('99887766')
    expect(result!.displayHandle).toBe('@gymrat_84')
    expect(result!.content).toBe('hello')
    expect(result!.businessConnectionId).toBeUndefined()
  })

  it('extracts business_connection_id when present', () => {
    const update: TelegramUpdate = {
      update_id: 2,
      message: {
        message_id: 43,
        business_connection_id: 'biz-conn-abc123',
        chat: { id: 11223344, type: 'private' },
        from: { id: 11223344, username: 'customer1', first_name: 'Alice' },
        text: 'order info',
        date: 1714204900,
      },
    }
    const result = extractTelegramMessage(update)
    expect(result!.businessConnectionId).toBe('biz-conn-abc123')
    expect(result!.chatId).toBe('11223344')
  })

  it('falls back to first_name when no username', () => {
    const update: TelegramUpdate = {
      update_id: 3,
      message: {
        message_id: 44,
        chat: { id: 55667788, type: 'private' },
        from: { id: 55667788, first_name: 'Bob' },
        text: 'hi',
        date: 1714204900,
      },
    }
    expect(extractTelegramMessage(update)!.displayHandle).toBe('Bob')
  })

  it('returns null for non-text updates', () => {
    const update: TelegramUpdate = {
      update_id: 4,
      message: { message_id: 45, chat: { id: 123, type: 'private' }, date: 1714204900 },
    }
    expect(extractTelegramMessage(update)).toBeNull()
  })

  it('returns null for business_connection events (no message field)', () => {
    const update: TelegramUpdate = {
      update_id: 5,
      business_connection: {
        id: 'biz-conn-abc123',
        user: { id: 222, first_name: 'Dealer' },
        user_chat_id: 222,
        date: 1714204900,
        is_enabled: true,
      },
    }
    expect(extractTelegramMessage(update)).toBeNull()
  })
})

describe('sendTelegramMessage', () => {
  it('sends without business_connection_id for regular bot messages', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    await sendTelegramMessage('bot-token', '99887766', 'Hello')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.chat_id).toBe(99887766)
    expect(body.text).toBe('Hello')
    expect(body.business_connection_id).toBeUndefined()
    vi.restoreAllMocks()
  })

  it('includes business_connection_id when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    await sendTelegramMessage('bot-token', '11223344', 'Hi there', 'biz-conn-abc123')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.business_connection_id).toBe('biz-conn-abc123')
    vi.restoreAllMocks()
  })

  it('throws when Telegram responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }))
    await expect(sendTelegramMessage('token', '123', 'Hi')).rejects.toThrow('Telegram sendMessage failed')
    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "c:\Users\alana\OneDrive\Documents\Pep Tech"
npm run test:run -- src/lib/channels/__tests__/telegram.test.ts
```

Expected: FAIL — `business_connection_id` field and optional param do not exist yet.

- [ ] **Step 3: Rewrite `src/lib/channels/telegram.ts`**

Replace the entire file:

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
    businessConnectionId: msg.business_connection_id,
  }
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

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/channels/telegram.ts src/lib/channels/__tests__/telegram.test.ts
git commit -m "feat: add Telegram Business support to channel adapter (business_connection_id)"
```

---

## Task 2: Update webhook route

**Files:**
- Modify: `src/app/api/webhooks/telegram/[tenantId]/route.ts`
- Modify: `src/app/api/webhooks/telegram/[tenantId]/__tests__/route.test.ts`

### What changes

Two new behaviours:

1. **`business_connection` event** — Telegram fires this when the tenant links (or unlinks) their bot in Business settings. When `is_enabled: true`, we store the `business_connection_id` in `tenant_channels.credentials` so the send route can use it for outbound messages.

2. **Auto-capture from first message** — Belt-and-suspenders: if credentials don't yet have `business_connection_id` but the incoming message has one, store it. Handles the case where the connection event fired before the webhook was registered.

- [ ] **Step 1: Replace the test file**

Replace all contents of `src/app/api/webhooks/telegram/[tenantId]/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/webhooks/processor', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1' }),
}))

const { POST } = await import('../route')
const { createServiceClient } = await import('@/lib/supabase/server')
const { processInboundMessage } = await import('@/lib/webhooks/processor')

const TENANT_ID = 'tg-tenant-456'
const BOT_TOKEN = '123456:ABC-DEF'
const BIZ_CONN_ID = 'biz-conn-abc123'

function makeSupabase(channel: unknown) {
  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown, reject?: (v: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve, reject),
    catch: (fn: (v: unknown) => unknown) => Promise.resolve({ error: null }).catch(fn),
    finally: (fn: () => void) => Promise.resolve({ error: null }).finally(fn),
  })
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: channel, error: null }),
      }),
      update: updateFn,
    }),
    _update: updateFn,
  }
}

describe('Telegram webhook POST', () => {
  beforeEach(() => vi.clearAllMocks())

  it('processes a business message and returns 200', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN, business_connection_id: BIZ_CONN_ID } }
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabase(channel))
    const update = {
      update_id: 1,
      message: {
        message_id: 42,
        business_connection_id: BIZ_CONN_ID,
        chat: { id: 99887766, type: 'private' },
        from: { id: 99887766, username: 'gymrat_84', first_name: 'John' },
        text: 'need tirz',
        date: 1714204800,
      },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST',
      body: JSON.stringify(update),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        channelType: 'telegram',
        identifier: '99887766',
        displayHandle: '@gymrat_84',
        content: 'need tirz',
        externalId: 'tg-42',
      }),
    )
  })

  it('stores business_connection_id from business_connection event and returns 200', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN } }
    const supabaseMock = makeSupabase(channel)
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(supabaseMock)
    const update = {
      update_id: 2,
      business_connection: {
        id: BIZ_CONN_ID,
        user: { id: 555, first_name: 'Dealer', username: 'dealer_99' },
        user_chat_id: 555,
        date: 1714204800,
        is_enabled: true,
      },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST',
      body: JSON.stringify(update),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).not.toHaveBeenCalled()
    expect(supabaseMock._update).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: expect.objectContaining({ business_connection_id: BIZ_CONN_ID }),
      }),
    )
  })

  it('auto-captures business_connection_id from first business message if not in credentials', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN } }
    const supabaseMock = makeSupabase(channel)
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(supabaseMock)
    const update = {
      update_id: 3,
      message: {
        message_id: 50,
        business_connection_id: BIZ_CONN_ID,
        chat: { id: 11223344, type: 'private' },
        from: { id: 11223344, username: 'new_customer' },
        text: 'hello',
        date: 1714205000,
      },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST', body: JSON.stringify(update), headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).toHaveBeenCalled()
    expect(supabaseMock._update).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: expect.objectContaining({ business_connection_id: BIZ_CONN_ID }),
      }),
    )
  })

  it('does not call update when business_connection_id is already stored', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN, business_connection_id: BIZ_CONN_ID } }
    const supabaseMock = makeSupabase(channel)
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(supabaseMock)
    const update = {
      update_id: 4,
      message: {
        message_id: 51,
        business_connection_id: BIZ_CONN_ID,
        chat: { id: 11223344, type: 'private' },
        from: { id: 11223344, username: 'returning_customer' },
        text: 'hi again',
        date: 1714205100,
      },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST', body: JSON.stringify(update), headers: { 'Content-Type': 'application/json' },
    })
    await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(supabaseMock._update).not.toHaveBeenCalled()
  })

  it('ignores non-text updates and returns 200', async () => {
    const channel = { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN, business_connection_id: BIZ_CONN_ID } }
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabase(channel))
    const update = {
      update_id: 5,
      message: { message_id: 43, chat: { id: 99887766, type: 'private' }, date: 1714204801 },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST', body: JSON.stringify(update), headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })

  it('returns 404 when tenant has no telegram channel', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabase(null))
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST', body: JSON.stringify({ update_id: 6 }), headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:run -- "src/app/api/webhooks/telegram/\[tenantId\]/__tests__/route.test.ts"
```

Expected: FAIL — route doesn't handle `business_connection` events or auto-capture yet.

- [ ] **Step 3: Rewrite the route**

Replace all contents of `src/app/api/webhooks/telegram/[tenantId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processInboundMessage } from '@/lib/webhooks/processor'
import { extractTelegramMessage } from '@/lib/channels/telegram'
import type { TelegramUpdate } from '@/lib/channels/telegram'

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

  // business_connection event fires when the tenant links/unlinks their bot in Telegram Business settings
  if (update.business_connection) {
    if (update.business_connection.is_enabled && !creds.business_connection_id) {
      await supabase
        .from('tenant_channels')
        .update({ credentials: { ...creds, business_connection_id: update.business_connection.id } })
        .eq('tenant_id', tenantId)
        .eq('channel_type', 'telegram')
    }
    return NextResponse.json({ ok: true })
  }

  const extracted = extractTelegramMessage(update)
  if (!extracted) return NextResponse.json({ ok: true })

  // Auto-capture business_connection_id from first business message if not yet stored
  if (extracted.businessConnectionId && !creds.business_connection_id) {
    await supabase
      .from('tenant_channels')
      .update({ credentials: { ...creds, business_connection_id: extracted.businessConnectionId } })
      .eq('tenant_id', tenantId)
      .eq('channel_type', 'telegram')
  }

  await processInboundMessage(supabase, {
    tenantId,
    channelType: 'telegram',
    identifier: extracted.chatId,
    displayHandle: extracted.displayHandle,
    content: extracted.content,
    externalId: extracted.externalId,
    sentAt: extracted.sentAt,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- "src/app/api/webhooks/telegram/\[tenantId\]/__tests__/route.test.ts"
```

Expected: 6 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/telegram/
git commit -m "feat: Telegram webhook handles business_connection events and auto-captures business_connection_id"
```

---

## Task 3: Update outbound send route

**Files:**
- Modify: `src/app/api/send/route.ts` (lines 48–50)

The Telegram send branch currently reads `bot_token` from credentials but ignores `business_connection_id`. Add it.

- [ ] **Step 1: Update the Telegram branch in `src/app/api/send/route.ts`**

Find this block (around line 48):
```typescript
  } else if (conv.channel_type === 'telegram') {
    const creds = channel.credentials as { bot_token: string }
    await sendTelegramMessage(creds.bot_token, to, text)
  }
```

Replace with:
```typescript
  } else if (conv.channel_type === 'telegram') {
    const creds = channel.credentials as { bot_token: string; business_connection_id?: string }
    await sendTelegramMessage(creds.bot_token, to, text, creds.business_connection_id)
  }
```

- [ ] **Step 2: Run full test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/send/route.ts
git commit -m "feat: pass business_connection_id to Telegram outbound messages"
```

---

## Task 4: Update settings page instructions

**Files:**
- Modify: `src/app/settings/channels/page.tsx` (Telegram connect form, around lines 118–126)

The form currently shows a blank bot token field with no context. Replace it with the same field plus numbered setup steps explaining the Business linking process.

- [ ] **Step 1: Update the Telegram connect form in `src/app/settings/channels/page.tsx`**

Find this block (around line 118):
```tsx
                  <details style={{ width: '100%' }}>
                    <summary className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer', fontSize: 12 }}>Connect</summary>
                    <form action={saveTelegramCredentials as never} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      <input name="botToken" placeholder="Bot token from @BotFather" required style={inputStyle} />
                      <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>Save</button>
                    </form>
                  </details>
```

Replace with:
```tsx
                  <details style={{ width: '100%' }}>
                    <summary className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer', fontSize: 12 }}>Connect</summary>
                    <form action={saveTelegramCredentials as never} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      <input name="botToken" placeholder="Bot token from @BotFather" required style={inputStyle} />
                      <ol style={{ fontSize: 11, color: 'var(--pt-fg-4)', margin: '2px 0 0', paddingLeft: 16, lineHeight: 1.7 }}>
                        <li>Create a silent bot via <span style={{ fontFamily: 'var(--pt-mono)' }}>@BotFather</span> and paste its token above.</li>
                        <li>In Telegram: Settings → Telegram Business → Chatbots → search for your bot and tap Connect.</li>
                        <li>Customers now message your personal account. The bot handles it silently in the background.</li>
                      </ol>
                      <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>Save</button>
                    </form>
                  </details>
```

- [ ] **Step 2: Run full test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/channels/page.tsx
git commit -m "feat: update Telegram settings form with Business setup instructions"
```

---

## Verification Checklist

- [ ] All tests pass (`npm run test:run`)
- [ ] Tenant connects bot token in Settings → Channels → Telegram
- [ ] Tenant links bot in Telegram Settings → Business → Chatbots — webhook receives `business_connection` event, `business_connection_id` appears in `tenant_channels.credentials`
- [ ] Customer messages the tenant's personal Telegram account → appears in inbox
- [ ] Tenant replies from inbox → message arrives from their personal account (not from the bot username)
- [ ] If `business_connection` event missed, first inbound message auto-captures the ID

---

## Notes for the implementer

- `registerTelegramWebhook` in `telegram.ts` is unchanged — bot token setup and webhook registration work exactly as before.
- The `saveTelegramCredentials` server action is unchanged — it still takes a bot token and calls `registerTelegramWebhook`.
- Existing bot-only tenants (no `business_connection_id` in credentials) still work — `sendTelegramMessage` omits the field when `undefined`, falling back to regular bot behaviour.
- Telegram Premium / Business subscription is required on the tenant's personal account for the Business linking step to appear. This is a tenant responsibility, not a platform one.
