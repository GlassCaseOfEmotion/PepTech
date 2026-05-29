# Copilot v2 — Phase 1: Transport-Agnostic Core + Watch/Narrate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent loop run in two transports on one session, add a per-conversation "copilot" agent session, and have an inbound customer message run a headless agent turn that watches the conversation and narrates via a `post_commentary` tool — all with the existing ops/onboarding agent behavior unchanged.

**Architecture:** Replace the executor's hardwired SSE `send()` callback with an `AgentSink` abstraction (streaming sink for the live panel, headless sink for background work) and select a streaming vs non-streaming completion based on the sink. Add a `'copilot'` agent mode (read tools + `post_commentary`), a copilot session per conversation (`trigger='copilot'`, `trigger_ref=conversationId`), and a `runCopilotWatch` that mirrors the inbound message into the session and runs one headless turn. This realizes the spec's "transport-agnostic core" by parameterizing `executor.ts` in place (lower risk than moving files); the conceptual core is the sink-driven loop.

**Tech Stack:** Next.js 15, TypeScript, Supabase, OpenRouter (OpenAI SDK), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-29-copilot-v2-agentic-design.md` (this is Phase 1 of 3).

**No schema migrations:** `agent_sessions.trigger` has no CHECK constraint, and `trigger_ref` already exists — copilot sessions reuse both. `agent_messages.role` is free text; mirrored messages use `role:'user'` with a `[CUSTOMER]`/`[SENT]` content prefix.

---

## File Structure

**Create:**
- `src/lib/agent/sink.ts` — `AgentSink` interface + `createSseSink(controller)` + `createHeadlessSink()`.
- `src/lib/agent/copilot/system.ts` — `buildCopilotSystem()` (the `'copilot'` mode system prompt).
- `src/lib/agent/copilot/session.ts` — `getOrCreateCopilotSession(supabase, tenantId, conversationId)`.
- `src/lib/agent/copilot/watch.ts` — `runCopilotWatch(supabase, params)` (gate + debounce + mirror + headless turn). Replaces v1 `runCopilotPass` at the processor call site.
- `src/lib/agent/tools/copilot.ts` — `postCommentary` tool + `COPILOT_TOOLS` array.
- Tests under `src/lib/agent/**/__tests__/`.

**Modify:**
- `src/lib/agent/types.ts` — add `'copilot'` to `AgentSession.trigger`.
- `src/lib/agent/tools/index.ts` — add `'copilot'` to `AgentMode`; wire `COPILOT_TOOLS` into `toolsForMode`/`openAiToolsForMode`/`TOOL_MAP`.
- `src/lib/agent/executor.ts` — replace `controller`/`send` with `AgentSink`; add `nonStreamCompletion`; pick streaming vs non-streaming by `sink.streaming`; extend `modeForSession`/`buildSystemForTurn` for `'copilot'`. Behavior for ops/onboarding unchanged.
- `src/app/api/agent/chat/route.ts` and `src/app/api/agent/confirm/route.ts` — pass `createSseSink(controller)` instead of the raw controller.
- `src/lib/webhooks/processor.ts` — call `runCopilotWatch` instead of `runCopilotPass`.

**Reuse (do not rebuild):** the existing tool loop, `requiresConfirmation` gating, `TERMINAL_TOOLS`, empty-completion retry, `MAX_CONTINUATION_DEPTH` recursion, `loadHistory`/`saveUserMessage`/`saveAssistantMessage`, the read tools, the v1 `copilot_enabled` gate + latest-inbound debounce (lifted from `src/lib/copilot/run.ts`), and `after()` in the processor.

---

## Task 1: `AgentSink` abstraction

**Files:**
- Create: `src/lib/agent/sink.ts`
- Create: `src/lib/agent/__tests__/sink.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/agent/__tests__/sink.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createSseSink, createHeadlessSink } from '../sink'
import type { SseEvent } from '../types'

describe('createSseSink', () => {
  it('encodes events as SSE frames onto the controller and is streaming', () => {
    const chunks: string[] = []
    const controller = { enqueue: (b: Uint8Array) => chunks.push(new TextDecoder().decode(b)) }
    const sink = createSseSink(controller as never)
    expect(sink.streaming).toBe(true)
    sink.emit({ type: 'text', delta: 'hi' } as SseEvent)
    expect(chunks[0]).toBe(`data: ${JSON.stringify({ type: 'text', delta: 'hi' })}\n\n`)
  })
})

describe('createHeadlessSink', () => {
  it('records emitted events and is not streaming', () => {
    const sink = createHeadlessSink()
    expect(sink.streaming).toBe(false)
    sink.emit({ type: 'done', sessionId: 's1' })
    sink.emit({ type: 'error', message: 'x' })
    expect(sink.events).toEqual([{ type: 'done', sessionId: 's1' }, { type: 'error', message: 'x' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/agent/__tests__/sink.test.ts`
Expected: FAIL — cannot find module `../sink`.

- [ ] **Step 3: Write the sink**

`src/lib/agent/sink.ts`:

```ts
import type { SseEvent } from './types'

/** Transport abstraction for an agent turn. The streaming sink writes SSE
 * frames to the live panel; the headless sink (background work) records events
 * but does not stream — message persistence happens in the executor regardless. */
export interface AgentSink {
  emit: (e: SseEvent) => void
  streaming: boolean
}

export function createSseSink(controller: ReadableStreamDefaultController<Uint8Array>): AgentSink {
  const encoder = new TextEncoder()
  return {
    streaming: true,
    emit: (e: SseEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)),
  }
}

export interface HeadlessSink extends AgentSink {
  events: SseEvent[]
}

export function createHeadlessSink(): HeadlessSink {
  const events: SseEvent[] = []
  return {
    streaming: false,
    events,
    emit: (e: SseEvent) => { events.push(e) },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/agent/__tests__/sink.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/sink.ts src/lib/agent/__tests__/sink.test.ts
git commit -m "feat(agent): AgentSink abstraction (SSE + headless transports)"
```

---

## Task 2: `'copilot'` mode plumbing in types + tools

**Files:**
- Modify: `src/lib/agent/types.ts`
- Create: `src/lib/agent/tools/copilot.ts`
- Modify: `src/lib/agent/tools/index.ts`
- Create: `src/lib/agent/tools/__tests__/copilot-mode.test.ts`

- [ ] **Step 1: Add `'copilot'` to the session trigger union**

In `src/lib/agent/types.ts`, change the `AgentSession.trigger` field:

```ts
  trigger: 'user' | 'automation' | 'schedule' | 'onboarding' | 'copilot'
```

- [ ] **Step 2: Write the `post_commentary` tool + copilot tool set**

`src/lib/agent/tools/copilot.ts`:

```ts
import type { AgentTool } from '../types'
import { queryCustomers, getCustomer, queryOrders, getOrder, queryCatalog, getAnalytics, getConversationMessages } from './read'

/** The copilot narrates to the operator by calling this. It performs no DB
 * write — the narration is the assistant message the executor persists; this
 * tool just gives the model an explicit, auto-executing way to "say something
 * to the operator" mid-turn and keep going. */
export const postCommentary: AgentTool = {
  name: 'post_commentary',
  description: 'Post a short internal note to the operator about what you are observing or doing in this conversation (e.g. "The customer is asking about RETA-10 stock."). Internal only — the customer never sees it. Use it to narrate; it does not message the customer.',
  inputSchema: {
    type: 'object',
    required: ['note'],
    properties: { note: { type: 'string', description: 'A short operator-facing note.' } },
  },
  requiresConfirmation: false,
  summarise: (input) => String((input as { note?: string }).note ?? ''),
  async execute(raw) {
    const input = raw as { note: string }
    return { posted: true, note: input.note }
  },
}

/** Read tools the copilot may use + post_commentary. No customer-facing or
 * committing tools in Phase 1. */
export const COPILOT_TOOLS: AgentTool[] = [
  queryCustomers, getCustomer, queryOrders, getOrder, queryCatalog, getAnalytics, getConversationMessages,
  postCommentary,
]
```

(If any read-tool export name differs, use the real names — confirm against `src/lib/agent/tools/read.ts`.)

- [ ] **Step 3: Wire `'copilot'` mode into the registry**

In `src/lib/agent/tools/index.ts`:

1. Add the import: `import { COPILOT_TOOLS, postCommentary } from './copilot'`
2. Extend the mode type: `export type AgentMode = 'ops' | 'onboarding' | 'copilot'`
3. Include `postCommentary` in `TOOL_MAP`:
   ```ts
   export const TOOL_MAP: Record<string, AgentTool> = Object.fromEntries(
     [...ALL_TOOLS, ...ONBOARDING_TOOLS, postCommentary].map(t => [t.name, t])
   )
   ```
4. Extend `toolsForMode`:
   ```ts
   export function toolsForMode(mode: AgentMode): AgentTool[] {
     if (mode === 'onboarding') return ONBOARDING_TOOLS
     if (mode === 'copilot') return COPILOT_TOOLS
     return ALL_TOOLS
   }
   ```
   (`openAiToolsForMode` already delegates to `toolsForMode`, so it picks up `'copilot'` automatically.)
5. Re-export: add `COPILOT_TOOLS` to the existing `export { ... }` line.

- [ ] **Step 4: Write the test**

`src/lib/agent/tools/__tests__/copilot-mode.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toolsForMode, openAiToolsForMode, TOOL_MAP } from '../index'
import { postCommentary } from '../copilot'

describe('copilot mode tool set', () => {
  it('exposes read tools + post_commentary, and no write/confirm tools', () => {
    const names = toolsForMode('copilot').map(t => t.name)
    expect(names).toContain('post_commentary')
    expect(names).toContain('query_catalog')
    expect(names).toContain('get_conversation_messages')
    // No customer-facing / committing tools in Phase 1
    expect(names).not.toContain('create_order')
    expect(names).not.toContain('send_message')
  })

  it('post_commentary is auto-execute and registered in TOOL_MAP', () => {
    expect(postCommentary.requiresConfirmation).toBe(false)
    expect(TOOL_MAP['post_commentary']).toBe(postCommentary)
  })

  it('openAiToolsForMode("copilot") returns function schemas', () => {
    const tools = openAiToolsForMode('copilot')
    expect(tools.find(t => t.function.name === 'post_commentary')).toBeTruthy()
  })
})
```

- [ ] **Step 5: Run tests + type-check**

Run: `npm run test:run -- src/lib/agent/tools/__tests__/copilot-mode.test.ts`
Expected: PASS (3 tests).
Run: `npx tsc --noEmit` — confirm no NEW errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/types.ts src/lib/agent/tools/copilot.ts src/lib/agent/tools/index.ts src/lib/agent/tools/__tests__/copilot-mode.test.ts
git commit -m "feat(agent): copilot mode tool set + post_commentary"
```

---

## Task 3: Copilot system prompt

**Files:**
- Create: `src/lib/agent/copilot/system.ts`
- Create: `src/lib/agent/copilot/__tests__/system.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/agent/copilot/__tests__/system.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildCopilotSystem } from '../system'

describe('buildCopilotSystem', () => {
  it('explains the three voices and the watch/narrate job', () => {
    const s = buildCopilotSystem()
    expect(s).toMatch(/\[CUSTOMER\]/)
    expect(s).toMatch(/\[SENT\]/)
    expect(s).toMatch(/\[OPERATOR\]/)
    expect(s).toMatch(/post_commentary/)
    expect(s).toMatch(/never sees|internal/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/agent/copilot/__tests__/system.test.ts`
Expected: FAIL — cannot find module `../system`.

- [ ] **Step 3: Write the prompt**

`src/lib/agent/copilot/system.ts`:

```ts
function dateLine(): string {
  const now = new Date()
  const d = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const t = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
  return `Current date and time: ${d}, ${t}.`
}

export function buildCopilotSystem(): string {
  return `You are the Peptech inbox copilot — an attentive sales assistant that watches a live conversation between the OPERATOR (the seller, your user) and their CUSTOMER, and helps the operator close the sale.

The conversation transcript is fed to you as tagged messages:
- "[CUSTOMER] ..." — what the customer said (inbound).
- "[SENT] ..." — a message the operator has already sent to the customer.
- "[OPERATOR] ..." — a direct instruction to YOU from the operator.
Assistant messages are your own prior turns.

Everything you produce is INTERNAL — the customer never sees it. You do not message the customer in this phase.

Your job right now is to WATCH and NARRATE. When something noteworthy happens (a product question, a buying signal, a reorder cue, a cross-sell opening, an unclear request), call post_commentary with one short, specific operator-facing note (e.g. "Customer's asking RETA-10 stock + price — both are in the catalog."). Use the read tools (query_catalog, get_customer, get_conversation_messages) to ground your observations in real data before commenting. Do not invent products, prices, or facts.

Be concise and useful: comment when there's something worth flagging, stay quiet otherwise. Prefer one good note over several. ${dateLine()}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/agent/copilot/__tests__/system.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/copilot/system.ts src/lib/agent/copilot/__tests__/system.test.ts
git commit -m "feat(copilot): copilot-mode system prompt"
```

---

## Task 4: Sink-parameterize the executor (behavior-preserving)

Replace the SSE-hardwired `send`/`controller` with an `AgentSink`, and choose streaming vs non-streaming completion by `sink.streaming`. Ops/onboarding behavior must be unchanged.

**Files:**
- Modify: `src/lib/agent/executor.ts`
- Modify: `src/app/api/agent/chat/route.ts`
- Modify: `src/app/api/agent/confirm/route.ts`

- [ ] **Step 1: Add a non-streaming completion + import the sink**

In `src/lib/agent/executor.ts`, add the import at the top:

```ts
import type { AgentSink } from './sink'
```

Add a non-streaming sibling of `streamCompletion` (place it right after `streamCompletion`):

```ts
// Non-streaming completion for headless (background) turns — same return shape
// as streamCompletion, but a single request with no token streaming.
async function nonStreamCompletion(
  client: OpenAI,
  system: string,
  history: ChatCompletionMessageParam[],
  sink: AgentSink,
  mode: AgentMode,
): Promise<{ text: string; toolCalls: ToolCall[]; finishReason: string | null }> {
  const completion = await client.chat.completions.create({
    model: modelForMode(mode),
    messages: [{ role: 'system', content: system }, ...history],
    tools: openAiToolsForMode(mode),
  })
  const choice = completion.choices[0]
  const msg = choice?.message
  const text = msg?.content ?? ''
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map(tc => {
    let input: Record<string, unknown> = {}
    try { input = JSON.parse((tc as { function: { arguments: string } }).function.arguments) } catch { /* malformed */ }
    return { id: tc.id, name: (tc as { function: { name: string } }).function.name, input, output: null, status: 'pending' as const }
  })
  if (text) sink.emit({ type: 'text', delta: text })
  return { text, toolCalls, finishReason: choice?.finish_reason ?? null }
}

// Pick the completion strategy for this sink.
async function runCompletion(
  client: OpenAI,
  system: string,
  history: ChatCompletionMessageParam[],
  sink: AgentSink,
  mode: AgentMode,
) {
  return sink.streaming
    ? streamCompletion(client, system, history, (e) => sink.emit(e), mode)
    : nonStreamCompletion(client, system, history, sink, mode)
}
```

(`streamCompletion`'s signature already takes a `send` callback — pass `(e) => sink.emit(e)`. Leave `streamCompletion` itself unchanged.)

- [ ] **Step 2: Replace `controller`/`send` with `sink` in the three entry points**

In `executeAgentTurn`, `continueTurn`, and `confirmToolCall`:
- Change the parameter `controller: ReadableStreamDefaultController<Uint8Array>` to `sink: AgentSink` (in `executeAgentTurn` and `confirmToolCall`; `continueTurn` already takes a `send` callback — change that param to `sink: AgentSink` too for consistency).
- Delete the local `const encoder = new TextEncoder()` and `const send = (e) => controller.enqueue(...)` lines; replace every `send(...)` call with `sink.emit(...)`.
- Replace **every** `streamCompletion(client, system, history, send, mode)` invocation with `runCompletion(client, system, history, sink, mode)`. There are FOUR call sites: the main call in `executeAgentTurn`, its empty-completion retry (`const retry = await streamCompletion(...)`), the main call in `continueTurn`, and its retry. Miss one and it will reference the deleted `send`.
- Where `continueTurn(...)` is called (in `executeAgentTurn` and recursively in `continueTurn`, and in `confirmToolCall`), pass `sink` instead of `send`.

The resulting signatures:
```ts
export async function executeAgentTurn(sessionId: string, userMessage: string, tenantId: string, supabase: AgentSupabase, sink: AgentSink, attachments: { file_ref: string; filename: string; mime_type: string }[] = [])
async function continueTurn(history: ChatCompletionMessageParam[], sessionId: string, tenantId: string, supabase: AgentSupabase, client: OpenAI, sink: AgentSink, mode: AgentMode, depth = 0)
export async function confirmToolCall(sessionId: string, messageId: string, toolCallId: string, confirmed: boolean, tenantId: string, supabase: AgentSupabase, sink: AgentSink)
```

- [ ] **Step 3: Extend `modeForSession` and `buildSystemForTurn` for `'copilot'`**

In `modeForSession`:
```ts
async function modeForSession(sessionId: string, supabase: AgentSupabase): Promise<AgentMode> {
  const { data } = await supabase.from('agent_sessions').select('trigger').eq('id', sessionId).single()
  if (data?.trigger === 'onboarding') return 'onboarding'
  if (data?.trigger === 'copilot') return 'copilot'
  return 'ops'
}
```

Add the import at the top: `import { buildCopilotSystem } from './copilot/system'`

In `buildSystem` / `buildSystemForTurn`, return the copilot prompt for copilot mode. Update `buildSystemForTurn`:
```ts
async function buildSystemForTurn(mode: AgentMode, supabase: AgentSupabase, tenantId: string): Promise<string> {
  if (mode === 'copilot') return buildCopilotSystem()
  if (mode !== 'onboarding') return buildSystem(mode)
  const state = await fetchOnboardingStateSnapshot(supabase, tenantId).catch((e) => {
    console.warn('[executor] failed to fetch onboarding state for system prompt', e)
    return undefined
  })
  return buildSystem(mode, state)
}
```

- [ ] **Step 4: Update the SSE route call sites to pass a sink**

In `src/app/api/agent/chat/route.ts`, add `import { createSseSink } from '@/lib/agent/sink'` and change the call:
```ts
await executeAgentTurn(sid!, message, tenantId, supabase, createSseSink(controller), attachments ?? [])
```

In `src/app/api/agent/confirm/route.ts`, do the same: import `createSseSink` and pass `createSseSink(controller)` where `confirmToolCall(...)` currently receives the raw `controller`. (Read the file first to match its exact call shape.)

- [ ] **Step 5: Type-check + regression test**

Run: `npx tsc --noEmit` — no new errors.
Run: `npm run test:run -- src/lib/agent` — existing agent tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/executor.ts src/app/api/agent/chat/route.ts src/app/api/agent/confirm/route.ts
git commit -m "refactor(agent): drive turns through AgentSink (SSE + headless)"
```

---

## Task 5: Copilot session helper

**Files:**
- Create: `src/lib/agent/copilot/session.ts`
- Create: `src/lib/agent/copilot/__tests__/session.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/agent/copilot/__tests__/session.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { getOrCreateCopilotSession } from '../session'

describe('getOrCreateCopilotSession', () => {
  it('returns the existing copilot session for the conversation if present', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'sess1' } }) }) }) }) }),
      }),
    }
    const id = await getOrCreateCopilotSession(supabase as never, 't1', 'conv1')
    expect(id).toBe('sess1')
  })

  it('creates a new copilot session (trigger=copilot, trigger_ref=conversationId) if none exists', async () => {
    const insertSpy = vi.fn().mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: 'new1' } }) }) })
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
        insert: insertSpy,
      }),
    }
    const id = await getOrCreateCopilotSession(supabase as never, 't1', 'conv1')
    expect(id).toBe('new1')
    expect(insertSpy).toHaveBeenCalledWith({ tenant_id: 't1', trigger: 'copilot', trigger_ref: 'conv1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/agent/copilot/__tests__/session.test.ts`
Expected: FAIL — cannot find module `../session`.

- [ ] **Step 3: Write the helper**

`src/lib/agent/copilot/session.ts`:

```ts
import type { AgentSupabase } from '../types'

/** One copilot agent session per conversation. Identified by
 * trigger='copilot' + trigger_ref=conversationId. Created lazily. */
export async function getOrCreateCopilotSession(
  supabase: AgentSupabase,
  tenantId: string,
  conversationId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('agent_sessions')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('trigger', 'copilot')
    .eq('trigger_ref', conversationId)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const { data: created, error } = await supabase
    .from('agent_sessions')
    .insert({ tenant_id: tenantId, trigger: 'copilot', trigger_ref: conversationId })
    .select('id')
    .single()
  if (error) {
    console.error('[copilot] failed to create session:', error.message)
    return null
  }
  return created?.id ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/agent/copilot/__tests__/session.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/copilot/session.ts src/lib/agent/copilot/__tests__/session.test.ts
git commit -m "feat(copilot): get-or-create per-conversation copilot session"
```

---

## Task 6: `runCopilotWatch` — mirror inbound + run a headless turn

Replaces v1 `runCopilotPass`. Gate on `copilot_enabled`, debounce to the latest inbound message, get/create the copilot session, then run one headless agent turn whose "user message" is the tagged inbound (`[CUSTOMER] ...`). The agent watches + narrates via `post_commentary`; the executor persists its turn to `agent_messages`.

**Files:**
- Create: `src/lib/agent/copilot/watch.ts`
- Create: `src/lib/agent/copilot/__tests__/watch.test.ts`
- Modify: `src/lib/webhooks/processor.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/agent/copilot/__tests__/watch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getOrCreateCopilotSession = vi.fn()
const executeAgentTurn = vi.fn()

vi.mock('../session', () => ({ getOrCreateCopilotSession }))
vi.mock('../../executor', () => ({ executeAgentTurn }))

import { runCopilotWatch } from '../watch'

function fakeSupabase(opts: { enabled: boolean; latestInboundId: string; content?: string }) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tenants') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { copilot_enabled: opts.enabled } }) }) }) }
      }
      if (table === 'messages') {
        return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [{ id: opts.latestInboundId, content: opts.content ?? 'hi' }] }) }) }) }) }) }
      }
      throw new Error('unexpected table ' + table)
    }),
  }
}

const params = { tenantId: 't', conversationId: 'c', customerId: 'cust', messageId: 'm1' }

beforeEach(() => { getOrCreateCopilotSession.mockReset(); executeAgentTurn.mockReset() })

describe('runCopilotWatch', () => {
  it('does nothing when copilot is disabled', async () => {
    await runCopilotWatch(fakeSupabase({ enabled: false, latestInboundId: 'm1' }) as never, params)
    expect(executeAgentTurn).not.toHaveBeenCalled()
  })

  it('skips when a newer inbound exists (debounce)', async () => {
    await runCopilotWatch(fakeSupabase({ enabled: true, latestInboundId: 'm2' }) as never, params)
    expect(executeAgentTurn).not.toHaveBeenCalled()
  })

  it('runs a headless turn with the tagged inbound message', async () => {
    getOrCreateCopilotSession.mockResolvedValue('sess1')
    await runCopilotWatch(fakeSupabase({ enabled: true, latestInboundId: 'm1', content: 'how much is RETA-10?' }) as never, params)
    expect(executeAgentTurn).toHaveBeenCalledOnce()
    const [sid, message] = executeAgentTurn.mock.calls[0]
    expect(sid).toBe('sess1')
    expect(message).toBe('[CUSTOMER] how much is RETA-10?')
  })

  it('never throws when a stage errors', async () => {
    getOrCreateCopilotSession.mockRejectedValue(new Error('boom'))
    await expect(runCopilotWatch(fakeSupabase({ enabled: true, latestInboundId: 'm1' }) as never, params)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/agent/copilot/__tests__/watch.test.ts`
Expected: FAIL — cannot find module `../watch`.

- [ ] **Step 3: Write the watch**

`src/lib/agent/copilot/watch.ts`:

```ts
import type { AgentSupabase } from '../types'
import { executeAgentTurn } from '../executor'
import { createHeadlessSink } from '../sink'
import { getOrCreateCopilotSession } from './session'

export interface CopilotWatchParams {
  tenantId: string
  conversationId: string
  customerId: string
  messageId: string
}

/** Fire-and-forget. Gate on copilot_enabled, debounce to the latest inbound,
 * then run one headless copilot turn over the tagged inbound message. Never throws. */
export async function runCopilotWatch(supabase: AgentSupabase, params: CopilotWatchParams): Promise<void> {
  const tag = `[copilot] conv=${params.conversationId}`
  try {
    // 1. Tenant opt-in gate.
    const { data: tenant } = await supabase
      .from('tenants')
      .select('copilot_enabled')
      .eq('id', params.tenantId)
      .single()
    if (!tenant?.copilot_enabled) { console.log(`${tag} skip: disabled`); return }

    // 2. Debounce — only the latest inbound message runs.
    const { data: latest } = await supabase
      .from('messages')
      .select('id, content')
      .eq('conversation_id', params.conversationId)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
    const latestRow = latest?.[0] as { id: string; content: string } | undefined
    if (latestRow?.id && latestRow.id !== params.messageId) { console.log(`${tag} skip: superseded`); return }

    // 3. Session + headless turn over the tagged inbound.
    const sessionId = await getOrCreateCopilotSession(supabase, params.tenantId, params.conversationId)
    if (!sessionId) { console.log(`${tag} skip: no session`); return }

    const content = latestRow?.content ?? ''
    console.log(`${tag} running copilot turn (msg=${params.messageId})`)
    await executeAgentTurn(sessionId, `[CUSTOMER] ${content}`, params.tenantId, supabase, createHeadlessSink())
    console.log(`${tag} copilot turn complete`)
  } catch (err) {
    console.error(`${tag} watch failed:`, err instanceof Error ? err.message : err)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/agent/copilot/__tests__/watch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Swap the processor trigger**

In `src/lib/webhooks/processor.ts`:
1. Replace the import `import { runCopilotPass } from '@/lib/copilot/run'` with `import { runCopilotWatch } from '@/lib/agent/copilot/watch'`.
2. In the `after()` / fallback block, replace `runCopilotPass(createServiceClient(), copilotParams)` with `runCopilotWatch(createServiceClient(), copilotParams)` (both call sites — the `after()` one and the `catch` fallback). `copilotParams` is unchanged (`{ tenantId, conversationId, customerId, messageId: message.id }`).

- [ ] **Step 6: Type-check + tests**

Run: `npx tsc --noEmit` — no new errors.
Run: `npm run test:run -- src/lib/agent src/lib/webhooks` — all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/copilot/watch.ts src/lib/agent/copilot/__tests__/watch.test.ts src/lib/webhooks/processor.ts
git commit -m "feat(copilot): runCopilotWatch — agentic watch/narrate turn per inbound"
```

---

## Task 7: Full-suite green + integration sanity

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test:run`
Expected: copilot/agent/webhook suites PASS. (Pre-existing component-test load failures from the missing `@testing-library/dom` are unrelated — confirm no NEW failures in `src/lib/agent`, `src/lib/copilot`, `src/lib/webhooks`.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Regression — existing agent unchanged**

Manually (or on the deploy) confirm the ops chat panel and onboarding agent still stream and confirm-gate exactly as before (they now go through `createSseSink`, but behavior should be identical).

- [ ] **Step 4: Integration — copilot watches + narrates**

On the deploy (or local with a real OpenRouter key), with `copilot_enabled = true` for the test tenant:
1. Send an inbound Telegram message with a clear product question ("how much is RETA-10 and is it in stock?").
2. Confirm a copilot `agent_sessions` row exists for the conversation (`trigger='copilot'`, `trigger_ref=<conversationId>`).
3. Confirm `agent_messages` for that session contains the mirrored `[CUSTOMER] ...` user message and an assistant turn that called `post_commentary` (tool_calls) with a sensible note.
4. Confirm Vercel logs show the `[copilot] conv=… running copilot turn` → `copilot turn complete` trace.
5. Send a chit-chat inbound ("thanks!") → the agent should produce little/no commentary (it decides), and must not error.

- [ ] **Step 4 note:** There is no inbox UI for the commentary yet — that's Phase 3. Phase 1 is verified at the data layer (`agent_messages`) + logs.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(copilot): phase-1 integration fixes"
```
(Skip if none.)

---

## Verification (whole plan)

- **Unit:** sink encoding (SSE) + recording (headless); copilot tool-set membership + auto-execute `post_commentary`; copilot system prompt content; session get-or-create (existing vs insert with `trigger_ref`); watch gate/debounce/tagged-turn/never-throws.
- **Regression:** existing `src/lib/agent` tests pass; ops/onboarding agent streams + confirm-gates unchanged after the sink refactor.
- **Integration:** inbound message → copilot session + mirrored `[CUSTOMER]` message + assistant turn with `post_commentary` in `agent_messages`; chit-chat doesn't error.

## Out of scope (Phase 1 — later phases)

- Commerce tools + the `'draft'` order entity (`update_draft_order`, `set_shipping_address`, `send_message`, `finalize_order`, `generate_payment_link`) → **Phase 2**.
- Any inbox UI (commentary timeline, unified chat panel, draft-order surface, retiring v1 cards) → **Phase 3**. Phase 1 is verified via `agent_messages` + logs only.
- `[OPERATOR]` command mirroring + interactive copilot chat → **Phase 3** (Phase 1 only mirrors `[CUSTOMER]`; `[SENT]` mirroring is also deferred to Phase 2/3 where it informs commerce/replies).
- Retiring the v1 `ai_suggestions` pipeline/table → **Phase 3** (Phase 1 leaves v1 code in place but the processor now calls `runCopilotWatch` instead of `runCopilotPass`, so v1 suggestions stop being generated).
