# Copilot v2 — Phase 2b: `send_message` (review-and-send)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the copilot draft a message to the customer and deliver it on the operator's approval — with a **review → edit-in-place → send** confirm card (modeled on the automation `PendingApprovalCard`), so the operator can tweak the agent's draft before it goes out.

**Architecture:** A new gated `send_message` agent tool (copilot mode) calls a **service-role-safe, tenant-scoped `deliverMessage` helper** that replicates `/api/send`'s text dispatch (`@/lib/channels/*` per channel + outbound `messages` insert + conversation snippet update) — `/api/send` itself is cookie-gated and not callable from the copilot's background context. The agent's confirm flow gains an optional `editedInput` that the operator's edited text rides through (`confirmToolCall` merges it into the tool input before executing), and the copilot panel renders an editable confirm card for `send_message`.

**Tech Stack:** Next.js 15, TypeScript, Supabase (service-role — explicit tenant scoping mandatory), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-29-copilot-v2-agentic-design.md` (Phase 2b). **Prereqs:** Phases 1–3 merged. **Out of scope:** `generate_payment_link` (the next slice).

**Tenancy:** `deliverMessage` runs on the service-role client (RLS bypassed) → every query MUST `.eq('tenant_id', tenantId)`.

---

## Key facts (from codebase research)

- `/api/send` text dispatch: load `conversations` (`id, tenant_id, channel_type, channel_identifier, customer_id`); load `tenant_channels` (`credentials, is_active`) by `tenant_id` + `channel_type`; recipient `to = conv.channel_identifier`.
  - whatsapp: `sendWhatsAppMessage(to, text, statusCallbackUrl) → Promise<string>` (Twilio sid; creds are ENV: `TWILIO_*`; `tenant_channels.credentials` only has `{phone_number}`). `statusCallbackUrl = ${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio-status`. Throws `TwilioWindowError` (code 63016) when the 24h window is closed.
  - telegram: creds `{ bot_token, business_connection_id? }`; `sendTelegramMessage(bot_token, to, text, business_connection_id) → Promise<void>`.
  - email: creds `GoogleCredentials | MicrosoftCredentials` discriminated by `creds.provider`; `sendGmailMessage(creds, to, 'Re: your message', text)` / `sendMicrosoftMessage(creds, to, 'Re: your message', text) → Promise<void>`.
  - Outbound insert into `messages`: `{ tenant_id, conversation_id, direction:'outbound', content, status:'sent', external_id: sid ?? null }` (no `sent_at` column written).
  - Conversation update: `{ status:'in_progress', last_message_at: <now ISO>, last_message_snippet: 'You: ' + content.slice(0,97) }`.
- `confirmToolCall(sessionId, messageId, toolCallId, confirmed, tenantId, supabase, sink)` (executor.ts) executes `tool.execute(tc.input, supabase, tenantId)` on confirm, persists `tool_calls`, runs `continueTurn`. Adding an optional `editedInput` merged into `tc.input` before execute is additive (ops/onboarding pass none).
- `/api/agent/confirm` body: `{ sessionId, messageId, toolCallId, confirmed }`.
- Copilot panel `confirm` (useCopilotSession) posts that body; `ConfirmEntry` (CopilotPanel) is a plain Approve/Dismiss today. The editable pattern to mirror: `PendingApprovalCard` (`idle → confirming → editing <textarea> → send`).
- The agent already "remembers" what it sent because the `send_message` tool call (with `content`) is in its session history — so no separate `[SENT]` mirroring is needed in this slice.

---

## File Structure

**Create:**
- `src/lib/agent/copilot/deliver.ts` — `deliverMessage(supabase, tenantId, conversationId, content)` (service-role-safe channel dispatch). + test.
- (tool) `sendMessage` AgentTool — added to `src/lib/agent/tools/copilot-commerce.ts`.

**Modify:**
- `src/lib/agent/tools/copilot.ts` — add `sendMessage` to `COPILOT_TOOLS`.
- `src/lib/agent/copilot/system.ts` — mention `send_message` in the prompt.
- `src/lib/agent/executor.ts` — `confirmToolCall` gains optional `editedInput`.
- `src/app/api/agent/confirm/route.ts` — parse + pass `editedInput`.
- `src/components/inbox/copilot/useCopilotSession.ts` — `confirm(messageId, toolCallId, confirmed, editedContent?)`.
- `src/components/inbox/copilot/CopilotPanel.tsx` — editable confirm card for `send_message`.
- `styles/copilot.css` — confirm-edit textarea style.

**Reuse:** `@/lib/channels/*` senders; `TOOL_MAP` (auto-includes `...COPILOT_TOOLS`); the confirm/realtime plumbing.

---

## Task 1: `deliverMessage` helper (service-role-safe, tenant-scoped)

**Files:**
- Create: `src/lib/agent/copilot/deliver.ts`
- Create: `src/lib/agent/copilot/__tests__/deliver.test.ts`

- [ ] **Step 1: Confirm channel import paths/signatures**

Read `src/lib/channels/whatsapp.ts`, `telegram.ts`, `email.ts`. Confirm exact exports: `sendWhatsAppMessage(to, text, statusCallbackUrl?) => Promise<string>`, `TwilioWindowError`, `sendTelegramMessage(botToken, chatId, text, businessConnectionId?) => Promise<void>`, `sendGmailMessage(creds, to, subject, body) => Promise<void>`, `sendMicrosoftMessage(creds, to, subject, body) => Promise<void>`, and the `GoogleCredentials`/`MicrosoftCredentials` types. Use the real paths/names if they differ.

- [ ] **Step 2: Write the failing test**

`src/lib/agent/copilot/__tests__/deliver.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendWhatsAppMessage = vi.fn()
const sendTelegramMessage = vi.fn()
const sendGmailMessage = vi.fn()
const sendMicrosoftMessage = vi.fn()
class TwilioWindowError extends Error { readonly code = 63016 }

vi.mock('@/lib/channels/whatsapp', () => ({ sendWhatsAppMessage, TwilioWindowError }))
vi.mock('@/lib/channels/telegram', () => ({ sendTelegramMessage }))
vi.mock('@/lib/channels/email', () => ({ sendGmailMessage, sendMicrosoftMessage }))

import { deliverMessage } from '../deliver'

function fakeSupabase(opts: { conv: Record<string, unknown> | null; channel: Record<string, unknown> | null; insertedId?: string }) {
  const insert = vi.fn().mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: opts.insertedId ?? 'msg1' }, error: null }) }) })
  const update = vi.fn().mockReturnValue({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) })
  return {
    _insert: insert, _update: update,
    from: vi.fn().mockImplementation((t: string) => {
      if (t === 'conversations') return { select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: opts.conv }) }) }) }), update }
      if (t === 'tenant_channels') return { select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: opts.channel }) }) }) }) }
      if (t === 'messages') return { insert }
      throw new Error('unexpected table ' + t)
    }),
  }
}

beforeEach(() => { sendWhatsAppMessage.mockReset(); sendTelegramMessage.mockReset(); sendGmailMessage.mockReset(); sendMicrosoftMessage.mockReset() })

describe('deliverMessage', () => {
  it('dispatches telegram + inserts outbound + returns messageId', async () => {
    sendTelegramMessage.mockResolvedValue(undefined)
    const sb = fakeSupabase({
      conv: { id: 'c1', tenant_id: 't1', channel_type: 'telegram', channel_identifier: '999' },
      channel: { is_active: true, credentials: { bot_token: 'BOT', business_connection_id: 'BC' } },
    })
    const out = await deliverMessage(sb as never, 't1', 'c1', 'hi there')
    expect(sendTelegramMessage).toHaveBeenCalledWith('BOT', '999', 'hi there', 'BC')
    expect(out).toEqual({ messageId: 'msg1' })
    // outbound row is tenant-scoped + outbound + sent
    expect(sb._insert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 't1', conversation_id: 'c1', direction: 'outbound', status: 'sent', content: 'hi there' }))
  })

  it('returns an error when the channel is inactive', async () => {
    const sb = fakeSupabase({ conv: { id: 'c1', tenant_id: 't1', channel_type: 'telegram', channel_identifier: '999' }, channel: { is_active: false, credentials: null } })
    const out = await deliverMessage(sb as never, 't1', 'c1', 'hi')
    expect('error' in out).toBe(true)
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('maps a closed WhatsApp window to a friendly error', async () => {
    sendWhatsAppMessage.mockRejectedValue(new TwilioWindowError('closed'))
    const sb = fakeSupabase({ conv: { id: 'c1', tenant_id: 't1', channel_type: 'whatsapp', channel_identifier: '+1' }, channel: { is_active: true, credentials: { phone_number: '+1' } } })
    const out = await deliverMessage(sb as never, 't1', 'c1', 'hi') as { error: string }
    expect(out.error).toMatch(/window/i)
  })

  it('returns an error when the conversation is missing', async () => {
    const sb = fakeSupabase({ conv: null, channel: null })
    expect('error' in (await deliverMessage(sb as never, 't1', 'cX', 'hi'))).toBe(true)
  })
})
```

- [ ] **Step 3: Run to verify it fails** — `npm run test:run -- src/lib/agent/copilot/__tests__/deliver.test.ts` → FAIL (module missing).

- [ ] **Step 4: Write the helper**

`src/lib/agent/copilot/deliver.ts`:

```ts
import type { AgentSupabase } from '../types'
import { sendWhatsAppMessage, TwilioWindowError } from '@/lib/channels/whatsapp'
import { sendTelegramMessage } from '@/lib/channels/telegram'
import { sendGmailMessage, sendMicrosoftMessage, type GoogleCredentials, type MicrosoftCredentials } from '@/lib/channels/email'

/** Send a message to the customer in a conversation, from a service-role /
 * background context. Replicates /api/send's text dispatch (which is cookie-
 * gated). Tenant-scoped on every query. Returns the new message id or an error. */
export async function deliverMessage(
  supabase: AgentSupabase, tenantId: string, conversationId: string, content: string,
): Promise<{ messageId: string } | { error: string }> {
  const text = content.trim()
  if (!text) return { error: 'Message is empty' }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, tenant_id, channel_type, channel_identifier, customer_id')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .single()
  if (!conv) return { error: 'Conversation not found' }

  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('credentials, is_active')
    .eq('tenant_id', tenantId)
    .eq('channel_type', conv.channel_type)
    .single()
  if (!channel?.is_active || !channel.credentials) return { error: 'Channel not connected' }

  const to = conv.channel_identifier as string
  const creds = channel.credentials as Record<string, unknown>
  let externalId: string | null = null

  try {
    if (conv.channel_type === 'whatsapp') {
      const statusCallbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/webhooks/twilio-status`
      externalId = await sendWhatsAppMessage(to, text, statusCallbackUrl)
    } else if (conv.channel_type === 'telegram') {
      await sendTelegramMessage(creds.bot_token as string, to, text, creds.business_connection_id as string | undefined)
    } else if (conv.channel_type === 'email') {
      const c = creds as unknown as GoogleCredentials | MicrosoftCredentials
      if (c.provider === 'google') await sendGmailMessage(c as GoogleCredentials, to, 'Re: your message', text)
      else await sendMicrosoftMessage(c as MicrosoftCredentials, to, 'Re: your message', text)
    } else {
      return { error: `Unsupported channel: ${conv.channel_type}` }
    }
  } catch (e) {
    if (e instanceof TwilioWindowError) return { error: 'The 24-hour messaging window has closed — the customer must message first.' }
    return { error: e instanceof Error ? e.message : 'Failed to send' }
  }

  const { data: msg, error: insErr } = await supabase
    .from('messages')
    .insert({ tenant_id: tenantId, conversation_id: conv.id, direction: 'outbound', content: text, status: 'sent', external_id: externalId } as never)
    .select('id')
    .single()
  if (insErr || !msg) return { error: insErr?.message ?? 'Failed to record message' }

  await supabase
    .from('conversations')
    .update({ status: 'in_progress', last_message_at: new Date().toISOString(), last_message_snippet: 'You: ' + text.slice(0, 97) } as never)
    .eq('id', conv.id)
    .eq('tenant_id', tenantId)

  return { messageId: msg.id as string }
}
```

- [ ] **Step 5: Run to verify it passes** — PASS (4 tests).
- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit` → no new errors (fix channel import names if the pre-check found different ones).
```bash
git add src/lib/agent/copilot/deliver.ts src/lib/agent/copilot/__tests__/deliver.test.ts
git commit -m "feat(copilot): service-role-safe deliverMessage (channel dispatch)"
```

---

## Task 2: `send_message` gated tool

**Files:**
- Modify: `src/lib/agent/tools/copilot-commerce.ts`
- Modify: `src/lib/agent/tools/copilot.ts`
- Modify: `src/lib/agent/tools/__tests__/copilot-commerce.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/agent/tools/__tests__/copilot-commerce.test.ts`:

```ts
import { sendMessage } from '../copilot-commerce'

describe('send_message tool', () => {
  it('is gated and summarises the draft', () => {
    expect(sendMessage.name).toBe('send_message')
    expect(sendMessage.requiresConfirmation).toBe(true)
    expect(sendMessage.summarise?.({ conversation_id: 'c1', content: 'Hi Jordan, RETA-10 is in stock.' } as never)).toMatch(/RETA-10/)
  })

  it('forwards to deliverMessage', async () => {
    const mod = await import('@/lib/agent/copilot/deliver')
    const spy = vi.spyOn(mod, 'deliverMessage').mockResolvedValue({ messageId: 'm1' })
    const out = await sendMessage.execute({ conversation_id: 'c1', content: 'hi' } as never, {} as never, 't1')
    expect(spy).toHaveBeenCalledWith({}, 't1', 'c1', 'hi')
    expect(out).toEqual({ messageId: 'm1' })
    spy.mockRestore()
  })
})
```
(If `vi.spyOn` on the module export doesn't work under the transform, `vi.mock('@/lib/agent/copilot/deliver', () => ({ deliverMessage: vi.fn().mockResolvedValue({ messageId: 'm1' }) }))` at the top and assert the mock — keep assertions equivalent.)

- [ ] **Step 2: Run to verify it fails** — FAIL (export missing).

- [ ] **Step 3: Add the tool** to `src/lib/agent/tools/copilot-commerce.ts`

Add the import: `import { deliverMessage } from '@/lib/agent/copilot/deliver'`. Append:

```ts
export const sendMessage: AgentTool = {
  name: 'send_message',
  description: 'Draft and send a message to the CUSTOMER in this conversation (a reply, a quote, a cross-sell offer, or a question like asking for the shipping address). REQUIRES operator approval — the operator reviews and may edit your draft before it is sent, so write it as a ready-to-send message.',
  inputSchema: {
    type: 'object',
    required: ['conversation_id', 'content'],
    properties: {
      conversation_id: { type: 'string', description: 'The conversation_id from your context block.' },
      content: { type: 'string', description: 'The message to send to the customer.' },
    },
  },
  requiresConfirmation: true,
  summarise: (input) => `Send: “${String((input as { content?: string }).content ?? '').slice(0, 80)}”`,
  async execute(raw, supabase, tenantId) {
    const i = raw as { conversation_id: string; content: string }
    return deliverMessage(supabase, tenantId, i.conversation_id, i.content)
  },
}
```

- [ ] **Step 4: Register in `COPILOT_TOOLS`** (`src/lib/agent/tools/copilot.ts`)

Add `sendMessage` to the `./copilot-commerce` import and append it to the `COPILOT_TOOLS` array (after `finalizeOrder`). `TOOL_MAP` already spreads `...COPILOT_TOOLS`, so `confirmToolCall` resolves it automatically.

- [ ] **Step 5: Run tests + type-check** — `npm run test:run -- src/lib/agent/tools` PASS; `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/tools/copilot-commerce.ts src/lib/agent/tools/copilot.ts src/lib/agent/tools/__tests__/copilot-commerce.test.ts
git commit -m "feat(copilot): gated send_message tool"
```

---

## Task 3: Editable approval — `confirmToolCall` + confirm route

Add an optional `editedInput` merged into the tool input before execute, so the operator's edited message rides through. Additive — ops/onboarding pass nothing.

**Files:**
- Modify: `src/lib/agent/executor.ts`
- Modify: `src/app/api/agent/confirm/route.ts`

- [ ] **Step 1: `confirmToolCall` — merge `editedInput`**

In `src/lib/agent/executor.ts`, change `confirmToolCall`'s signature to add a trailing optional param and merge it before execute:

```ts
export async function confirmToolCall(
  sessionId: string,
  messageId: string,
  toolCallId: string,
  confirmed: boolean,
  tenantId: string,
  supabase: AgentSupabase,
  sink: AgentSink,
  editedInput?: Record<string, unknown>,
) {
```
Then where it currently does `if (confirmed) { const tool = TOOL_MAP[tc.name]; try { tc.output = await tool.execute(tc.input, supabase, tenantId) ...`, insert the merge BEFORE `tool.execute`:
```ts
  if (confirmed) {
    if (editedInput) tc.input = { ...tc.input, ...editedInput }
    const tool = TOOL_MAP[tc.name]
    try {
      tc.output = await tool.execute(tc.input, supabase, tenantId)
      tc.status = 'complete'
    } catch (e) {
      tc.output = { error: e instanceof Error ? e.message : 'Tool error' }
      tc.status = 'complete'
    }
  } else {
    tc.status = 'rejected'
  }
```
(Merging into `tc.input` means the edited content is also persisted by the existing `agent_messages` update + replayed correctly in history.)

- [ ] **Step 2: confirm route — accept + pass `editedInput`**

In `src/app/api/agent/confirm/route.ts`, extend the body parse and the call:
```ts
const { sessionId, messageId, toolCallId, confirmed, editedInput } = await request.json() as {
  sessionId?: string; messageId?: string; toolCallId?: string; confirmed?: boolean; editedInput?: Record<string, unknown>
}
```
Leave the required-field guard unchanged, and pass `editedInput` as the final arg to `confirmToolCall(sessionId, messageId, toolCallId, confirmed, tenantId, supabase, createSseSink(controller), editedInput)`. (Read the file to match its exact call.)

- [ ] **Step 3: Type-check + regression** — `npx tsc --noEmit` clean; `npm run test:run -- src/lib/agent` PASS (existing agent tests unaffected — editedInput is optional).
- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/executor.ts src/app/api/agent/confirm/route.ts
git commit -m "feat(copilot): confirmToolCall accepts editedInput (operator-edited drafts)"
```

---

## Task 4: Thread `editedContent` through the panel hook

**Files:**
- Modify: `src/components/inbox/copilot/useCopilotSession.ts`

- [ ] **Step 1: Extend `confirm`**

Change the `confirm` callback to accept an optional edited message and include it as `editedInput`:
```ts
  const confirm = useCallback(async (messageId: string, toolCallId: string, confirmed: boolean, editedContent?: string) => {
    if (!sessionId) return
    const res = await fetch('/api/agent/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId, messageId, toolCallId, confirmed,
        ...(editedContent !== undefined ? { editedInput: { content: editedContent } } : {}),
      }),
    })
    await res.text().catch(() => {})
  }, [sessionId])
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → no new errors.
```bash
git add src/components/inbox/copilot/useCopilotSession.ts
git commit -m "feat(copilot): confirm() forwards an edited message as editedInput"
```

---

## Task 5: Editable review-and-send confirm card

For `send_message` confirm cards, render an editable composer (review → edit → Send) modeled on `PendingApprovalCard`; other gated tools (`finalize_order`) keep the plain Approve/Dismiss.

**Files:**
- Modify: `src/components/inbox/copilot/CopilotPanel.tsx`
- Modify: `styles/copilot.css`

- [ ] **Step 1: Make `handleConfirm` carry an edited message + widen `onConfirm`**

In `CopilotPanel.tsx`:
- Change `handleConfirm` to accept an optional edited content and forward it:
  ```ts
  async function handleConfirm(messageId: string, toolCallId: string, confirmed: boolean, editedContent?: string) {
    if (confirming.has(toolCallId)) return
    setConfirming(s => new Set(s).add(toolCallId))
    try { await confirm(messageId, toolCallId, confirmed, editedContent) }
    finally { setConfirming(s => { const n = new Set(s); n.delete(toolCallId); return n }) }
  }
  ```
- `renderMessage`'s `onConfirm` type becomes `(messageId: string, toolCallId: string, confirmed: boolean, editedContent?: string) => void`. Update the `ConfirmEntry` `onApprove`/`onDismiss` wiring to pass the edited content for sends (below).

- [ ] **Step 2: Rewrite `ConfirmEntry` to branch on `send_message`**

Replace the `ConfirmEntry` component with one that, for `send_message`, shows the draft as an editable textarea (review → edit → Send), and for everything else keeps the plain Approve/Dismiss:

```tsx
function ConfirmEntry({ tc, onApprove, onDismiss, busy }: {
  tc: CopilotToolCall
  onApprove: (editedContent?: string) => void
  onDismiss: () => void
  busy: boolean
}) {
  const isSend = tc.name === 'send_message'
  const initial = isSend ? String((tc.input as { content?: string }).content ?? '') : ''
  const [edited, setEdited] = useState(initial)
  const resolved = tc.status === 'complete' || tc.status === 'rejected'

  if (isSend && !resolved) {
    return (
      <div className="pt-cp-entry">
        <div className="pt-cp-confirm">
          <div className="pt-cp-confirm-eyebrow">Reply to customer — review &amp; send</div>
          <textarea className="pt-cp-confirm-edit" value={edited} rows={3}
            onChange={e => setEdited(e.target.value)} aria-label="Message to send" />
          <div className="pt-cp-confirm-btns">
            <button className="pt-cp-approve" onClick={() => onApprove(edited)} disabled={busy || !edited.trim()}>Send</button>
            <button className="pt-cp-dismiss" onClick={onDismiss} disabled={busy}>Discard</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-cp-entry">
      <div className={`pt-cp-confirm${resolved ? ' is-resolved' : ''}`}>
        <div className="pt-cp-confirm-eyebrow">Needs your nod</div>
        <div className="pt-cp-confirm-summary">{confirmSummary(tc)}</div>
        {tc.status === 'pending' && (
          <div className="pt-cp-confirm-btns">
            <button className="pt-cp-approve" onClick={() => onApprove()} disabled={busy}>Approve</button>
            <button className="pt-cp-dismiss" onClick={onDismiss} disabled={busy}>Not now</button>
          </div>
        )}
        {tc.status === 'complete' && <div className="pt-cp-confirm-btns"><span className="pt-cp-confirm-done"><CheckSvg /> Done</span></div>}
        {tc.status === 'rejected' && <div className="pt-cp-confirm-btns"><span className="pt-cp-confirm-skip">Skipped</span></div>}
      </div>
    </div>
  )
}
```
(Add `import { useState } from 'react'` is already present. `confirmSummary` already maps `finalize_order`; add a `send_message` case returning the content if you like, though the editable branch handles sends.)

In `renderMessage`, the `ConfirmEntry` call becomes:
```tsx
nodes.push(<ConfirmEntry key={`${m.id}-${tc.id}`} tc={tc} busy={confirmingIds.has(tc.id)}
  onApprove={(editedContent) => onConfirm(m.id, tc.id, true, editedContent)} onDismiss={() => onConfirm(m.id, tc.id, false)} />)
```

Also include `send_message` resolved cards in the feed: in `renderMessage`, change `resolvedGated` to also surface resolved `send_message` so a sent reply shows as "Done":
```ts
const resolvedGated = m.toolCalls.filter(tc => (tc.status === 'complete' || tc.status === 'rejected') && (tc.name === 'finalize_order' || tc.name === 'send_message'))
```

- [ ] **Step 3: Add the textarea style** — append to `styles/copilot.css`:

```css
.pt-cp-confirm-edit {
  width: 100%; box-sizing: border-box; margin: 6px 0 2px;
  border: 1px solid var(--pt-line); border-radius: 9px;
  background: var(--pt-bg); color: var(--pt-fg);
  padding: 9px 11px; font: inherit; font-size: 13px; line-height: 1.5; resize: vertical;
}
.pt-cp-confirm-edit:focus { outline: none; border-color: var(--pt-accent); box-shadow: 0 0 0 3px var(--pt-accent-soft); }
```

- [ ] **Step 4: Type-check** — `npx tsc --noEmit` → no new errors in `CopilotPanel.tsx`.
- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/copilot/CopilotPanel.tsx styles/copilot.css
git commit -m "feat(copilot): review-and-send editable confirm card for send_message"
```

---

## Task 6: Prompt the agent about `send_message`

**Files:**
- Modify: `src/lib/agent/copilot/system.ts`

- [ ] **Step 1: Add a line to `buildCopilotSystem`'s "What you can do" list**

In the capabilities section, add:
```
- REPLY to the customer with send_message — draft a ready-to-send reply, quote, cross-sell offer, or a question (e.g. asking for the shipping address). It is gated: the operator reviews and may edit your draft before it sends, so write the full message, not a description of it.
```
And update the line that lists the context-bound tools to include `send_message` (it also takes the conversation_id). Keep the rest of the prompt unchanged.

- [ ] **Step 2: Update the prompt test if it asserts exact tool lists**

If `src/lib/agent/copilot/__tests__/system.test.ts` asserts specific tool names, add `send_message`/keep it passing. Run: `npm run test:run -- src/lib/agent/copilot/__tests__/system.test.ts` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/copilot/system.ts src/lib/agent/copilot/__tests__/system.test.ts
git commit -m "feat(copilot): teach the prompt to use send_message"
```

---

## Task 7: Full-suite + integration sanity

- [ ] **Step 1: Suites** — `npm run test:run -- src/lib/agent src/lib/copilot src/components/inbox/copilot` → pass.
- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → no new errors.
- [ ] **Step 3: Integration (deploy + OpenRouter key + a connected channel), `copilot_enabled=true`:**
  1. Inbound customer message that warrants a reply ("is RETA-10 in stock?"). The copilot should call `send_message` → a **review-and-send card** appears in the Copilot panel with the drafted reply in an editable textarea.
  2. Edit the text, click **Send** → the (edited) message is delivered to the customer on the real channel, appears as an **outbound message in the main conversation window**, and the card resolves to "Done".
  3. Click **Discard** on another draft → it resolves to "Skipped"; nothing is sent.
  4. WhatsApp 24h-window-closed case → the card surfaces the friendly "window has closed" error (the tool returns it; confirm it doesn't crash the turn).
- [ ] **Step 4: Commit any fixes.**

---

## Verification (whole plan)

- **Unit:** `deliverMessage` (per-channel dispatch, tenant-scoped outbound insert, inactive-channel + missing-conversation + closed-window errors); `send_message` tool (gated, summarise, forwards to deliver).
- **Integration:** copilot drafts a reply → editable review-and-send card → edited text delivered + shows in the conversation → card resolves; discard sends nothing; closed-window handled.
- **Regression:** ops/onboarding confirm flow unchanged (editedInput optional, unused there).
- **Tenancy:** every `deliverMessage` query filters by `tenant_id` (service-role client).

## Out of scope

- `generate_payment_link` — the next slice.
- `[SENT]` mirroring of operator messages sent from the MAIN inbox composer (the copilot's own sends are already in its tool-call history; main-composer sends are a separate later enhancement).
- Media/template/attachment sends (text only here, matching the copilot's needs).
