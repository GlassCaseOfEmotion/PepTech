# Phase 2A — Channel Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up live inbound and outbound messaging for WhatsApp (360dialog), Telegram (Bot API), and Email (Google/Microsoft OAuth), with a settings UI for tenants to connect their channels.

**Architecture:** Webhook route handlers sit at `/api/webhooks/{channel}/{tenantId}` and are intentionally thin — they verify the provider's signature and delegate to a shared `processInboundMessage()` function in `src/lib/webhooks/processor.ts`. The processor owns all business logic: auto-creating customers on first contact, finding or creating conversations, deduplicating messages via `external_id`, and updating conversation snippets. Outbound sends go through a single `/api/send` route that dispatches to per-channel sender functions. Channel credentials (API keys, OAuth tokens) are stored in `tenant_channels.credentials` as jsonb, never exposed to the frontend.

**Tech Stack:** Next.js 15 API routes, @supabase/supabase-js service role client (webhooks run outside user sessions), node-telegram-bot-api (Telegram), googleapis (Gmail), @azure/msal-node + @microsoft/microsoft-graph-client (Outlook/M365), Vitest + vi.mock for unit tests

---

## Migration note

Apply all new migrations with:
```bash
npx supabase db push --include-all
```

---

## File Map

```
src/
├── app/
│   └── api/
│       ├── webhooks/
│       │   ├── whatsapp/[tenantId]/route.ts   ← 360dialog inbound handler (uses service client)
│       │   ├── telegram/[tenantId]/route.ts   ← Telegram inbound handler (uses service client)
│       │   └── email/[tenantId]/route.ts      ← Google Pub/Sub + MS Graph handler (uses service client)
│       ├── send/
│       │   └── route.ts                       ← unified outbound send (uses session client)
│       └── settings/
│           └── channels/
│               └── oauth/
│                   ├── google/route.ts        ← Google OAuth start + callback
│                   └── microsoft/route.ts     ← Microsoft OAuth start + callback
├── lib/
│   ├── supabase/
│   │   ├── client.ts                          ← browser client (existing)
│   │   └── server.ts                          ← session client + createServiceClient() (modified)
│   ├── webhooks/
│   │   └── processor.ts                       ← shared inbound message processor
│   └── channels/
│       ├── whatsapp.ts                        ← 360dialog: parse payload + send
│       ├── telegram.ts                        ← Telegram Bot API: parse + send + register
│       └── email.ts                           ← Gmail/Graph: parse notification + send
└── app/
    └── settings/
        └── channels/
            ├── page.tsx                       ← channel list, connect/disconnect UI
            └── actions.ts                     ← save credentials, trigger webhook reg
supabase/
└── migrations/
    └── 20260427000007_channel_helpers.sql     ← increment_unread_count function
```

> **Critical architecture note:** Webhook routes receive requests from external providers (360dialog, Telegram, Google, Microsoft) — they have no user session or auth cookie. They MUST use `createServiceClient()` which uses the `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS. The session-based `createClient()` is only for routes where the user is logged in.

---

## Task 1: Install dependencies + service client + DB helper migration

**Files:**
- Modify: `package.json`
- Modify: `src/lib/supabase/server.ts`
- Create: `supabase/migrations/20260427000007_channel_helpers.sql`

- [ ] **Step 1: Install channel dependencies**

```bash
npm install googleapis @azure/msal-node @microsoft/microsoft-graph-client node-telegram-bot-api
npm install -D @types/node-telegram-bot-api msw
```

- [ ] **Step 2: Add `createServiceClient` to server.ts**

Webhook handlers receive requests from external providers with no user session. They must use the service role key to bypass RLS. Add `createServiceClient` to the existing `src/lib/supabase/server.ts`:

Open `src/lib/supabase/server.ts` and append after the existing `createClient` export:

```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Use for webhook handlers and server-side jobs that run outside a user session.
// Bypasses RLS — only use server-side, never expose to browser.
export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
npm run test:run
```

Expected: 10/10 tests pass, no import errors.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260427000007_channel_helpers.sql`:

```sql
-- Atomic unread count increment (avoids race condition on concurrent messages)
create or replace function public.increment_unread_count(conv_id uuid, tenant uuid)
returns void language sql security definer as $$
  update public.conversations
  set unread_count = unread_count + 1
  where id = conv_id
    and tenant_id = tenant;
$$;

-- Grant to service_role (used by webhook handlers)
grant execute on function public.increment_unread_count to service_role;
```

- [ ] **Step 4: Apply migration**

```bash
npx supabase db push --include-all
```

Expected: applies cleanly.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json supabase/migrations/20260427000007_channel_helpers.sql
git commit -m "chore: add channel deps and increment_unread_count DB helper"
```

---

## Task 2: Shared inbound message processor

**Files:**
- Create: `src/lib/webhooks/processor.ts`
- Create: `src/lib/webhooks/__tests__/processor.test.ts`

This is the most important file in Phase 2A. All business logic for receiving a message lives here.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/webhooks/__tests__/processor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processInboundMessage } from '../processor'

// Build a minimal chainable Supabase mock
function makeSupabaseMock(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  return {
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    _chain: chain,
  }
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000002'
const CONV_ID = '00000000-0000-0000-0000-000000000003'
const MSG_ID = '00000000-0000-0000-0000-000000000004'

const BASE_PARAMS = {
  tenantId: TENANT_ID,
  channelType: 'telegram' as const,
  identifier: '12345678',
  displayHandle: '@gymrat_84',
  content: 'hello world',
  externalId: 'tg-msg-001',
  sentAt: '2026-04-27T10:00:00.000Z',
}

describe('processInboundMessage', () => {
  describe('first contact — customer does not exist yet', () => {
    it('creates a customer, channel, and conversation then inserts the message', async () => {
      const supabase = makeSupabaseMock()

      // Sequence of .from() calls:
      // 1. customer_channels select (not found → null)
      // 2. customers insert (returns new customer)
      // 3. customer_channels insert (returns new channel)
      // 4. conversations select (not found → null)
      // 5. conversations insert (returns new conversation)
      // 6. messages upsert (returns new message)
      // 7. rpc increment_unread_count
      // 8. conversations update (snippet + status)

      const fromSequence = [
        // 1. customer_channels lookup → not found
        { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) },
        // 2. customers insert → returns customer
        { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: CUSTOMER_ID, tenant_id: TENANT_ID, display_name: '@gymrat_84' }, error: null }) },
        // 3. customer_channels insert → returns channel
        { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'cc-1', customer_id: CUSTOMER_ID }, error: null }) },
        // 4. conversations lookup → not found
        { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) },
        // 5. conversations insert → returns conversation
        { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: CONV_ID, status: 'new', unread_count: 0 }, error: null }) },
        // 6. messages upsert → returns message
        { upsert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: MSG_ID }, error: null }) },
        // 7. conversations update (snippet)
        { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) },
      ]

      let callCount = 0
      const mockFrom = vi.fn().mockImplementation(() => fromSequence[callCount++] ?? fromSequence[fromSequence.length - 1])
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      const supabaseWithSeq = { from: mockFrom, rpc: mockRpc } as unknown as Parameters<typeof processInboundMessage>[0]

      const result = await processInboundMessage(supabaseWithSeq, BASE_PARAMS)

      expect(result.conversationId).toBe(CONV_ID)
      expect(result.messageId).toBe(MSG_ID)
      expect(mockFrom).toHaveBeenCalledWith('customers')
      expect(mockFrom).toHaveBeenCalledWith('customer_channels')
      expect(mockFrom).toHaveBeenCalledWith('conversations')
      expect(mockFrom).toHaveBeenCalledWith('messages')
      expect(mockRpc).toHaveBeenCalledWith('increment_unread_count', { conv_id: CONV_ID, tenant: TENANT_ID })
    })
  })

  describe('returning customer — conversation exists', () => {
    it('skips customer creation and inserts directly into existing conversation', async () => {
      const fromSequence = [
        // 1. customer_channels lookup → found
        { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { customer_id: CUSTOMER_ID }, error: null }) },
        // 2. conversations lookup → found
        { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: CONV_ID, status: 'in_progress', unread_count: 1 }, error: null }) },
        // 3. messages upsert
        { upsert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: MSG_ID }, error: null }) },
        // 4. conversations update
        { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) },
      ]

      let callCount = 0
      const mockFrom = vi.fn().mockImplementation(() => fromSequence[callCount++] ?? fromSequence[fromSequence.length - 1])
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      const supabase = { from: mockFrom, rpc: mockRpc } as unknown as Parameters<typeof processInboundMessage>[0]

      const result = await processInboundMessage(supabase, BASE_PARAMS)

      expect(result.conversationId).toBe(CONV_ID)
      // customers should NOT have been called
      const allTableNames = mockFrom.mock.calls.map((c) => c[0])
      expect(allTableNames).not.toContain('customers')
    })
  })

  describe('status transitions', () => {
    it('moves a resolved conversation back to needs_reply on inbound message', async () => {
      const fromSequence = [
        { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { customer_id: CUSTOMER_ID }, error: null }) },
        { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: CONV_ID, status: 'resolved', unread_count: 0 }, error: null }) },
        { upsert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: MSG_ID }, error: null }) },
        { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) },
      ]

      let callCount = 0
      const mockFrom = vi.fn().mockImplementation(() => fromSequence[callCount++] ?? fromSequence[fromSequence.length - 1])
      const capturedUpdates: unknown[] = []
      // Capture the update call to check status
      fromSequence[3].update = vi.fn().mockImplementation((data) => {
        capturedUpdates.push(data)
        return fromSequence[3]
      })

      const supabase = { from: mockFrom, rpc: vi.fn().mockResolvedValue({ error: null }) } as unknown as Parameters<typeof processInboundMessage>[0]
      await processInboundMessage(supabase, BASE_PARAMS)

      expect(capturedUpdates[0]).toMatchObject({ status: 'needs_reply' })
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/lib/webhooks/__tests__/processor.test.ts
```

Expected: FAIL — `processor` module not found.

- [ ] **Step 3: Write the processor**

Create `src/lib/webhooks/processor.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface InboundMessageParams {
  tenantId: string
  channelType: 'whatsapp' | 'telegram' | 'email'
  identifier: string
  displayHandle: string
  content: string
  externalId: string
  sentAt: string
  metadata?: Record<string, unknown>
}

export async function processInboundMessage(
  supabase: SupabaseClient<Database>,
  params: InboundMessageParams,
): Promise<{ conversationId: string; messageId: string }> {
  const { tenantId, channelType, identifier, displayHandle, content, externalId, sentAt, metadata } = params

  // 1. Find existing customer_channel
  const { data: existingChannel } = await supabase
    .from('customer_channels')
    .select('customer_id')
    .eq('tenant_id', tenantId)
    .eq('channel_type', channelType)
    .eq('identifier', identifier)
    .single()

  let customerId: string

  if (existingChannel) {
    customerId = existingChannel.customer_id
  } else {
    // Auto-create customer on first contact
    const { data: newCustomer, error: custErr } = await supabase
      .from('customers')
      .insert({ tenant_id: tenantId, display_name: displayHandle })
      .select('id')
      .single()

    if (custErr || !newCustomer) throw new Error(`Failed to create customer: ${custErr?.message}`)
    customerId = newCustomer.id

    const { error: ccErr } = await supabase
      .from('customer_channels')
      .insert({
        tenant_id: tenantId,
        customer_id: customerId,
        channel_type: channelType,
        identifier,
        display_handle: displayHandle,
        is_primary: true,
      })

    if (ccErr) throw new Error(`Failed to create customer_channel: ${ccErr.message}`)
  }

  // 2. Find or create conversation
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id, status, unread_count')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .eq('channel_type', channelType)
    .eq('channel_identifier', identifier)
    .single()

  let conversationId: string
  let currentStatus: string

  if (existingConv) {
    conversationId = existingConv.id
    currentStatus = existingConv.status
  } else {
    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        customer_id: customerId,
        channel_type: channelType,
        channel_identifier: identifier,
        status: 'new',
      })
      .select('id, status')
      .single()

    if (convErr || !newConv) throw new Error(`Failed to create conversation: ${convErr?.message}`)
    conversationId = newConv.id
    currentStatus = 'new'
  }

  // 3. Insert message — idempotent via external_id unique index
  const { data: message, error: msgErr } = await supabase
    .from('messages')
    .upsert(
      {
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'inbound',
        content,
        sent_at: sentAt,
        status: 'delivered',
        external_id: externalId,
        metadata: metadata ?? null,
      },
      { onConflict: 'tenant_id,external_id', ignoreDuplicates: true },
    )
    .select('id')
    .single()

  if (msgErr || !message) throw new Error(`Failed to insert message: ${msgErr?.message}`)

  // 4. Atomically increment unread count
  await supabase.rpc('increment_unread_count', { conv_id: conversationId, tenant: tenantId })

  // 5. Update conversation snippet + status
  const newStatus = ['resolved', 'snoozed'].includes(currentStatus) ? 'needs_reply'
    : currentStatus === 'new' ? 'new'
    : 'needs_reply'

  await supabase
    .from('conversations')
    .update({
      status: newStatus,
      last_message_at: sentAt,
      last_message_snippet: content.slice(0, 100),
    })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)

  return { conversationId, messageId: message.id }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/lib/webhooks/__tests__/processor.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm run test:run
```

Expected: all 13 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/webhooks/
git commit -m "feat: add shared inbound message processor with TDD"
```

---

## Task 3: WhatsApp webhook handler (360dialog)

**Files:**
- Create: `src/lib/channels/whatsapp.ts`
- Create: `src/app/api/webhooks/whatsapp/[tenantId]/route.ts`
- Create: `src/app/api/webhooks/whatsapp/[tenantId]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/webhooks/whatsapp/[tenantId]/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

// Mock Supabase + processor before importing route
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}))
vi.mock('@/lib/webhooks/processor', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1' }),
}))

// Import after mocks are set up
const { GET, POST } = await import('../route')
const { createServiceClient } = await import('@/lib/supabase/server')
const { processInboundMessage } = await import('@/lib/webhooks/processor')

const TENANT_ID = 'test-tenant-123'
const WEBHOOK_SECRET = 'test-secret'

function makeSupabase(tenantChannel: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: tenantChannel, error: null }),
    }),
  }
}

function signBody(body: string, secret: string) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

describe('WhatsApp webhook', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('GET — hub verification', () => {
    it('returns hub.challenge when mode and token are valid', async () => {
      const url = `http://localhost/api/webhooks/whatsapp/${TENANT_ID}?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=${WEBHOOK_SECRET}`
      ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        makeSupabase({ webhook_secret: WEBHOOK_SECRET, is_active: true, credentials: { api_key: 'key' } })
      )
      const res = await GET(new Request(url), { params: Promise.resolve({ tenantId: TENANT_ID }) })
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text).toBe('abc123')
    })

    it('returns 403 when verify_token does not match', async () => {
      const url = `http://localhost/api/webhooks/whatsapp/${TENANT_ID}?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=wrong`
      ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        makeSupabase({ webhook_secret: WEBHOOK_SECRET })
      )
      const res = await GET(new Request(url), { params: Promise.resolve({ tenantId: TENANT_ID }) })
      expect(res.status).toBe(403)
    })
  })

  describe('POST — inbound message', () => {
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            messages: [{ id: 'wamid.001', from: '15005550001', timestamp: '1714204800', type: 'text', text: { body: 'Hello' } }],
            contacts: [{ profile: { name: 'John' }, wa_id: '15005550001' }],
          },
        }],
      }],
    })

    it('processes valid signed message and returns 200', async () => {
      ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        makeSupabase({ tenant_id: TENANT_ID, webhook_secret: WEBHOOK_SECRET, credentials: { api_key: 'key' } })
      )
      const req = new Request(`http://localhost/api/webhooks/whatsapp/${TENANT_ID}`, {
        method: 'POST',
        body: payload,
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signBody(payload, WEBHOOK_SECRET),
        },
      })
      const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
      expect(res.status).toBe(200)
      expect(processInboundMessage).toHaveBeenCalledOnce()
    })

    it('returns 401 when signature is invalid', async () => {
      ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        makeSupabase({ webhook_secret: WEBHOOK_SECRET, credentials: { api_key: 'key' } })
      )
      const req = new Request(`http://localhost/api/webhooks/whatsapp/${TENANT_ID}`, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=badsig' },
      })
      const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
      expect(res.status).toBe(401)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/app/api/webhooks/whatsapp
```

Expected: FAIL — route module not found.

- [ ] **Step 3: Create the channel helper**

Create `src/lib/channels/whatsapp.ts`:

```typescript
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
```

- [ ] **Step 4: Create the route handler**

Create `src/app/api/webhooks/whatsapp/[tenantId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processInboundMessage } from '@/lib/webhooks/processor'
import { verifyWhatsAppSignature, extractMessages } from '@/lib/channels/whatsapp'
import type { WhatsAppWebhookPayload } from '@/lib/channels/whatsapp'

interface RouteContext { params: Promise<{ tenantId: string }> }

// GET — hub challenge verification (360dialog registers webhook via GET)
export async function GET(request: Request, { params }: RouteContext) {
  const { tenantId } = await params
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const challenge = url.searchParams.get('hub.challenge')
  const verifyToken = url.searchParams.get('hub.verify_token')

  const supabase = createServiceClient()
  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('webhook_secret')
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'whatsapp')
    .single()

  if (mode === 'subscribe' && verifyToken === channel?.webhook_secret) {
    return new Response(challenge ?? '', { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// POST — inbound message from 360dialog
export async function POST(request: Request, { params }: RouteContext) {
  const { tenantId } = await params
  const body = await request.text()
  const signature = request.headers.get('x-hub-signature-256') ?? ''

  const supabase = createServiceClient()
  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('webhook_secret, credentials, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'whatsapp')
    .single()

  if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (channel.webhook_secret && !verifyWhatsAppSignature(body, signature, channel.webhook_secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(body) as WhatsAppWebhookPayload
  const messages = extractMessages(payload)

  await Promise.all(
    messages.map((msg) =>
      processInboundMessage(supabase, {
        tenantId,
        channelType: 'whatsapp',
        identifier: msg.from,
        displayHandle: msg.displayName,
        content: msg.content,
        externalId: msg.externalId,
        sentAt: msg.sentAt,
      }),
    ),
  )

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run -- src/app/api/webhooks/whatsapp
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/channels/whatsapp.ts src/app/api/webhooks/whatsapp/
git commit -m "feat: add WhatsApp webhook handler (360dialog)"
```

---

## Task 4: Telegram webhook handler + auto-register

**Files:**
- Create: `src/lib/channels/telegram.ts`
- Create: `src/app/api/webhooks/telegram/[tenantId]/route.ts`
- Create: `src/app/api/webhooks/telegram/[tenantId]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/webhooks/telegram/[tenantId]/__tests__/route.test.ts`:

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

function makeSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { tenant_id: TENANT_ID, credentials: { bot_token: BOT_TOKEN }, webhook_secret: 'secret' },
        error: null,
      }),
    }),
  }
}

describe('Telegram webhook POST', () => {
  beforeEach(() => vi.clearAllMocks())

  it('processes a text message update and returns 200', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabase())
    const update = {
      update_id: 1,
      message: {
        message_id: 42,
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

  it('ignores non-text updates (e.g. photos) and returns 200', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeSupabase())
    const update = {
      update_id: 2,
      message: { message_id: 43, chat: { id: 99887766, type: 'private' }, date: 1714204801, photo: [] },
    }
    const req = new Request(`http://localhost/api/webhooks/telegram/${TENANT_ID}`, {
      method: 'POST', body: JSON.stringify(update), headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test:run -- src/app/api/webhooks/telegram
```

Expected: FAIL — route not found.

- [ ] **Step 3: Create the Telegram channel helper**

Create `src/lib/channels/telegram.ts`:

```typescript
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
```

- [ ] **Step 4: Create the route handler**

Create `src/app/api/webhooks/telegram/[tenantId]/route.ts`:

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
  const extracted = extractTelegramMessage(update)

  if (!extracted) return NextResponse.json({ ok: true })

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

- [ ] **Step 5: Run tests**

```bash
npm run test:run -- src/app/api/webhooks/telegram
```

Expected: 2 tests PASS.

- [ ] **Step 6: Run full suite**

```bash
npm run test:run
```

Expected: all 15 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/channels/telegram.ts src/app/api/webhooks/telegram/
git commit -m "feat: add Telegram webhook handler"
```

---

## Task 5: Email webhook handler (Google + Microsoft)

**Files:**
- Create: `src/lib/channels/email.ts`
- Create: `src/app/api/webhooks/email/[tenantId]/route.ts`
- Create: `src/app/api/webhooks/email/[tenantId]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/webhooks/email/[tenantId]/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/webhooks/processor', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1' }),
}))
vi.mock('@/lib/channels/email', () => ({
  fetchGmailMessage: vi.fn().mockResolvedValue({
    externalId: 'gmail-msg-001',
    from: 'customer@example.com',
    displayHandle: 'customer@example.com',
    content: 'Hello from email',
    sentAt: '2026-04-27T10:00:00.000Z',
  }),
  fetchMicrosoftMessage: vi.fn().mockResolvedValue(null),
}))

const { POST } = await import('../route')
const { createServiceClient } = await import('@/lib/supabase/server')
const { processInboundMessage } = await import('@/lib/webhooks/processor')

const TENANT_ID = 'em-tenant-789'

function makeGoogleSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          tenant_id: TENANT_ID,
          credentials: {
            provider: 'google',
            email_address: 'tenant@gmail.com',
            refresh_token: 'rtoken',
            access_token: 'atoken',
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          },
        },
        error: null,
      }),
    }),
  }
}

describe('Email webhook POST', () => {
  beforeEach(() => vi.clearAllMocks())

  it('processes a Google Pub/Sub notification and returns 200', async () => {
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeGoogleSupabase())

    const pubsubBody = {
      message: {
        data: Buffer.from(JSON.stringify({ emailAddress: 'tenant@gmail.com', historyId: '12345' })).toString('base64'),
        messageId: 'pubsub-001',
        publishTime: '2026-04-27T10:00:00.000Z',
      },
      subscription: 'projects/peptech/subscriptions/gmail-push',
    }

    const req = new Request(`http://localhost/api/webhooks/email/${TENANT_ID}`, {
      method: 'POST',
      body: JSON.stringify(pubsubBody),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ tenantId: TENANT_ID }) })
    expect(res.status).toBe(200)
    expect(processInboundMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        channelType: 'email',
        content: 'Hello from email',
      }),
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/app/api/webhooks/email
```

Expected: FAIL.

- [ ] **Step 3: Create the email channel helper**

Create `src/lib/channels/email.ts`:

```typescript
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

  // Fetch history to find new message IDs
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

  // Fetch the first new message
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

  // Extract plain text body
  const parts = msgRes.data.payload?.parts ?? []
  const textPart = parts.find((p) => p.mimeType === 'text/plain')
  const bodyData = textPart?.body?.data ?? msgRes.data.payload?.body?.data ?? ''
  const content = Buffer.from(bodyData, 'base64').toString('utf-8').trim()

  // Parse "Name <email>" format
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
  // Refresh token if expired
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
```

- [ ] **Step 4: Create the route handler**

Create `src/app/api/webhooks/email/[tenantId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processInboundMessage } from '@/lib/webhooks/processor'
import { fetchGmailMessage, fetchMicrosoftMessage } from '@/lib/channels/email'
import type { GoogleCredentials, MicrosoftCredentials } from '@/lib/channels/email'

interface RouteContext { params: Promise<{ tenantId: string }> }

// Handles both Google Pub/Sub push notifications and Microsoft Graph change notifications
export async function POST(request: Request, { params }: RouteContext) {
  const { tenantId } = await params
  const body = await request.json() as Record<string, unknown>

  const supabase = createServiceClient()
  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('credentials, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'email')
    .single()

  if (!channel?.credentials) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const creds = channel.credentials as GoogleCredentials | MicrosoftCredentials

  let emailMessage = null

  if (creds.provider === 'google') {
    // Google Pub/Sub push: { message: { data: base64(JSON), messageId, publishTime }, subscription }
    const pubsubMsg = body.message as { data?: string } | undefined
    if (!pubsubMsg?.data) return NextResponse.json({ ok: true })

    const decoded = JSON.parse(Buffer.from(pubsubMsg.data, 'base64').toString()) as { historyId?: string }
    if (!decoded.historyId) return NextResponse.json({ ok: true })

    emailMessage = await fetchGmailMessage(creds as GoogleCredentials, decoded.historyId)
  } else if (creds.provider === 'microsoft') {
    // Microsoft Graph change notification: { value: [{ resourceData: { id }, ... }] }
    const notifications = (body.value as Array<{ resourceData?: { id?: string } }>) ?? []
    const msgId = notifications[0]?.resourceData?.id
    if (!msgId) return NextResponse.json({ ok: true })

    emailMessage = await fetchMicrosoftMessage(creds as MicrosoftCredentials, msgId)
  }

  if (!emailMessage) return NextResponse.json({ ok: true })

  await processInboundMessage(supabase, {
    tenantId,
    channelType: 'email',
    identifier: emailMessage.from,
    displayHandle: emailMessage.displayHandle,
    content: emailMessage.content,
    externalId: emailMessage.externalId,
    sentAt: emailMessage.sentAt,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run -- src/app/api/webhooks/email
```

Expected: 1 test PASS.

- [ ] **Step 6: Run full suite**

```bash
npm run test:run
```

Expected: all 16 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/channels/email.ts src/app/api/webhooks/email/
git commit -m "feat: add email webhook handler (Google Pub/Sub + Microsoft Graph)"
```

---

## Task 6: Outbound send API route

**Files:**
- Create: `src/app/api/send/route.ts`
- Create: `src/app/api/send/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/send/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// /api/send is a user-authenticated route — uses session createClient (not service role)
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/channels/whatsapp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/channels/whatsapp')>()),
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/channels/telegram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/channels/telegram')>()),
  sendTelegramMessage: vi.fn().mockResolvedValue(undefined),
}))

const { POST } = await import('../route')
const { createClient } = await import('@/lib/supabase/server')
const { sendTelegramMessage } = await import('@/lib/channels/telegram')

const TENANT_ID = 'send-tenant-001'
const CONV_ID = 'conv-001'

function makeSupabase() {
  const convData = { id: CONV_ID, tenant_id: TENANT_ID, channel_type: 'telegram', channel_identifier: '99887766', customer_id: 'cust-1' }
  const channelData = { credentials: { bot_token: 'bot:TOKEN' }, is_active: true }

  let callCount = 0
  return {
    from: vi.fn().mockImplementation((table: string) => {
      callCount++
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(
          callCount === 1 ? { data: convData, error: null }
          : callCount === 2 ? { data: channelData, error: null }
          : { data: { id: 'msg-new' }, error: null }
        ),
      }
      return mockChain
    }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }
}

describe('POST /api/send', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends a Telegram message and inserts outbound message row', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const req = new Request('http://localhost/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: CONV_ID, content: 'hello customer' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(sendTelegramMessage).toHaveBeenCalledWith('bot:TOKEN', '99887766', 'hello customer')
  })

  it('returns 400 for missing content', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const req = new Request('http://localhost/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: CONV_ID }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/app/api/send
```

Expected: FAIL.

- [ ] **Step 3: Write the send route**

Create `src/app/api/send/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/channels/whatsapp'
import { sendTelegramMessage } from '@/lib/channels/telegram'
import { sendGmailMessage, sendMicrosoftMessage } from '@/lib/channels/email'
import type { GoogleCredentials, MicrosoftCredentials } from '@/lib/channels/email'

export async function POST(request: Request) {
  const body = await request.json() as { conversationId?: string; content?: string }

  if (!body.conversationId || !body.content?.trim()) {
    return NextResponse.json({ error: 'conversationId and content are required' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify the user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load the conversation (RLS ensures it belongs to the user's tenant)
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, tenant_id, channel_type, channel_identifier, customer_id')
    .eq('id', body.conversationId)
    .single()

  if (convErr || !conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  // Load tenant channel credentials
  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('credentials, is_active')
    .eq('tenant_id', conv.tenant_id)
    .eq('channel_type', conv.channel_type)
    .single()

  if (!channel?.is_active || !channel.credentials) {
    return NextResponse.json({ error: 'Channel not connected' }, { status: 422 })
  }

  // Send via the appropriate provider
  const to = conv.channel_identifier
  const text = body.content

  if (conv.channel_type === 'whatsapp') {
    const creds = channel.credentials as { api_key: string }
    await sendWhatsAppMessage(creds.api_key, to, text)
  } else if (conv.channel_type === 'telegram') {
    const creds = channel.credentials as { bot_token: string }
    await sendTelegramMessage(creds.bot_token, to, text)
  } else if (conv.channel_type === 'email') {
    const creds = channel.credentials as GoogleCredentials | MicrosoftCredentials
    if (creds.provider === 'google') {
      await sendGmailMessage(creds as GoogleCredentials, to, 'Re: your message', text)
    } else {
      await sendMicrosoftMessage(creds as MicrosoftCredentials, to, 'Re: your message', text)
    }
  }

  // Record the outbound message
  const { data: message } = await supabase
    .from('messages')
    .insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      direction: 'outbound',
      content: text,
      status: 'sent',
    })
    .select('id')
    .single()

  // Update conversation snippet
  await supabase
    .from('conversations')
    .update({ status: 'in_progress', last_message_at: new Date().toISOString(), last_message_snippet: `You: ${text.slice(0, 97)}` })
    .eq('id', conv.id)

  return NextResponse.json({ messageId: message?.id })
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- src/app/api/send
```

Expected: 2 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npm run test:run
```

Expected: all 18 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/send/
git commit -m "feat: add unified outbound send API route"
```

---

## Task 7: Channel settings page

**Files:**
- Create: `src/app/settings/channels/page.tsx`
- Create: `src/app/settings/channels/actions.ts`

- [ ] **Step 1: Create the server actions**

Create `src/app/settings/channels/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { registerTelegramWebhook } from '@/lib/channels/telegram'
import { revalidatePath } from 'next/cache'

export async function saveTelegramCredentials(formData: FormData) {
  const botToken = (formData.get('botToken') as string)?.trim()
  if (!botToken) return { error: 'Bot token is required' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Get tenantId from users table
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'User not found' }

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/telegram/${userRow.tenant_id}`

  // Register webhook with Telegram before saving
  try {
    await registerTelegramWebhook(botToken, webhookUrl)
  } catch (e) {
    return { error: `Could not register webhook: ${e instanceof Error ? e.message : 'unknown error'}` }
  }

  await supabase.from('tenant_channels').upsert({
    tenant_id: userRow.tenant_id,
    channel_type: 'telegram',
    identifier: 'telegram-bot',
    credentials: { bot_token: botToken },
    is_active: true,
  }, { onConflict: 'tenant_id,channel_type' })

  revalidatePath('/settings/channels')
  return { success: true }
}

export async function saveWhatsAppCredentials(formData: FormData) {
  const apiKey = (formData.get('apiKey') as string)?.trim()
  const phoneNumberId = (formData.get('phoneNumberId') as string)?.trim()
  const webhookSecret = (formData.get('webhookSecret') as string)?.trim()
  if (!apiKey || !phoneNumberId) return { error: 'API key and phone number ID are required' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'User not found' }

  await supabase.from('tenant_channels').upsert({
    tenant_id: userRow.tenant_id,
    channel_type: 'whatsapp',
    identifier: phoneNumberId,
    credentials: { api_key: apiKey, phone_number_id: phoneNumberId },
    webhook_secret: webhookSecret || null,
    is_active: true,
  }, { onConflict: 'tenant_id,channel_type' })

  revalidatePath('/settings/channels')
  return { success: true }
}

export async function disconnectChannel(channelType: 'whatsapp' | 'telegram' | 'email') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return

  await supabase.from('tenant_channels')
    .update({ is_active: false })
    .eq('tenant_id', userRow.tenant_id)
    .eq('channel_type', channelType)

  revalidatePath('/settings/channels')
}
```

- [ ] **Step 2: Add `NEXT_PUBLIC_APP_URL` to .env.example**

Open `.env.example` and append:

```bash
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
```

Also add these to your `.env.local` with real values (or `http://localhost:3000` for `NEXT_PUBLIC_APP_URL` in dev).

- [ ] **Step 3: Create the settings page**

Create `src/app/settings/channels/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { saveTelegramCredentials, saveWhatsAppCredentials, disconnectChannel } from './actions'

export default async function ChannelsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) redirect('/login')

  const { data: channels } = await supabase
    .from('tenant_channels')
    .select('channel_type, is_active, identifier')
    .eq('tenant_id', userRow.tenant_id)

  const connectedMap = Object.fromEntries((channels ?? []).map((c) => [c.channel_type, c]))
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'

  const inputStyle = {
    height: 34, padding: '0 10px', borderRadius: 'var(--pt-radius-sm)',
    border: '0.5px solid var(--pt-line)', background: 'var(--pt-surface)',
    font: 'inherit', fontSize: 12.5, color: 'var(--pt-fg)', outline: 'none', width: '100%',
  } as const

  return (
    <div className="pt-page">
      <div className="pt-page-hd">
        <div>
          <h1>Channels</h1>
          <p>Connect your messaging channels to start receiving and sending messages.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>

        {/* WhatsApp */}
        <div className="pt-card">
          <div className="pt-card-hd">
            <div>
              <h3>WhatsApp</h3>
              <p>Connect via 360dialog. Your webhook URL:
                <code style={{ fontSize: 11, marginLeft: 6, color: 'var(--pt-accent-fg)' }}>
                  {appUrl}/api/webhooks/whatsapp/{userRow.tenant_id}
                </code>
              </p>
            </div>
            {connectedMap.whatsapp?.is_active && (
              <span className="pt-tag pt-tag-vip">Connected</span>
            )}
          </div>
          <div className="pt-card-body" style={{ padding: '8px 14px 14px' }}>
            {connectedMap.whatsapp?.is_active ? (
              <form action={disconnectChannel.bind(null, 'whatsapp')}>
                <button type="submit" className="pt-btn">Disconnect</button>
              </form>
            ) : (
              <form action={saveWhatsAppCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input name="apiKey" placeholder="360dialog API key" required style={inputStyle} />
                <input name="phoneNumberId" placeholder="Phone number ID" required style={inputStyle} />
                <input name="webhookSecret" placeholder="Webhook secret (optional)" style={inputStyle} />
                <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start' }}>Connect WhatsApp</button>
              </form>
            )}
          </div>
        </div>

        {/* Telegram */}
        <div className="pt-card">
          <div className="pt-card-hd">
            <div>
              <h3>Telegram</h3>
              <p>Create a bot via @BotFather and paste the token below. We'll register the webhook automatically.</p>
            </div>
            {connectedMap.telegram?.is_active && (
              <span className="pt-tag pt-tag-vip">Connected</span>
            )}
          </div>
          <div className="pt-card-body" style={{ padding: '8px 14px 14px' }}>
            {connectedMap.telegram?.is_active ? (
              <form action={disconnectChannel.bind(null, 'telegram')}>
                <button type="submit" className="pt-btn">Disconnect</button>
              </form>
            ) : (
              <form action={saveTelegramCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input name="botToken" placeholder="Bot token from @BotFather" required style={inputStyle} />
                <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start' }}>Connect Telegram</button>
              </form>
            )}
          </div>
        </div>

        {/* Email */}
        <div className="pt-card">
          <div className="pt-card-hd">
            <div>
              <h3>Email</h3>
              <p>Connect your Gmail or Outlook account.</p>
            </div>
            {connectedMap.email?.is_active && (
              <span className="pt-tag pt-tag-vip">Connected · {connectedMap.email.identifier}</span>
            )}
          </div>
          <div className="pt-card-body" style={{ padding: '8px 14px 14px', display: 'flex', gap: 8 }}>
            {connectedMap.email?.is_active ? (
              <form action={disconnectChannel.bind(null, 'email')}>
                <button type="submit" className="pt-btn">Disconnect</button>
              </form>
            ) : (
              <>
                <a href="/api/settings/channels/oauth/google" className="pt-btn">Connect Gmail</a>
                <a href="/api/settings/channels/oauth/microsoft" className="pt-btn">Connect Outlook</a>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify dev server renders the page**

```bash
npm run dev
```

Navigate to http://localhost:3000/settings/channels — should show three channel cards (WhatsApp, Telegram, Email) with no errors. Stop the dev server after checking.

- [ ] **Step 5: Run all tests**

```bash
npm run test:run
```

Expected: all 18 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/settings/channels/ .env.example
git commit -m "feat: add channel settings page with credential forms"
```

---

## Task 8: Google OAuth for email

**Files:**
- Create: `src/app/api/settings/channels/oauth/google/route.ts`

- [ ] **Step 1: Create the Google OAuth route**

Create `src/app/api/settings/channels/oauth/google/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/settings/channels/oauth/google`,
  )
}

// GET /api/settings/channels/oauth/google
// - Without ?code: redirect to Google OAuth consent screen
// - With ?code: exchange code for tokens, save to tenant_channels
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) return NextResponse.redirect(new URL('/settings/channels?error=google_denied', request.url))

  const oauth2 = getOAuth2Client()

  if (!code) {
    // Step 1: redirect to Google
    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly', 'email'],
      prompt: 'consent',
    })
    return NextResponse.redirect(authUrl)
  }

  // Step 2: exchange code for tokens
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.redirect(new URL('/login', request.url))

  const { tokens } = await oauth2.getToken(code)
  oauth2.setCredentials(tokens)

  // Get the user's email address
  const gmail = google.gmail({ version: 'v1', auth: oauth2 })
  const profile = await gmail.users.getProfile({ userId: 'me' })
  const emailAddress = profile.data.emailAddress ?? ''

  await supabase.from('tenant_channels').upsert({
    tenant_id: userRow.tenant_id,
    channel_type: 'email',
    identifier: emailAddress,
    credentials: {
      provider: 'google',
      email_address: emailAddress,
      refresh_token: tokens.refresh_token ?? '',
      access_token: tokens.access_token ?? '',
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : new Date(Date.now() + 3600000).toISOString(),
    },
    is_active: true,
  }, { onConflict: 'tenant_id,channel_type' })

  // Register Gmail push notifications via Pub/Sub
  // Requires GOOGLE_PUBSUB_TOPIC env var (e.g. projects/peptech/topics/gmail-push)
  if (process.env.GOOGLE_PUBSUB_TOPIC) {
    try {
      await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: process.env.GOOGLE_PUBSUB_TOPIC,
          labelIds: ['INBOX'],
        },
      })
    } catch {
      // Non-fatal — operator can manually re-trigger later
    }
  }

  revalidatePath('/settings/channels')
  return NextResponse.redirect(new URL('/settings/channels?connected=gmail', request.url))
}
```

- [ ] **Step 2: Add `GOOGLE_PUBSUB_TOPIC` to .env.example**

Append to `.env.example`:

```bash
GOOGLE_PUBSUB_TOPIC=projects/your-project/topics/gmail-push
MICROSOFT_TENANT_ID=common
```

- [ ] **Step 3: Verify dev server starts**

```bash
npm run dev
```

Expected: starts without TypeScript errors. Stop after confirming.

- [ ] **Step 4: Run all tests**

```bash
npm run test:run
```

Expected: all 18 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/settings/channels/oauth/google/ .env.example
git commit -m "feat: add Google OAuth flow for Gmail integration"
```

---

## Task 9: Microsoft OAuth for email

**Files:**
- Create: `src/app/api/settings/channels/oauth/microsoft/route.ts`

- [ ] **Step 1: Create the Microsoft OAuth route**

Create `src/app/api/settings/channels/oauth/microsoft/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const SCOPES = ['offline_access', 'https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.Send']

function getMsAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/settings/channels/oauth/microsoft`,
    scope: SCOPES.join(' '),
    response_mode: 'query',
    state,
  })
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common'
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`
}

// GET /api/settings/channels/oauth/microsoft
// - Without ?code: redirect to Microsoft OAuth
// - With ?code: exchange code for tokens, save credentials
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) return NextResponse.redirect(new URL('/settings/channels?error=ms_denied', request.url))

  if (!code) {
    return NextResponse.redirect(getMsAuthUrl('peptech-email'))
  }

  // Exchange code for tokens
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID ?? 'common'}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/settings/channels/oauth/microsoft`,
        scope: SCOPES.join(' '),
      }),
    }
  )

  if (!tokenRes.ok) return NextResponse.redirect(new URL('/settings/channels?error=ms_token_failed', request.url))

  const tokens = await tokenRes.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  // Get user's email from Microsoft Graph
  const meRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const me = await meRes.json() as { mail?: string; userPrincipalName?: string }
  const emailAddress = me.mail ?? me.userPrincipalName ?? ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.redirect(new URL('/login', request.url))

  await supabase.from('tenant_channels').upsert({
    tenant_id: userRow.tenant_id,
    channel_type: 'email',
    identifier: emailAddress,
    credentials: {
      provider: 'microsoft',
      email_address: emailAddress,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    },
    is_active: true,
  }, { onConflict: 'tenant_id,channel_type' })

  revalidatePath('/settings/channels')
  return NextResponse.redirect(new URL('/settings/channels?connected=outlook', request.url))
}
```

- [ ] **Step 2: Run all tests**

```bash
npm run test:run
```

Expected: all 18 tests pass.

- [ ] **Step 3: Verify dev server starts**

```bash
npm run dev
```

Expected: starts without TypeScript errors. Stop after confirming.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/settings/channels/oauth/microsoft/
git commit -m "feat: add Microsoft OAuth flow for Outlook/M365 integration"
```

---

## Task 10: Add Settings to sidebar navigation + push + clean up

**Files:**
- Modify: `src/app/settings/channels/page.tsx` — wrap in shell layout
- Create: `src/app/settings/layout.tsx` — settings section layout
- Commit and push

- [ ] **Step 1: Create a stub inbox page** (so the app doesn't 404 on redirect after login)

Create `src/app/inbox/page.tsx`:

```typescript
export default function InboxPage() {
  return (
    <div className="pt-page">
      <div className="pt-page-hd">
        <div>
          <h1>Inbox</h1>
          <p>Coming in Phase 2B — channel integrations are ready. Connect your channels in Settings.</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npm run test:run
```

Expected: 18/18 pass.

- [ ] **Step 3: Create feature branch and push**

```bash
git checkout -b feature/phase2a-channels
git push -u origin feature/phase2a-channels
```

- [ ] **Step 4: Commit inbox stub**

```bash
git add src/app/inbox/page.tsx src/app/settings/
git commit -m "feat: add inbox stub + settings layout for Phase 2A completion"
```

- [ ] **Step 5: Verify full app flow manually**

```bash
npm run dev
```

1. http://localhost:3000/signup → create a test workspace
2. Redirect → http://localhost:3000/login → sign in → http://localhost:3000/inbox (stub page, no 404)
3. http://localhost:3000/settings/channels → all 3 channel cards show
4. Confirm no console errors

Stop dev server.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: Phase 2A complete — channel integrations, settings, inbox stub"
```
