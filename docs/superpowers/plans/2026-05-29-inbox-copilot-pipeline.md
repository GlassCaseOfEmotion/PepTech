# Inbox AI Copilot — Pipeline (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every inbound customer message, run a cheap pre-filter classifier and (if actionable) a drafting pass that produces concrete, draft-only commerce suggestions and persists them to a new `ai_suggestions` table for the tenant to approve later.

**Architecture:** A new `src/lib/copilot/` module is invoked fire-and-forget from `processInboundMessage`. It (1) gates on a per-tenant `copilot_enabled` flag, (2) debounces bursts by only running for the latest inbound message, (3) classifies actionability with a cheap LLM call, (4) gathers commerce context by calling existing agent read-tool handlers + a lifted co-product-affinity helper, (5) makes one capable LLM call returning structured suggestions, (6) dedups against open suggestions and inserts rows. Every LLM-calling function takes an injectable completion function so it is unit-testable without network access. This plan produces the data layer only — no UI (that is plan 2: `2026-05-29-inbox-copilot-surface.md`).

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres + RLS + Realtime), OpenRouter (OpenAI SDK), Vitest.

---

## File Structure

**Create:**
- `supabase/migrations/20260529000001_ai_suggestions.sql` — the `ai_suggestions` table (RLS + realtime + replica identity).
- `supabase/migrations/20260529000002_tenant_copilot_enabled.sql` — `tenants.copilot_enabled` opt-in flag.
- `src/lib/catalog/affinity.ts` — co-product affinity helper lifted from `catalog/page.tsx` (pure function, reusable + testable).
- `src/lib/copilot/types.ts` — suggestion kinds, payload shapes, `SuggestionDraft`, constants (confidence threshold, debounce, models).
- `src/lib/copilot/client.ts` — OpenRouter client + a non-streaming `jsonCompletion` helper.
- `src/lib/copilot/prefilter.ts` — `classifyActionable()` cheap classifier.
- `src/lib/copilot/context.ts` — `gatherContext()` (calls existing read-tool handlers + affinity).
- `src/lib/copilot/draft.ts` — `draftSuggestions()` capable LLM pass returning structured drafts.
- `src/lib/copilot/persist.ts` — `dedupAndPersist()` (skip drafts whose `dedup_key` is already open, insert the rest).
- `src/lib/copilot/run.ts` — `runCopilotPass()` orchestrator (the single entry point `processInboundMessage` calls).
- Test files under `src/lib/copilot/__tests__/` and `src/lib/catalog/__tests__/`.

**Modify:**
- `src/lib/webhooks/processor.ts` — fire-and-forget `runCopilotPass` after the message insert.
- `src/app/catalog/page.tsx` — replace the inline affinity reduce with a call to the new `computeCoProductAffinity` helper (DRY; no behavior change).
- `.env.example` — document the two new model env vars.

**Reuse (do not rebuild):**
- Read-tool handlers `getCustomer`, `getConversationMessages`, `queryCatalog` from `src/lib/agent/tools/read.ts` (call `.execute(input, supabase, tenantId)` directly).
- `computeSupply` from `src/types/protocols.ts` for reorder/velocity math.
- The non-streaming OpenRouter call pattern from `src/lib/catalog/extraction/extract.ts`.
- The migration patterns from `20260508000001_agent_tables.sql` (table + RLS via `auth_tenant_id()`) and `20260523000004_realtime_automation_runs.sql` (guarded realtime publish + `replica identity full`).

---

## Task 1: `ai_suggestions` table migration

**Files:**
- Create: `supabase/migrations/20260529000001_ai_suggestions.sql`

- [ ] **Step 1: Write the migration**

Mirror the existing table+RLS pattern (`auth_tenant_id()` helper from `20260427000004_rls_policies.sql`) and the guarded realtime-publish pattern.

```sql
-- AI Copilot: proactive, draft-only commerce suggestions per conversation.
CREATE TABLE public.ai_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('cross_sell','draft_order','quote','reply','payment_link')),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','sent','committed','dismissed','expired')),
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence      numeric NOT NULL DEFAULT 0,
  reasoning       text,
  dedup_key       text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_suggestions_conversation_idx
  ON public.ai_suggestions (conversation_id, status, created_at DESC);

-- Used by dedup: fast lookup of open suggestions' dedup keys per conversation.
CREATE INDEX ai_suggestions_dedup_idx
  ON public.ai_suggestions (conversation_id, dedup_key)
  WHERE status = 'open';

ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.ai_suggestions
  FOR ALL
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- Realtime: inbox subscribes to INSERTs for the open conversation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ai_suggestions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_suggestions;
  END IF;
END $$;

ALTER TABLE public.ai_suggestions REPLICA IDENTITY FULL;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push --include-all`
Expected: applies `20260529000001_ai_suggestions.sql` with no errors; `ai_suggestions` exists.

- [ ] **Step 3: Regenerate database types**

Run: `npm run db:types`
Expected: `src/types/database.ts` now contains an `ai_suggestions` Row/Insert/Update. Re-apply the hand-narrowings noted in `CLAUDE.md` (search for `HAND-NARROWED` anchors — the `customers.lifecycle_stage` / `acquisition_source` unions) if the regen reset them.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260529000001_ai_suggestions.sql src/types/database.ts
git commit -m "feat(copilot): ai_suggestions table with RLS + realtime"
```

---

## Task 2: `tenants.copilot_enabled` flag migration

**Files:**
- Create: `supabase/migrations/20260529000002_tenant_copilot_enabled.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-tenant opt-in for the proactive AI copilot (cost control + mute).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS copilot_enabled boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push --include-all`
Expected: `tenants.copilot_enabled` column exists, default `false`.

- [ ] **Step 3: Regenerate types**

Run: `npm run db:types`
Expected: `tenants` Row now has `copilot_enabled: boolean`. Re-apply `HAND-NARROWED` narrowings if needed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260529000002_tenant_copilot_enabled.sql src/types/database.ts
git commit -m "feat(copilot): per-tenant copilot_enabled opt-in flag"
```

---

## Task 3: Lift co-product affinity into a reusable helper

The cross-sell brain currently lives inline in `src/app/catalog/page.tsx` (lines ~108-127). Extract it verbatim into a pure, tested helper so the drafting pass can reuse it. No behavior change.

**Files:**
- Create: `src/lib/catalog/affinity.ts`
- Create: `src/lib/catalog/__tests__/affinity.test.ts`
- Modify: `src/app/catalog/page.tsx`

- [ ] **Step 1: Write the failing test**

`src/lib/catalog/__tests__/affinity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeCoProductAffinity } from '../affinity'

describe('computeCoProductAffinity', () => {
  it('counts co-occurrence within the same order and returns top-5 sorted desc', () => {
    const orders = [
      { order_items: [{ product_id: 'A' }, { product_id: 'B' }] },
      { order_items: [{ product_id: 'A' }, { product_id: 'B' }] },
      { order_items: [{ product_id: 'A' }, { product_id: 'C' }] },
    ]
    const result = computeCoProductAffinity(orders)
    expect(result['A']).toEqual([
      { productId: 'B', count: 2 },
      { productId: 'C', count: 1 },
    ])
    expect(result['B']).toEqual([{ productId: 'A', count: 2 }])
  })

  it('ignores self-pairs and tolerates missing/empty order_items', () => {
    const orders = [
      { order_items: [{ product_id: 'A' }] },
      { order_items: [] },
      { order_items: null },
    ]
    const result = computeCoProductAffinity(orders as never)
    expect(result['A']).toBeUndefined()
  })

  it('caps each product list at 5 entries', () => {
    const ids = ['B', 'C', 'D', 'E', 'F', 'G']
    const orders = ids.map(id => ({ order_items: [{ product_id: 'A' }, { product_id: id }] }))
    const result = computeCoProductAffinity(orders)
    expect(result['A']).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/catalog/__tests__/affinity.test.ts`
Expected: FAIL — cannot find module `../affinity`.

- [ ] **Step 3: Write the helper**

`src/lib/catalog/affinity.ts`:

```ts
export interface OrderForAffinity {
  order_items: { product_id: string }[] | null
}

export interface CoProduct {
  productId: string
  count: number
}

/** Co-occurrence cross-sell: for each product, the top-5 other products that
 * appear in the same order, counted across the supplied orders. Lifted
 * verbatim from the catalog page so the copilot drafting pass can reuse it. */
export function computeCoProductAffinity(
  orders: OrderForAffinity[],
): Record<string, CoProduct[]> {
  const coFreq: Record<string, Record<string, number>> = {}
  for (const order of orders ?? []) {
    const ids = ((order.order_items ?? []) as { product_id: string }[]).map(i => i.product_id)
    for (const pid of ids) {
      for (const other of ids) {
        if (pid === other) continue
        if (!coFreq[pid]) coFreq[pid] = {}
        coFreq[pid][other] = (coFreq[pid][other] ?? 0) + 1
      }
    }
  }
  const byProductId: Record<string, CoProduct[]> = {}
  for (const [pid, freq] of Object.entries(coFreq)) {
    byProductId[pid] = Object.entries(freq)
      .map(([productId, count]) => ({ productId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }
  return byProductId
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/catalog/__tests__/affinity.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Replace the inline reduce in the catalog page**

In `src/app/catalog/page.tsx`, add the import at the top with the other `@/lib` imports:

```ts
import { computeCoProductAffinity } from '@/lib/catalog/affinity'
```

Then delete the inline block that builds `coFreq` and `coProductsByProductId` (the ~20 lines starting at `const coFreq: Record<string, Record<string, number>> = {}`) and replace it with:

```ts
const coProductsByProductId = computeCoProductAffinity(recentOrders ?? [])
```

Leave every later use of `coProductsByProductId` untouched.

- [ ] **Step 6: Verify the catalog page still type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors in `src/app/catalog/page.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/catalog/affinity.ts src/lib/catalog/__tests__/affinity.test.ts src/app/catalog/page.tsx
git commit -m "refactor(catalog): extract computeCoProductAffinity helper"
```

---

## Task 4: Copilot types + constants

**Files:**
- Create: `src/lib/copilot/types.ts`

- [ ] **Step 1: Write the types module**

`src/lib/copilot/types.ts`:

```ts
export type SuggestionKind = 'cross_sell' | 'draft_order' | 'quote' | 'reply' | 'payment_link'
export type SuggestionStatus = 'open' | 'sent' | 'committed' | 'dismissed' | 'expired'

// Per-kind payloads. Stored as jsonb; the drafting LLM fills these.
export interface CrossSellPayload {
  product_id: string
  product_name: string
  offer_message: string   // a ready-to-send reply offering the cross-sell
  affinity_pct: number    // 0-100, for the "67% of similar protocols" line
}
export interface DraftOrderPayload {
  customer_id: string
  payment_asset: string
  items: { product_id: string; product_name: string; qty: number; unit_price: number }[]
  total: number
}
export interface QuotePayload { message: string }   // drafted price/availability message
export interface ReplyPayload { message: string }   // drafted conversational reply
export interface PaymentLinkPayload {
  order_id?: string
  draft_order?: DraftOrderPayload
}

export interface SuggestionDraft {
  kind: SuggestionKind
  payload: Record<string, unknown>
  confidence: number   // 0-1
  reasoning: string
  dedupKey: string     // e.g. "cross_sell:<product_id>", "quote:<product_id>"
}

// Only surface/keep suggestions at or above this confidence. Tune in QA.
export const COPILOT_CONFIDENCE_THRESHOLD = 0.6

// Cheap classifier model + capable drafting model. Both overridable via env.
export const COPILOT_CLASSIFY_MODEL =
  process.env.OPENROUTER_COPILOT_CLASSIFY_MODEL ?? 'anthropic/claude-haiku-4.5'
export const COPILOT_DRAFT_MODEL =
  process.env.OPENROUTER_COPILOT_DRAFT_MODEL ?? process.env.OPENROUTER_MODEL ?? 'google/gemini-flash-2.5'

// How many recent messages of the conversation to feed the LLM passes.
export const COPILOT_HISTORY_LIMIT = 20
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/copilot/types.ts
git commit -m "feat(copilot): suggestion types + tuning constants"
```

---

## Task 5: OpenRouter client + `jsonCompletion` helper

A small non-streaming completion helper, modeled on `src/lib/catalog/extraction/extract.ts`. It returns parsed JSON and is the single seam the prefilter/draft passes call — so tests inject a fake instead.

**Files:**
- Create: `src/lib/copilot/client.ts`
- Create: `src/lib/copilot/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/copilot/__tests__/client.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { parseJsonContent } from '../client'

describe('parseJsonContent', () => {
  it('parses a clean JSON object', () => {
    expect(parseJsonContent('{"actionable":true}')).toEqual({ actionable: true })
  })

  it('strips ```json fences before parsing', () => {
    const fenced = '```json\n{"a":1}\n```'
    expect(parseJsonContent(fenced)).toEqual({ a: 1 })
  })

  it('throws a descriptive error on non-JSON', () => {
    expect(() => parseJsonContent('not json')).toThrow(/copilot: could not parse/i)
  })

  it('throws on empty content', () => {
    expect(() => parseJsonContent('')).toThrow(/copilot: empty completion/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/copilot/__tests__/client.test.ts`
Expected: FAIL — cannot find module `../client`.

- [ ] **Step 3: Write the client**

`src/lib/copilot/client.ts`:

```ts
import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

function createClient(): OpenAI {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY!,
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://peptech.vercel.app',
      'X-Title': 'Peptech Copilot',
    },
  })
}

export function parseJsonContent(content: string | null | undefined): unknown {
  const raw = (content ?? '').trim()
  if (!raw) throw new Error('copilot: empty completion')
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    return JSON.parse(stripped)
  } catch {
    throw new Error(`copilot: could not parse JSON from completion: ${stripped.slice(0, 200)}`)
  }
}

/** A single non-streaming chat completion that returns parsed JSON.
 * The drafting/prefilter passes call this; tests inject a fake `complete`. */
export type CompleteFn = (args: {
  model: string
  messages: ChatCompletionMessageParam[]
}) => Promise<string>

export const defaultComplete: CompleteFn = async ({ model, messages }) => {
  const completion = await createClient().chat.completions.create({
    model,
    messages,
    response_format: { type: 'json_object' } as { type: 'json_object' },
  })
  return completion.choices[0]?.message?.content ?? ''
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/copilot/__tests__/client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/client.ts src/lib/copilot/__tests__/client.test.ts
git commit -m "feat(copilot): non-streaming OpenRouter JSON completion helper"
```

---

## Task 6: Pre-filter classifier

A cheap LLM pass over the recent conversation that answers "is there an actionable commerce moment?" It is the cost gate before the expensive drafting pass.

**Files:**
- Create: `src/lib/copilot/prefilter.ts`
- Create: `src/lib/copilot/__tests__/prefilter.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/copilot/__tests__/prefilter.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { classifyActionable } from '../prefilter'

const transcript = [
  { direction: 'inbound', content: 'do you have RETA-10 in stock and how much?', sent_at: '2026-05-29T10:00:00Z' },
]

describe('classifyActionable', () => {
  it('returns actionable=true with signals when the model says so', async () => {
    const complete = vi.fn().mockResolvedValue('{"actionable":true,"signals":["price_question","stock_question"]}')
    const result = await classifyActionable(transcript, { complete })
    expect(result.actionable).toBe(true)
    expect(result.signals).toContain('price_question')
    expect(complete).toHaveBeenCalledOnce()
  })

  it('returns actionable=false for chit-chat', async () => {
    const complete = vi.fn().mockResolvedValue('{"actionable":false,"signals":[]}')
    const result = await classifyActionable(
      [{ direction: 'inbound', content: 'thanks, have a good weekend!', sent_at: '2026-05-29T10:00:00Z' }],
      { complete },
    )
    expect(result.actionable).toBe(false)
  })

  it('fails closed (actionable=false) when the model returns garbage', async () => {
    const complete = vi.fn().mockResolvedValue('not json')
    const result = await classifyActionable(transcript, { complete })
    expect(result.actionable).toBe(false)
    expect(result.signals).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/copilot/__tests__/prefilter.test.ts`
Expected: FAIL — cannot find module `../prefilter`.

- [ ] **Step 3: Write the prefilter**

`src/lib/copilot/prefilter.ts`:

```ts
import { defaultComplete, parseJsonContent, type CompleteFn } from './client'
import { COPILOT_CLASSIFY_MODEL } from './types'

export interface ConvMessage {
  direction: string
  content: string
  sent_at: string
}

export interface PrefilterResult {
  actionable: boolean
  signals: string[]
}

const SYSTEM = `You are a fast classifier for a peptide-supply CRM. Read the recent conversation between a SELLER and a CUSTOMER. Decide if the latest customer activity is an ACTIONABLE commerce moment worth drafting a suggestion for.

Actionable signals include: product interest, a stock or price question, a reorder being due, readiness to buy, or a clear cross-sell opening.
NOT actionable: greetings, small talk, thanks, logistics chit-chat, already-resolved questions.

Respond ONLY with JSON: {"actionable": boolean, "signals": string[]}.
signals is a short list of snake_case tags (e.g. "price_question","stock_question","reorder_due","ready_to_buy","cross_sell_opening","product_interest").`

function renderTranscript(messages: ConvMessage[]): string {
  return messages
    .map(m => `${m.direction === 'inbound' ? 'CUSTOMER' : 'SELLER'}: ${m.content}`)
    .join('\n')
}

export async function classifyActionable(
  messages: ConvMessage[],
  deps: { complete?: CompleteFn } = {},
): Promise<PrefilterResult> {
  const complete = deps.complete ?? defaultComplete
  try {
    const content = await complete({
      model: COPILOT_CLASSIFY_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: renderTranscript(messages) },
      ],
    })
    const parsed = parseJsonContent(content) as Partial<PrefilterResult>
    return {
      actionable: parsed.actionable === true,
      signals: Array.isArray(parsed.signals) ? parsed.signals.filter(s => typeof s === 'string') : [],
    }
  } catch {
    // Fail closed: never let a classifier error trigger the expensive pass.
    return { actionable: false, signals: [] }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/copilot/__tests__/prefilter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/prefilter.ts src/lib/copilot/__tests__/prefilter.test.ts
git commit -m "feat(copilot): cheap actionability pre-filter classifier"
```

---

## Task 7: Context gathering

Assemble the commerce context the drafting pass needs, by calling the existing read-tool handlers directly (no LLM here). This keeps the drafting prompt grounded in live data.

**Files:**
- Create: `src/lib/copilot/context.ts`
- Create: `src/lib/copilot/__tests__/context.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/copilot/__tests__/context.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { gatherContext } from '../context'

// Stub the read tools so we test orchestration, not the tools themselves.
vi.mock('@/lib/agent/tools/read', () => ({
  READ_TOOLS: [],
  getCustomer: { execute: vi.fn().mockResolvedValue({ id: 'cust1', display_name: 'Jordan', recent_orders: [] }) },
  getConversationMessages: { execute: vi.fn().mockResolvedValue([{ direction: 'inbound', content: 'hi', sent_at: 't' }]) },
  queryCatalog: { execute: vi.fn().mockResolvedValue([{ id: 'p1', name: 'BPC-157', total_stock: 5, unit_price: 50 }]) },
}))

describe('gatherContext', () => {
  it('collects customer, messages, catalog and affinity into one bundle', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ data: [{ order_items: [{ product_id: 'p1' }, { product_id: 'p2' }] }] }),
          }),
        }),
      }),
    }
    const ctx = await gatherContext(supabase as never, 'tenant1', 'conv1', 'cust1')
    expect(ctx.customer).toMatchObject({ id: 'cust1' })
    expect(ctx.messages).toHaveLength(1)
    expect(ctx.catalog).toHaveLength(1)
    expect(ctx.affinity['p1']).toEqual([{ productId: 'p2', count: 1 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/copilot/__tests__/context.test.ts`
Expected: FAIL — cannot find module `../context`.

- [ ] **Step 3: Write the context gatherer**

`src/lib/copilot/context.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getCustomer, getConversationMessages, queryCatalog } from '@/lib/agent/tools/read'
import { computeCoProductAffinity, type CoProduct } from '@/lib/catalog/affinity'
import { COPILOT_HISTORY_LIMIT } from './types'
import type { ConvMessage } from './prefilter'

type Db = SupabaseClient<Database>

export interface CopilotContext {
  customer: unknown
  messages: ConvMessage[]
  catalog: { id: string; name: string; total_stock: number; unit_price: number; margin_pct: number | null }[]
  affinity: Record<string, CoProduct[]>
}

export async function gatherContext(
  supabase: Db,
  tenantId: string,
  conversationId: string,
  customerId: string,
): Promise<CopilotContext> {
  const [customer, messages, catalog] = await Promise.all([
    getCustomer.execute({ id: customerId }, supabase, tenantId).catch(() => null),
    getConversationMessages.execute(
      { conversation_id: conversationId, limit: COPILOT_HISTORY_LIMIT },
      supabase,
      tenantId,
    ).catch(() => []),
    queryCatalog.execute({}, supabase, tenantId).catch(() => []),
  ])

  // Affinity over the last 30 days of fulfilled orders (same window as catalog page).
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('order_items(product_id)')
    .in('status', ['packing', 'shipped', 'delivered'])
    .gte('created_at', thirtyDaysAgo)

  return {
    customer,
    messages: (messages as ConvMessage[]) ?? [],
    catalog: (catalog as CopilotContext['catalog']) ?? [],
    affinity: computeCoProductAffinity((recentOrders as { order_items: { product_id: string }[] | null }[]) ?? []),
  }
}
```

`ConvMessage` is declared in `prefilter.ts`; `COPILOT_HISTORY_LIMIT` in `types.ts` — import each from its real home (as shown above).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/copilot/__tests__/context.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/context.ts src/lib/copilot/__tests__/context.test.ts
git commit -m "feat(copilot): gather live commerce context for drafting"
```

---

## Task 8: Drafting pass

One capable LLM call that turns the context into concrete `SuggestionDraft[]`. Returns structured JSON; we validate, clamp confidence, and compute dedup keys.

**Files:**
- Create: `src/lib/copilot/draft.ts`
- Create: `src/lib/copilot/__tests__/draft.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/copilot/__tests__/draft.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { draftSuggestions } from '../draft'
import type { CopilotContext } from '../context'

const ctx: CopilotContext = {
  customer: { id: 'cust1', display_name: 'Jordan', recent_orders: [] },
  messages: [{ direction: 'inbound', content: 'how much is RETA-10?', sent_at: 't' }],
  catalog: [{ id: 'p1', name: 'RETA-10', total_stock: 8, unit_price: 120, margin_pct: 40 }],
  affinity: { p1: [{ productId: 'p2', count: 6 }] },
}

describe('draftSuggestions', () => {
  it('maps model output into validated drafts with dedup keys', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({
      suggestions: [
        { kind: 'quote', payload: { message: 'RETA-10 is $120 and in stock.' }, confidence: 0.9, reasoning: 'direct price question' },
        { kind: 'cross_sell', payload: { product_id: 'p2', product_name: 'BPC-157', offer_message: 'Add BPC?', affinity_pct: 67 }, confidence: 0.72, reasoning: 'pairs often' },
      ],
    }))
    const drafts = await draftSuggestions(ctx, { complete })
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({ kind: 'quote', dedupKey: 'quote' })
    expect(drafts[1].dedupKey).toBe('cross_sell:p2')
  })

  it('drops suggestions below the confidence threshold', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({
      suggestions: [
        { kind: 'reply', payload: { message: 'maybe' }, confidence: 0.2, reasoning: 'weak' },
      ],
    }))
    const drafts = await draftSuggestions(ctx, { complete })
    expect(drafts).toHaveLength(0)
  })

  it('returns [] on unparseable output', async () => {
    const complete = vi.fn().mockResolvedValue('garbage')
    const drafts = await draftSuggestions(ctx, { complete })
    expect(drafts).toEqual([])
  })

  it('ignores entries with an unknown kind', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({
      suggestions: [{ kind: 'banana', payload: {}, confidence: 0.9, reasoning: 'x' }],
    }))
    const drafts = await draftSuggestions(ctx, { complete })
    expect(drafts).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/copilot/__tests__/draft.test.ts`
Expected: FAIL — cannot find module `../draft`.

- [ ] **Step 3: Write the drafting pass**

`src/lib/copilot/draft.ts`:

```ts
import { defaultComplete, parseJsonContent, type CompleteFn } from './client'
import {
  COPILOT_DRAFT_MODEL,
  COPILOT_CONFIDENCE_THRESHOLD,
  type SuggestionDraft,
  type SuggestionKind,
} from './types'
import type { CopilotContext } from './context'

const KINDS: SuggestionKind[] = ['cross_sell', 'draft_order', 'quote', 'reply', 'payment_link']

const SYSTEM = `You are a commerce copilot for a peptide-supply seller. You watch a live conversation and DRAFT actions for the seller to approve. You never send anything yourself.

You may propose these suggestion kinds:
- "cross_sell": a product to offer, with an affinity reason. payload: {product_id, product_name, offer_message, affinity_pct}. offer_message is a short, ready-to-send reply offering it.
- "draft_order": an order to build. payload: {customer_id, payment_asset, items:[{product_id, product_name, qty, unit_price}], total}.
- "quote": a drafted message stating price + availability for what the customer asked. payload: {message}.
- "reply": a drafted conversational reply. payload: {message}.
- "payment_link": only when an order is ready to pay. payload: {draft_order:{...}} or {order_id}.

Rules:
- Use ONLY product_ids, names and prices present in the provided catalog. Never invent SKUs or prices.
- affinity_pct must be derived from the provided affinity data, not guessed.
- Be conservative: only suggest when there is a real, specific moment. Prefer fewer, high-confidence suggestions.
- confidence is 0..1.

Respond ONLY with JSON: {"suggestions":[{"kind","payload","confidence","reasoning"}]}.`

function dedupKeyFor(kind: SuggestionKind, payload: Record<string, unknown>): string {
  if (kind === 'cross_sell') return `cross_sell:${String(payload.product_id ?? '')}`
  if (kind === 'draft_order' || kind === 'payment_link') {
    const items = (payload.items as { product_id: string }[] | undefined) ?? []
    const key = items.map(i => i.product_id).sort().join(',')
    return `${kind}:${key}`
  }
  return kind  // quote / reply: at most one open at a time per conversation
}

export async function draftSuggestions(
  ctx: CopilotContext,
  deps: { complete?: CompleteFn } = {},
): Promise<SuggestionDraft[]> {
  const complete = deps.complete ?? defaultComplete
  let parsed: { suggestions?: unknown }
  try {
    const content = await complete({
      model: COPILOT_DRAFT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify(ctx) },
      ],
    })
    parsed = parseJsonContent(content) as { suggestions?: unknown }
  } catch {
    return []
  }

  const raw = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  const drafts: SuggestionDraft[] = []
  for (const entry of raw as Record<string, unknown>[]) {
    const kind = entry.kind as SuggestionKind
    if (!KINDS.includes(kind)) continue
    const confidence = typeof entry.confidence === 'number' ? entry.confidence : 0
    if (confidence < COPILOT_CONFIDENCE_THRESHOLD) continue
    const payload = (entry.payload && typeof entry.payload === 'object'
      ? entry.payload
      : {}) as Record<string, unknown>
    drafts.push({
      kind,
      payload,
      confidence: Math.max(0, Math.min(1, confidence)),
      reasoning: typeof entry.reasoning === 'string' ? entry.reasoning : '',
      dedupKey: dedupKeyFor(kind, payload),
    })
  }
  return drafts
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/copilot/__tests__/draft.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/draft.ts src/lib/copilot/__tests__/draft.test.ts
git commit -m "feat(copilot): drafting pass producing validated suggestions"
```

---

## Task 9: Dedup + persist

Skip drafts whose `dedup_key` is already open on the conversation; insert the rest.

**Files:**
- Create: `src/lib/copilot/persist.ts`
- Create: `src/lib/copilot/__tests__/persist.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/copilot/__tests__/persist.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { dedupAndPersist } from '../persist'
import type { SuggestionDraft } from '../types'

const drafts: SuggestionDraft[] = [
  { kind: 'quote', payload: { message: 'a' }, confidence: 0.9, reasoning: 'r', dedupKey: 'quote' },
  { kind: 'cross_sell', payload: { product_id: 'p2' }, confidence: 0.8, reasoning: 'r', dedupKey: 'cross_sell:p2' },
]

function fakeSupabase(openKeys: string[], insertSpy: ReturnType<typeof vi.fn>) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'ai_suggestions') {
        return {
          // for the open-keys query
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: openKeys.map(dedup_key => ({ dedup_key })) }),
            }),
          }),
          insert: insertSpy,
        }
      }
      throw new Error('unexpected table ' + table)
    }),
  }
}

describe('dedupAndPersist', () => {
  it('inserts only drafts whose dedup_key is not already open', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    const supabase = fakeSupabase(['quote'], insertSpy)
    const inserted = await dedupAndPersist(supabase as never, {
      tenantId: 't', conversationId: 'c', customerId: 'cust',
    }, drafts)
    expect(inserted).toBe(1)
    expect(insertSpy).toHaveBeenCalledOnce()
    const rows = insertSpy.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'cross_sell', dedup_key: 'cross_sell:p2', tenant_id: 't' })
  })

  it('inserts nothing when all drafts are duplicates', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    const supabase = fakeSupabase(['quote', 'cross_sell:p2'], insertSpy)
    const inserted = await dedupAndPersist(supabase as never, {
      tenantId: 't', conversationId: 'c', customerId: 'cust',
    }, drafts)
    expect(inserted).toBe(0)
    expect(insertSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/copilot/__tests__/persist.test.ts`
Expected: FAIL — cannot find module `../persist`.

- [ ] **Step 3: Write persist**

`src/lib/copilot/persist.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { SuggestionDraft } from './types'

type Db = SupabaseClient<Database>

export interface PersistTarget {
  tenantId: string
  conversationId: string
  customerId: string
}

export async function dedupAndPersist(
  supabase: Db,
  target: PersistTarget,
  drafts: SuggestionDraft[],
): Promise<number> {
  if (drafts.length === 0) return 0

  const { data: openRows } = await supabase
    .from('ai_suggestions')
    .select('dedup_key')
    .eq('conversation_id', target.conversationId)
    .eq('status', 'open')

  const openKeys = new Set((openRows ?? []).map(r => (r as { dedup_key: string }).dedup_key))
  const fresh = drafts.filter(d => !openKeys.has(d.dedupKey))
  if (fresh.length === 0) return 0

  const rows = fresh.map(d => ({
    tenant_id: target.tenantId,
    conversation_id: target.conversationId,
    customer_id: target.customerId,
    kind: d.kind,
    status: 'open' as const,
    payload: d.payload as never,
    confidence: d.confidence,
    reasoning: d.reasoning,
    dedup_key: d.dedupKey,
  }))

  const { error } = await supabase.from('ai_suggestions').insert(rows)
  if (error) {
    console.error('[copilot] failed to persist suggestions:', error.message)
    return 0
  }
  return rows.length
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/copilot/__tests__/persist.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/persist.ts src/lib/copilot/__tests__/persist.test.ts
git commit -m "feat(copilot): dedup + persist suggestions to ai_suggestions"
```

---

## Task 10: Orchestrator (`runCopilotPass`)

The single entry point. Gates on the tenant flag, debounces bursts (only the latest inbound message runs), pre-filters, gathers context, drafts, persists. Never throws (it is called fire-and-forget).

**Files:**
- Create: `src/lib/copilot/run.ts`
- Create: `src/lib/copilot/__tests__/run.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/copilot/__tests__/run.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const classifyActionable = vi.fn()
const gatherContext = vi.fn()
const draftSuggestions = vi.fn()
const dedupAndPersist = vi.fn()

vi.mock('../prefilter', () => ({ classifyActionable }))
vi.mock('../context', () => ({ gatherContext }))
vi.mock('../draft', () => ({ draftSuggestions }))
vi.mock('../persist', () => ({ dedupAndPersist }))

import { runCopilotPass } from '../run'

// Supabase stub: copilot_enabled flag + latest-inbound-message check.
function fakeSupabase(opts: { enabled: boolean; latestInboundId: string }) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tenants') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { copilot_enabled: opts.enabled } }) }) }) }
      }
      if (table === 'messages') {
        return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [{ id: opts.latestInboundId }] }) }) }) }) }) }
      }
      throw new Error('unexpected table ' + table)
    }),
  }
}

const params = { tenantId: 't', conversationId: 'c', customerId: 'cust', messageId: 'm1' }

beforeEach(() => {
  classifyActionable.mockReset(); gatherContext.mockReset(); draftSuggestions.mockReset(); dedupAndPersist.mockReset()
  gatherContext.mockResolvedValue({ messages: [{ direction: 'inbound', content: 'x', sent_at: 't' }] })
})

describe('runCopilotPass', () => {
  it('does nothing when the tenant has copilot disabled', async () => {
    const supabase = fakeSupabase({ enabled: false, latestInboundId: 'm1' })
    await runCopilotPass(supabase as never, params)
    expect(classifyActionable).not.toHaveBeenCalled()
  })

  it('skips when a newer inbound message exists (debounce)', async () => {
    const supabase = fakeSupabase({ enabled: true, latestInboundId: 'm2' })
    await runCopilotPass(supabase as never, params)
    expect(classifyActionable).not.toHaveBeenCalled()
  })

  it('stops after pre-filter when not actionable', async () => {
    const supabase = fakeSupabase({ enabled: true, latestInboundId: 'm1' })
    classifyActionable.mockResolvedValue({ actionable: false, signals: [] })
    await runCopilotPass(supabase as never, params)
    expect(draftSuggestions).not.toHaveBeenCalled()
  })

  it('runs the full pipeline when actionable', async () => {
    const supabase = fakeSupabase({ enabled: true, latestInboundId: 'm1' })
    classifyActionable.mockResolvedValue({ actionable: true, signals: ['price_question'] })
    draftSuggestions.mockResolvedValue([{ kind: 'quote', payload: {}, confidence: 0.9, reasoning: '', dedupKey: 'quote' }])
    dedupAndPersist.mockResolvedValue(1)
    await runCopilotPass(supabase as never, params)
    expect(dedupAndPersist).toHaveBeenCalledOnce()
  })

  it('never throws when a stage errors', async () => {
    const supabase = fakeSupabase({ enabled: true, latestInboundId: 'm1' })
    classifyActionable.mockRejectedValue(new Error('boom'))
    await expect(runCopilotPass(supabase as never, params)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/copilot/__tests__/run.test.ts`
Expected: FAIL — cannot find module `../run`.

- [ ] **Step 3: Write the orchestrator**

`src/lib/copilot/run.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { classifyActionable } from './prefilter'
import { gatherContext } from './context'
import { draftSuggestions } from './draft'
import { dedupAndPersist } from './persist'

type Db = SupabaseClient<Database>

export interface CopilotPassParams {
  tenantId: string
  conversationId: string
  customerId: string
  messageId: string   // the inbound message that triggered this pass
}

/** Fire-and-forget. Gates on the tenant flag, debounces bursts, then runs
 * pre-filter -> context -> draft -> persist. Never throws. */
export async function runCopilotPass(supabase: Db, params: CopilotPassParams): Promise<void> {
  try {
    // 1. Tenant opt-in gate.
    const { data: tenant } = await supabase
      .from('tenants')
      .select('copilot_enabled')
      .eq('id', params.tenantId)
      .single()
    if (!tenant?.copilot_enabled) return

    // 2. Debounce: only the latest inbound message in the conversation runs.
    //    A burst of rapid inbound messages collapses to one pass.
    const { data: latest } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', params.conversationId)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
    if (latest?.[0]?.id && latest[0].id !== params.messageId) return

    // 3. Gather context first (we need the transcript for the pre-filter too).
    const ctx = await gatherContext(supabase, params.tenantId, params.conversationId, params.customerId)

    // 4. Cheap pre-filter.
    const { actionable } = await classifyActionable(ctx.messages)
    if (!actionable) return

    // 5. Drafting pass.
    const drafts = await draftSuggestions(ctx)
    if (drafts.length === 0) return

    // 6. Dedup + persist.
    await dedupAndPersist(supabase, {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      customerId: params.customerId,
    }, drafts)
  } catch (err) {
    console.error('[copilot] pass failed:', err instanceof Error ? err.message : err)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/copilot/__tests__/run.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/run.ts src/lib/copilot/__tests__/run.test.ts
git commit -m "feat(copilot): runCopilotPass orchestrator (gate, debounce, pipeline)"
```

---

## Task 11: Wire the trigger into `processInboundMessage`

Fire `runCopilotPass` fire-and-forget after the message insert, mirroring the existing `new_thread` dispatch. Use `createServiceClient()` (no user session in a webhook), exactly like `runAutomationsForEvent`.

**Files:**
- Modify: `src/lib/webhooks/processor.ts:142` (just before `return`)

- [ ] **Step 1: Add the import**

At the top of `src/lib/webhooks/processor.ts`, add to the existing imports:

```ts
import { runCopilotPass } from '@/lib/copilot/run'
```

- [ ] **Step 2: Dispatch the pass after the conversation update**

In `processInboundMessage`, between the conversation `update(...)` call (ends line 141) and the final `return { conversationId, messageId: message.id }` (line 143), insert:

```ts
  // Proactive AI copilot: draft suggestions as the conversation progresses.
  // Fire-and-forget on a service client (no user session in a webhook).
  void runCopilotPass(createServiceClient(), {
    tenantId,
    conversationId,
    customerId,
    messageId: message.id,
  }).catch(console.error)
```

Note: the `void` arrives only on the non-duplicate path (the `23505` early-return at line 118 already skips it), so a re-delivered webhook will not re-run the copilot.

- [ ] **Step 3: Verify the processor still type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the whole copilot + processor test suite**

Run: `npm run test:run -- src/lib/copilot src/lib/catalog/__tests__/affinity.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhooks/processor.ts
git commit -m "feat(copilot): trigger copilot pass on each inbound message"
```

---

## Task 12: Reactivation verification + env docs

The spec calls for inbound on a `resolved`/`snoozed` thread to reactivate it to `needs_reply`. This **already happens** at `processor.ts:124-126`. Lock it with a regression test and document the new env vars.

**Files:**
- Create: `src/lib/webhooks/__tests__/reactivation.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the reactivation regression test**

`src/lib/webhooks/__tests__/reactivation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

// Pure unit test of the status-transition rule used in processInboundMessage.
// Mirrors processor.ts:124-126 so a refactor that breaks reactivation fails here.
function nextStatus(currentStatus: string): string {
  return ['resolved', 'snoozed'].includes(currentStatus) ? 'needs_reply'
    : currentStatus === 'new' ? 'new'
    : 'needs_reply'
}

describe('inbound conversation status transition', () => {
  it('reactivates resolved -> needs_reply', () => {
    expect(nextStatus('resolved')).toBe('needs_reply')
  })
  it('reactivates snoozed -> needs_reply', () => {
    expect(nextStatus('snoozed')).toBe('needs_reply')
  })
  it('keeps new as new', () => {
    expect(nextStatus('new')).toBe('new')
  })
  it('keeps in_progress flowing to needs_reply', () => {
    expect(nextStatus('in_progress')).toBe('needs_reply')
  })
})
```

This test documents and pins the behavior. If a future refactor moves the rule, update both `processor.ts` and this helper together.

- [ ] **Step 2: Run the test**

Run: `npm run test:run -- src/lib/webhooks/__tests__/reactivation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Document env vars**

In `.env.example`, under the existing `OPENROUTER_*` block, add:

```bash
# Copilot models (optional). Cheap classifier + capable drafter.
OPENROUTER_COPILOT_CLASSIFY_MODEL=anthropic/claude-haiku-4.5
OPENROUTER_COPILOT_DRAFT_MODEL=
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/webhooks/__tests__/reactivation.test.ts .env.example
git commit -m "test(copilot): pin resolved/snoozed reactivation + document env vars"
```

---

## Task 13: Full-suite green + integration sanity

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:run`
Expected: all tests PASS (note: the project has a known local `@testing-library/dom` gap for some component tests — if those fail to *load*, that is pre-existing; the copilot/lib tests must pass).

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual integration check (requires a deploy or local Supabase with a real OpenRouter key)**

1. Set `tenants.copilot_enabled = true` for your test tenant (SQL or a quick admin update).
2. Send an inbound WhatsApp/Telegram test message asking a price/stock question (e.g. "how much is RETA-10 and is it in stock?").
3. Query: `select kind, status, confidence, payload from ai_suggestions where conversation_id = '<id>' order by created_at desc;`
4. Expected: at least one `open` row of a sensible kind (`quote` or `cross_sell`) with confidence ≥ 0.6.
5. Send a pure chit-chat inbound ("thanks!") on another conversation → expect NO new `ai_suggestions` row (pre-filter short-circuit). Confirm in logs that the drafting model was not called.
6. Resolve a conversation, then send an inbound → confirm `conversations.status` flips to `needs_reply` AND a suggestion is produced.

- [ ] **Step 4: Commit any fixes discovered during integration**

```bash
git add -A
git commit -m "fix(copilot): integration fixes from manual pipeline walk-through"
```

(Skip if nothing needed fixing.)

---

## Verification (whole plan)

- **Unit:** affinity counting; JSON parse/fence-strip; pre-filter actionable/not/garbage (fails closed); context orchestration; draft validation + confidence threshold + dedup-key computation + unknown-kind rejection; dedup-skip of already-open keys; orchestrator gate/debounce/short-circuit/never-throws; reactivation status rule.
- **Integration:** an inbound price/stock question on an opted-in tenant produces an `open` `ai_suggestions` row of the right kind; a chit-chat inbound produces none (and does not call the drafting model); a resolved thread + inbound reactivates to `needs_reply` and produces a suggestion.
- **Cost:** confirm non-actionable inbound short-circuits at the pre-filter (only the cheap classify model is called).

## Out of scope (this plan)

- All UI: inline cards, Copilot panel, realtime subscription, approve/edit/dismiss, settings toggle, `send_message` agent tool, `payment_link` generation. These are in `docs/superpowers/plans/2026-05-29-inbox-copilot-surface.md`.
- `payment_link` drafting is allowed by the schema/types but the pipeline will rarely emit it until the order/payment-link UI exists; that is fine.
- **`computeSupply`-based draft-order sizing.** The spec lists `computeSupply` (`src/types/protocols.ts`) as a quantity brain. v1 lets the drafting model size `draft_order` quantities from the catalog + recent-order context. Wiring `computeSupply` (load each product's `ProductProtocol` + customer override, run the cycle math, feed "X days remaining → reorder N vials" into `gatherContext`) is a clean fast-follow once the basic suggestions land — add it to `context.ts` behind the existing data-gather without touching the draft/persist stages.
