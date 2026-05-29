# Copilot v2 — Phase 2: Draft-Order Build-Up + Finalize

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the copilot agent the tools to build a real order at a new `'draft'` status across a conversation — matching customer wording to catalog products (via the peptide reference), adding/removing items, capturing shipping + payment asset — and to finalize it into the normal pipeline.

**Architecture:** New copilot-mode agent tools operate on ONE `'draft'` order per conversation. Internal tools (`update_draft_order`, `set_shipping_address`, `set_payment_asset`, `get_draft_order`, `get_peptide_reference`) auto-execute; `finalize_order` is confirm-gated. All draft-order logic lives in a service-role-safe, explicitly tenant-scoped helper (`src/lib/agent/copilot/draft-order.ts`) — the existing cookie-bound `createOrder` server action can't run in the background. The copilot system prompt is parameterized with the current `conversation_id` + `customer_id` so the model passes them to the tools.

**Tech Stack:** Next.js 15, TypeScript, Supabase (service-role client + RLS-bypass — tenant scoping is mandatory), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-29-copilot-v2-agentic-design.md` (Phase 2 of 3). Deferred to **Phase 2b**: the gated customer-facing senders `send_message` and `generate_payment_link` (both must replicate cookie-gated infra — `@/lib/channels/*` dispatch and NOWPayments/Privy — from a service-role context).

**Prerequisite:** Phase 1 merged (`AgentSink`, `'copilot'` mode, copilot session, `runCopilotWatch`).

**CRITICAL — tenancy:** Every query in every new tool/helper runs on the copilot's SERVICE-ROLE client (RLS bypassed). EVERY query MUST filter by `tenant_id` explicitly. This has bitten the copilot twice already.

---

## Key facts (from codebase research)

- `orders.status` is a CHECK constraint (`orders_status_check`), currently `('created','awaiting','confirming','packing','shipped','delivered')`, default `'created'`. Phase 2 drops + re-adds it to include `'draft'`.
- `orders` has `conversation_id`, `customer_id`, `payment_asset` (nullable), `payment_amount numeric(10,2) default 0`, `payment_amount_base`, `currency` (default `'USD'`), `shipping_address jsonb`, `ref_number` (unique, app-supplied), `notes`.
- `order_items`: `tenant_id, order_id, product_id, batch_id?, qty (CHECK qty>0), unit_price_snapshot`.
- `ref_number` comes from `supabase.rpc('next_order_ref', { p_tenant_id: tenantId })`.
- `order_events` insert pattern (from `write.ts` create_order): `{ order_id, actor, action }` (confirm exact columns when implementing — mirror the existing insert in `src/lib/agent/tools/write.ts`).
- Peptide reference: `loadPeptideReference(supabase)` → `PeptideReference[]` (`{id, canonical_name, family, description, aliases[], protocol}`); `findMatch(name, references)` → `MatchResult | null`; `normaliseName(s)`. From `src/lib/catalog/reference/{lookup,match,types}.ts`.
- Copilot tools receive `(input, supabase, tenantId)` only — they do NOT get the conversation. So the copilot system prompt embeds `conversation_id` + `customer_id` and the model passes them as tool inputs (validated tenant-scoped).

---

## File Structure

**Create:**
- `supabase/migrations/20260529000004_orders_draft_status.sql` — add `'draft'` to `orders_status_check`.
- `src/lib/agent/copilot/draft-order.ts` — service-role-safe, tenant-scoped draft-order logic: `getOrCreateDraftOrder`, `mergeDraftItems`, `setShipping`, `setPaymentAsset`, `readDraftOrder`, `finalizeDraftOrder`.
- `src/lib/agent/tools/copilot-commerce.ts` — the new copilot AgentTools wrapping the helper + `getPeptideReference`.
- Tests under `src/lib/agent/copilot/__tests__/` and `src/lib/agent/tools/__tests__/`.

**Modify:**
- `src/lib/agent/copilot/system.ts` — `buildCopilotSystem(ctx)` parameterized with `conversationId`/`customerId` + draft-order guidance.
- `src/lib/agent/executor.ts` — `buildSystemForTurn` (copilot branch) loads the session's `trigger_ref` (conversationId) + the conversation's `customer_id` and passes them to `buildCopilotSystem`.
- `src/lib/agent/tools/copilot.ts` — add the new commerce tools to `COPILOT_TOOLS`.
- `src/lib/agent/tools/index.ts` — register the new tools in `TOOL_MAP`.
- Wherever the default Orders list is queried (`src/app/orders/page.tsx` / its data loader) — exclude `status='draft'`.
- `src/types/database.ts` — regenerate after the migration (re-apply HAND-NARROWED unions).

**Reuse:** the `create_order` tool's insert pattern (`write.ts`), `next_order_ref` RPC, `loadPeptideReference`/`findMatch`, the `AgentTool` interface, the Phase 1 confirm-gating (`requiresConfirmation`).

---

## Task 1: Add `'draft'` order status (migration)

**Files:**
- Create: `supabase/migrations/20260529000004_orders_draft_status.sql`

- [ ] **Step 1: Write the migration**

Mirror the existing constraint-rewrite pattern (`20260523000003_fix_orders_status_constraint.sql`):

```sql
-- Add 'draft' to the orders status set (the copilot builds orders at 'draft'
-- before finalizing them into the normal pipeline).
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('draft', 'created', 'awaiting', 'confirming', 'packing', 'shipped', 'delivered'));
```

- [ ] **Step 2: Apply**

Run: `npx supabase db push --include-all`
Expected: applies with no error.

- [ ] **Step 3: Regenerate types**

Run: `npm run db:types`
Expected: no shape change for `orders.status` (it's `string`). Re-apply the `customers` HAND-NARROWED unions if the regen reset them (search `src/types/database.ts` for `HAND-NARROWED`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260529000004_orders_draft_status.sql src/types/database.ts
git commit -m "feat(copilot): add 'draft' order status"
```

---

## Task 2: Inject conversation + customer context into the copilot prompt

Copilot tools need to know which conversation/customer they act on. Embed both IDs in the system prompt; the model passes them to the commerce tools.

**Files:**
- Modify: `src/lib/agent/copilot/system.ts`
- Modify: `src/lib/agent/executor.ts`
- Create/Modify test: `src/lib/agent/copilot/__tests__/system.test.ts`

- [ ] **Step 1: Update the system-prompt test**

Replace `src/lib/agent/copilot/__tests__/system.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { buildCopilotSystem } from '../system'

describe('buildCopilotSystem', () => {
  it('explains the three voices and the watch/narrate job', () => {
    const s = buildCopilotSystem({ conversationId: 'conv1', customerId: 'cust1' })
    expect(s).toMatch(/\[CUSTOMER\]/)
    expect(s).toMatch(/\[SENT\]/)
    expect(s).toMatch(/\[OPERATOR\]/)
    expect(s).toMatch(/post_commentary/)
    expect(s).toMatch(/never sees|internal/i)
  })

  it('embeds the conversation + customer ids for the commerce tools', () => {
    const s = buildCopilotSystem({ conversationId: 'conv-abc', customerId: 'cust-xyz' })
    expect(s).toContain('conv-abc')
    expect(s).toContain('cust-xyz')
    expect(s).toMatch(/update_draft_order/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/agent/copilot/__tests__/system.test.ts`
Expected: FAIL — `buildCopilotSystem` takes no args yet / new assertions fail.

- [ ] **Step 3: Update `buildCopilotSystem`**

`src/lib/agent/copilot/system.ts`:

```ts
function dateLine(): string {
  const now = new Date()
  const d = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const t = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
  return `Current date and time: ${d}, ${t}.`
}

export interface CopilotPromptContext {
  conversationId: string
  customerId: string
}

export function buildCopilotSystem(ctx: CopilotPromptContext): string {
  return `You are the Peptech inbox copilot — an attentive sales assistant that watches a live conversation between the OPERATOR (the seller, your user) and their CUSTOMER, and helps the operator close the sale.

The conversation transcript is fed to you as tagged messages:
- "[CUSTOMER] ..." — what the customer said (inbound).
- "[SENT] ..." — a message the operator has already sent to the customer.
- "[OPERATOR] ..." — a direct instruction to YOU from the operator.
Assistant messages are your own prior turns.

Everything you produce is INTERNAL — the customer never sees it. You do not message the customer in this phase.

<context>
conversation_id: ${ctx.conversationId}
customer_id: ${ctx.customerId}
</context>
Always pass these exact ids to the commerce tools (update_draft_order, set_shipping_address, set_payment_asset, get_draft_order, finalize_order) — they identify the conversation and customer you are working for.

What you can do:
- WATCH + NARRATE: call post_commentary with short, specific operator-facing notes.
- BUILD A DRAFT ORDER as the conversation progresses. When the customer expresses intent to buy specific products, call update_draft_order to add/adjust line items. Capture shipping with set_shipping_address and the payment asset with set_payment_asset when the customer provides them. Use get_draft_order to see the current state.
- Matching: customers use shorthand/abbreviations. Use get_peptide_reference to resolve informal names to canonical peptides, then match to the tenant's catalog (query_catalog). Build orders ONLY from products that exist in the catalog — never invent SKUs or prices. If an item has no catalog match, post_commentary noting it.
- finalize_order turns the draft into a real order; it requires operator approval (a confirmation card), so call it only when the order looks complete.

Be decisive and concrete. Narrate what you change ("Added 2× Retatrutide to the draft order."). ${dateLine()}`
}
```

- [ ] **Step 4: Wire context into `buildSystemForTurn` (executor.ts)**

The copilot branch must load the session's conversation + the conversation's customer. Replace the copilot branch in `buildSystemForTurn`:

```ts
async function buildSystemForTurn(mode: AgentMode, supabase: AgentSupabase, tenantId: string, sessionId?: string): Promise<string> {
  if (mode === 'copilot') {
    let conversationId = ''
    let customerId = ''
    if (sessionId) {
      const { data: sess } = await supabase.from('agent_sessions').select('trigger_ref').eq('id', sessionId).single()
      conversationId = (sess?.trigger_ref as string | null) ?? ''
      if (conversationId) {
        const { data: conv } = await supabase.from('conversations').select('customer_id').eq('id', conversationId).eq('tenant_id', tenantId).single()
        customerId = (conv?.customer_id as string | null) ?? ''
      }
    }
    return buildCopilotSystem({ conversationId, customerId })
  }
  if (mode !== 'onboarding') return buildSystem(mode)
  const state = await fetchOnboardingStateSnapshot(supabase, tenantId).catch((e) => {
    console.warn('[executor] failed to fetch onboarding state for system prompt', e)
    return undefined
  })
  return buildSystem(mode, state)
}
```

Update BOTH call sites of `buildSystemForTurn` to pass `sessionId`:
- In `executeAgentTurn`: `const system = await buildSystemForTurn(mode, supabase, tenantId, sessionId)`
- In `continueTurn`: `const system = await buildSystemForTurn(mode, supabase, tenantId, sessionId)` (it already has `sessionId` in scope).

(The import already exists: `import { buildCopilotSystem } from './copilot/system'`.)

- [ ] **Step 5: Run tests + type-check**

Run: `npm run test:run -- src/lib/agent/copilot/__tests__/system.test.ts` → PASS (2 tests).
Run: `npm run test:run -- src/lib/agent` → existing agent tests still pass.
Run: `npx tsc --noEmit` → no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/copilot/system.ts src/lib/agent/executor.ts src/lib/agent/copilot/__tests__/system.test.ts
git commit -m "feat(copilot): inject conversation + customer context into copilot prompt"
```

---

## Task 3: `get_peptide_reference` tool

**Files:**
- Create: `src/lib/agent/tools/copilot-commerce.ts` (starts here; later tasks add to it)
- Create: `src/lib/agent/tools/__tests__/copilot-commerce.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/agent/tools/__tests__/copilot-commerce.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/catalog/reference/lookup', () => ({
  loadPeptideReference: vi.fn().mockResolvedValue([
    { id: 'r1', canonical_name: 'Retatrutide', family: 'GLP-1', description: '', aliases: ['reta'], protocol: {} },
  ]),
}))

import { getPeptideReference } from '../copilot-commerce'

describe('get_peptide_reference', () => {
  it('returns a compact name+aliases list', async () => {
    expect(getPeptideReference.name).toBe('get_peptide_reference')
    expect(getPeptideReference.requiresConfirmation).toBe(false)
    const out = await getPeptideReference.execute({}, {} as never, 't1') as { canonical_name: string; aliases: string[] }[]
    expect(out).toEqual([{ canonical_name: 'Retatrutide', family: 'GLP-1', aliases: ['reta'] }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/agent/tools/__tests__/copilot-commerce.test.ts`
Expected: FAIL — cannot find module `../copilot-commerce`.

- [ ] **Step 3: Write the tool**

`src/lib/agent/tools/copilot-commerce.ts`:

```ts
import type { AgentTool } from '../types'
import { loadPeptideReference } from '@/lib/catalog/reference/lookup'

/** Read-only: the platform-wide peptide reference (canonical names + informal
 * aliases) for resolving customer shorthand. Compact projection to keep the
 * prompt small. */
export const getPeptideReference: AgentTool = {
  name: 'get_peptide_reference',
  description: 'List known peptides with their canonical names and informal aliases (e.g. "reta" → Retatrutide). Use to interpret customer shorthand, then match the canonical name against the tenant catalog (query_catalog).',
  inputSchema: { type: 'object', properties: {} },
  requiresConfirmation: false,
  async execute(_raw, supabase) {
    const refs = await loadPeptideReference(supabase)
    return refs.map(r => ({ canonical_name: r.canonical_name, family: r.family, aliases: r.aliases }))
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/agent/tools/__tests__/copilot-commerce.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/copilot-commerce.ts src/lib/agent/tools/__tests__/copilot-commerce.test.ts
git commit -m "feat(copilot): get_peptide_reference tool"
```

---

## Task 4: Draft-order helper (service-role-safe, tenant-scoped)

The core logic. One `'draft'` order per conversation; merge items; recompute total; shipping; payment asset; read; finalize. EVERY query filters by `tenant_id`.

**Files:**
- Create: `src/lib/agent/copilot/draft-order.ts`
- Create: `src/lib/agent/copilot/__tests__/draft-order.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/agent/copilot/__tests__/draft-order.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applyItemDeltas } from '../draft-order'

// applyItemDeltas is the pure core: given current line items and a price map,
// compute the resulting items + total after applying qty deltas.

describe('applyItemDeltas', () => {
  it('adds new lines, updates existing qty, removes on qty<=0, recomputes total', () => {
    const current = [{ product_id: 'p1', qty: 1, unit_price_snapshot: 100 }]
    const priceMap = { p1: 100, p2: 50 }
    const result = applyItemDeltas(current, [{ product_id: 'p2', qty: 2 }, { product_id: 'p1', qty: 3 }], priceMap)
    expect(result.items).toEqual([
      { product_id: 'p1', qty: 3, unit_price_snapshot: 100 },
      { product_id: 'p2', qty: 2, unit_price_snapshot: 50 },
    ])
    expect(result.total).toBe(3 * 100 + 2 * 50)
  })

  it('removes a line when qty <= 0', () => {
    const current = [{ product_id: 'p1', qty: 2, unit_price_snapshot: 100 }]
    const result = applyItemDeltas(current, [{ product_id: 'p1', qty: 0 }], { p1: 100 })
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  it('ignores deltas for products absent from the price map (not in catalog)', () => {
    const result = applyItemDeltas([], [{ product_id: 'ghost', qty: 2 }], { p1: 100 })
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/agent/copilot/__tests__/draft-order.test.ts`
Expected: FAIL — cannot find module `../draft-order`.

- [ ] **Step 3: Write the helper**

`src/lib/agent/copilot/draft-order.ts`:

```ts
import type { AgentSupabase } from '../types'

export interface DraftItem { product_id: string; qty: number; unit_price_snapshot: number }
export interface ItemDelta { product_id: string; qty: number }

/** Pure: apply qty deltas to the current line items using a product→price map.
 * qty<=0 removes the line; products absent from the price map (not in the
 * tenant catalog) are ignored. Returns the merged items + recomputed total. */
export function applyItemDeltas(
  current: DraftItem[],
  deltas: ItemDelta[],
  priceMap: Record<string, number>,
): { items: DraftItem[]; total: number } {
  const byId = new Map(current.map(i => [i.product_id, { ...i }]))
  for (const d of deltas) {
    if (!(d.product_id in priceMap)) continue
    if (d.qty <= 0) { byId.delete(d.product_id); continue }
    byId.set(d.product_id, { product_id: d.product_id, qty: d.qty, unit_price_snapshot: priceMap[d.product_id] })
  }
  const items = [...byId.values()]
  const total = items.reduce((s, i) => s + i.qty * i.unit_price_snapshot, 0)
  return { items, total }
}

/** Find the open draft order for a conversation, or create one. Tenant-scoped. */
export async function getOrCreateDraftOrder(
  supabase: AgentSupabase, tenantId: string, conversationId: string, customerId: string,
): Promise<{ id: string; ref_number: string } | null> {
  const { data: existing } = await supabase
    .from('orders')
    .select('id, ref_number')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .eq('status', 'draft')
    .maybeSingle()
  if (existing?.id) return { id: existing.id as string, ref_number: existing.ref_number as string }

  const { data: refNumber, error: refErr } = await supabase.rpc('next_order_ref', { p_tenant_id: tenantId })
  if (refErr || !refNumber) { console.error('[copilot] next_order_ref failed', refErr?.message); return null }

  const { data: tenant } = await supabase.from('tenants').select('base_currency').eq('id', tenantId).single()
  const currency = (tenant?.base_currency as string | null) ?? 'USD'

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      tenant_id: tenantId, ref_number: refNumber as string, customer_id: customerId,
      conversation_id: conversationId, status: 'draft', payment_amount: 0, currency,
    })
    .select('id, ref_number')
    .single()
  if (error || !order) { console.error('[copilot] draft order insert failed', error?.message); return null }
  return { id: order.id as string, ref_number: order.ref_number as string }
}

async function recompute(supabase: AgentSupabase, tenantId: string, orderId: string) {
  const { data: items } = await supabase
    .from('order_items').select('qty, unit_price_snapshot').eq('tenant_id', tenantId).eq('order_id', orderId)
  const total = (items ?? []).reduce((s, i) => s + (i.qty as number) * (i.unit_price_snapshot as number), 0)
  await supabase.from('orders').update({ payment_amount: total, payment_amount_base: total }).eq('id', orderId).eq('tenant_id', tenantId)
  return total
}

/** Merge qty deltas into the conversation's draft order. Tenant-scoped. */
export async function mergeDraftItems(
  supabase: AgentSupabase, tenantId: string, conversationId: string, customerId: string, deltas: ItemDelta[],
): Promise<{ orderId: string; total: number } | { error: string }> {
  const draft = await getOrCreateDraftOrder(supabase, tenantId, conversationId, customerId)
  if (!draft) return { error: 'Could not open a draft order' }

  const productIds = deltas.map(d => d.product_id)
  const { data: products } = await supabase
    .from('products').select('id, unit_price').eq('tenant_id', tenantId).in('id', productIds)
  const priceMap: Record<string, number> = Object.fromEntries((products ?? []).map(p => [p.id as string, p.unit_price as number]))

  const { data: existing } = await supabase
    .from('order_items').select('product_id, qty, unit_price_snapshot').eq('tenant_id', tenantId).eq('order_id', draft.id)
  const current: DraftItem[] = (existing ?? []).map(i => ({ product_id: i.product_id as string, qty: i.qty as number, unit_price_snapshot: i.unit_price_snapshot as number }))

  const { items } = applyItemDeltas(current, deltas, priceMap)

  // Replace the order's items with the merged set (delete-all + re-insert is
  // simplest and safe for the small line counts here).
  await supabase.from('order_items').delete().eq('tenant_id', tenantId).eq('order_id', draft.id)
  if (items.length) {
    await supabase.from('order_items').insert(items.map(i => ({
      tenant_id: tenantId, order_id: draft.id, product_id: i.product_id, qty: i.qty, unit_price_snapshot: i.unit_price_snapshot,
    })))
  }
  const total = await recompute(supabase, tenantId, draft.id)
  return { orderId: draft.id, total }
}

export async function setShipping(
  supabase: AgentSupabase, tenantId: string, conversationId: string, customerId: string, shipping: Record<string, unknown>,
): Promise<{ orderId: string } | { error: string }> {
  const draft = await getOrCreateDraftOrder(supabase, tenantId, conversationId, customerId)
  if (!draft) return { error: 'Could not open a draft order' }
  await supabase.from('orders').update({ shipping_address: shipping as never }).eq('id', draft.id).eq('tenant_id', tenantId)
  return { orderId: draft.id }
}

export async function setPaymentAsset(
  supabase: AgentSupabase, tenantId: string, conversationId: string, customerId: string, paymentAsset: string,
): Promise<{ orderId: string } | { error: string }> {
  const draft = await getOrCreateDraftOrder(supabase, tenantId, conversationId, customerId)
  if (!draft) return { error: 'Could not open a draft order' }
  await supabase.from('orders').update({ payment_asset: paymentAsset }).eq('id', draft.id).eq('tenant_id', tenantId)
  return { orderId: draft.id }
}

export async function readDraftOrder(
  supabase: AgentSupabase, tenantId: string, conversationId: string,
): Promise<unknown> {
  const { data: order } = await supabase
    .from('orders')
    .select('id, ref_number, status, payment_amount, payment_asset, currency, shipping_address, order_items(product_id, qty, unit_price_snapshot)')
    .eq('tenant_id', tenantId).eq('conversation_id', conversationId).eq('status', 'draft').maybeSingle()
  return order ?? null
}

/** Flip the conversation's draft order to 'created' (enters the normal pipeline). */
export async function finalizeDraftOrder(
  supabase: AgentSupabase, tenantId: string, conversationId: string,
): Promise<{ orderId: string; refNumber: string } | { error: string }> {
  const { data: order } = await supabase
    .from('orders').select('id, ref_number, status').eq('tenant_id', tenantId).eq('conversation_id', conversationId).eq('status', 'draft').maybeSingle()
  if (!order) return { error: 'No draft order to finalize' }
  const { error } = await supabase.from('orders').update({ status: 'created' }).eq('id', order.id).eq('tenant_id', tenantId)
  if (error) return { error: error.message }
  // Mirror the create_order tool's order_events insert shape.
  await supabase.from('order_events').insert({ order_id: order.id, actor: 'agent', action: 'Order finalized by copilot' } as never)
  return { orderId: order.id as string, refNumber: order.ref_number as string }
}
```

(When implementing, confirm the `order_events` insert columns match the existing insert in `src/lib/agent/tools/write.ts` — add `tenant_id`/`note` if that table requires them.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/agent/copilot/__tests__/draft-order.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit` → no new errors.
```bash
git add src/lib/agent/copilot/draft-order.ts src/lib/agent/copilot/__tests__/draft-order.test.ts
git commit -m "feat(copilot): tenant-scoped draft-order helper"
```

---

## Task 5: Commerce tools wrapping the helper

Add the tools to `copilot-commerce.ts`. Each takes `conversation_id` + `customer_id` (the model supplies them from the prompt context). Internal tools are auto; `finalize_order` is gated.

**Files:**
- Modify: `src/lib/agent/tools/copilot-commerce.ts`
- Modify: `src/lib/agent/tools/__tests__/copilot-commerce.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/agent/tools/__tests__/copilot-commerce.test.ts`:

```ts
import { updateDraftOrder, setShippingAddress, setPaymentAssetTool, getDraftOrder, finalizeOrder } from '../copilot-commerce'

describe('copilot commerce tools', () => {
  it('declares the right names + confirm flags', () => {
    expect(updateDraftOrder.name).toBe('update_draft_order')
    expect(updateDraftOrder.requiresConfirmation).toBe(false)
    expect(setShippingAddress.name).toBe('set_shipping_address')
    expect(setShippingAddress.requiresConfirmation).toBe(false)
    expect(setPaymentAssetTool.name).toBe('set_payment_asset')
    expect(setPaymentAssetTool.requiresConfirmation).toBe(false)
    expect(getDraftOrder.name).toBe('get_draft_order')
    expect(getDraftOrder.requiresConfirmation).toBe(false)
    expect(finalizeOrder.name).toBe('finalize_order')
    expect(finalizeOrder.requiresConfirmation).toBe(true)  // gated
  })

  it('update_draft_order forwards deltas to the helper', async () => {
    const { mergeDraftItems } = await import('@/lib/agent/copilot/draft-order')
    const spy = vi.spyOn(await import('@/lib/agent/copilot/draft-order'), 'mergeDraftItems').mockResolvedValue({ orderId: 'o1', total: 200 })
    const out = await updateDraftOrder.execute(
      { conversation_id: 'c1', customer_id: 'cu1', items: [{ product_id: 'p1', qty: 2 }] } as never,
      {} as never, 't1',
    )
    expect(spy).toHaveBeenCalledWith({}, 't1', 'c1', 'cu1', [{ product_id: 'p1', qty: 2 }])
    expect(out).toEqual({ orderId: 'o1', total: 200 })
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/lib/agent/tools/__tests__/copilot-commerce.test.ts`
Expected: FAIL — the new tool exports don't exist.

- [ ] **Step 3: Add the tools to `copilot-commerce.ts`**

Append (and add the import at the top):

```ts
import { mergeDraftItems, setShipping, setPaymentAsset, readDraftOrder, finalizeDraftOrder } from '@/lib/agent/copilot/draft-order'

const CONV_CUST = {
  conversation_id: { type: 'string', description: 'The conversation_id from your context block.' },
  customer_id: { type: 'string', description: 'The customer_id from your context block.' },
}

export const updateDraftOrder: AgentTool = {
  name: 'update_draft_order',
  description: 'Add/adjust line items on this conversation\'s draft order. qty replaces the line; qty 0 removes it. Only products in the tenant catalog are accepted.',
  inputSchema: {
    type: 'object',
    required: ['conversation_id', 'customer_id', 'items'],
    properties: {
      ...CONV_CUST,
      items: { type: 'array', items: { type: 'object', required: ['product_id', 'qty'], properties: { product_id: { type: 'string' }, qty: { type: 'number' } } } },
    },
  },
  requiresConfirmation: false,
  async execute(raw, supabase, tenantId) {
    const i = raw as { conversation_id: string; customer_id: string; items: { product_id: string; qty: number }[] }
    return mergeDraftItems(supabase, tenantId, i.conversation_id, i.customer_id, i.items)
  },
}

export const setShippingAddress: AgentTool = {
  name: 'set_shipping_address',
  description: 'Set the shipping address on this conversation\'s draft order.',
  inputSchema: {
    type: 'object',
    required: ['conversation_id', 'customer_id', 'shipping'],
    properties: {
      ...CONV_CUST,
      shipping: { type: 'object', description: 'Free-form shipping fields (e.g. {ln1, ln2, city, state, zip}).' },
    },
  },
  requiresConfirmation: false,
  async execute(raw, supabase, tenantId) {
    const i = raw as { conversation_id: string; customer_id: string; shipping: Record<string, unknown> }
    return setShipping(supabase, tenantId, i.conversation_id, i.customer_id, i.shipping)
  },
}

export const setPaymentAssetTool: AgentTool = {
  name: 'set_payment_asset',
  description: 'Set the payment asset/method on this conversation\'s draft order.',
  inputSchema: {
    type: 'object',
    required: ['conversation_id', 'customer_id', 'payment_asset'],
    properties: { ...CONV_CUST, payment_asset: { type: 'string' } },
  },
  requiresConfirmation: false,
  async execute(raw, supabase, tenantId) {
    const i = raw as { conversation_id: string; customer_id: string; payment_asset: string }
    return setPaymentAsset(supabase, tenantId, i.conversation_id, i.customer_id, i.payment_asset)
  },
}

export const getDraftOrder: AgentTool = {
  name: 'get_draft_order',
  description: 'Get the current draft order (items, total, shipping, payment asset) for this conversation, or null if none yet.',
  inputSchema: { type: 'object', required: ['conversation_id'], properties: { conversation_id: { type: 'string' } } },
  requiresConfirmation: false,
  async execute(raw, supabase, tenantId) {
    const i = raw as { conversation_id: string }
    return readDraftOrder(supabase, tenantId, i.conversation_id)
  },
}

export const finalizeOrder: AgentTool = {
  name: 'finalize_order',
  description: 'Finalize this conversation\'s draft order into a real order (status created). Requires operator approval.',
  inputSchema: { type: 'object', required: ['conversation_id'], properties: { conversation_id: { type: 'string' } } },
  requiresConfirmation: true,
  summarise: () => 'Finalize the draft order into a real order',
  async execute(raw, supabase, tenantId) {
    const i = raw as { conversation_id: string }
    return finalizeDraftOrder(supabase, tenantId, i.conversation_id)
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/agent/tools/__tests__/copilot-commerce.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/copilot-commerce.ts src/lib/agent/tools/__tests__/copilot-commerce.test.ts
git commit -m "feat(copilot): draft-order commerce tools (update/shipping/asset/get/finalize)"
```

---

## Task 6: Register the commerce tools in copilot mode

**Files:**
- Modify: `src/lib/agent/tools/copilot.ts`
- Modify: `src/lib/agent/tools/index.ts`
- Modify: `src/lib/agent/tools/__tests__/copilot-mode.test.ts`

- [ ] **Step 1: Add to `COPILOT_TOOLS`**

In `src/lib/agent/tools/copilot.ts`, import and append the new tools:

```ts
import { getPeptideReference, updateDraftOrder, setShippingAddress, setPaymentAssetTool, getDraftOrder, finalizeOrder } from './copilot-commerce'
```

Change `COPILOT_TOOLS` to:

```ts
export const COPILOT_TOOLS: AgentTool[] = [
  queryCustomers, getCustomer, queryOrders, getOrder, queryCatalog, getAnalytics, getConversationMessages,
  postCommentary,
  getPeptideReference, getDraftOrder, updateDraftOrder, setShippingAddress, setPaymentAssetTool, finalizeOrder,
]
```

- [ ] **Step 2: Register confirm-gated + all tools in `TOOL_MAP` (`index.ts`)**

`TOOL_MAP` must contain every tool the executor might `confirmToolCall` or execute. Update the `TOOL_MAP` line in `src/lib/agent/tools/index.ts` to include the copilot-commerce tools. Import them:

```ts
import { COPILOT_TOOLS, postCommentary } from './copilot'
```
`COPILOT_TOOLS` now already includes the commerce tools, so build `TOOL_MAP` from the union of all tool arrays. Change it to:

```ts
export const TOOL_MAP: Record<string, AgentTool> = Object.fromEntries(
  [...ALL_TOOLS, ...ONBOARDING_TOOLS, ...COPILOT_TOOLS].map(t => [t.name, t])
)
```
(Using `...COPILOT_TOOLS` ensures `finalize_order` etc. are resolvable by `confirmToolCall`. Duplicate names like the shared read tools collapse harmlessly since `Object.fromEntries` keeps the last.)

- [ ] **Step 3: Update the mode test**

In `src/lib/agent/tools/__tests__/copilot-mode.test.ts`, add assertions:

```ts
  it('includes the draft-order commerce tools', () => {
    const names = toolsForMode('copilot').map(t => t.name)
    for (const n of ['get_peptide_reference', 'get_draft_order', 'update_draft_order', 'set_shipping_address', 'set_payment_asset', 'finalize_order']) {
      expect(names).toContain(n)
    }
  })
  it('finalize_order is resolvable in TOOL_MAP and confirm-gated', () => {
    expect(TOOL_MAP['finalize_order']?.requiresConfirmation).toBe(true)
  })
```

- [ ] **Step 4: Run tests + type-check**

Run: `npm run test:run -- src/lib/agent/tools` → PASS.
Run: `npx tsc --noEmit` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/copilot.ts src/lib/agent/tools/index.ts src/lib/agent/tools/__tests__/copilot-mode.test.ts
git commit -m "feat(copilot): register draft-order tools in copilot mode + TOOL_MAP"
```

---

## Task 7: Exclude `'draft'` orders from the default Orders list

A half-built draft must not appear in the normal Orders page until finalized.

**Files:**
- Modify: the Orders list data loader (locate it: `src/app/orders/page.tsx` and/or a query helper it calls).

- [ ] **Step 1: Locate the orders-list query**

Read `src/app/orders/page.tsx` (and any `getOrders`-style helper it calls). Find the query that lists orders for the Orders page.

- [ ] **Step 2: Exclude drafts**

Add `.neq('status', 'draft')` to that listing query (and to any order-count/stat queries that should ignore drafts — e.g. dashboard order counts, if they'd otherwise include drafts). Do NOT touch queries that fetch a single order by id (the order detail page must still open a draft if linked).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → no new errors. Manually confirm (dev/deploy) the Orders page doesn't show draft orders.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(copilot): hide draft orders from the default Orders list"
```

---

## Task 8: Full-suite + integration sanity

**Files:** none.

- [ ] **Step 1: Full agent/copilot suite**

Run: `npm run test:run -- src/lib/agent src/lib/copilot src/lib/webhooks`
Expected: all PASS.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` → no new errors.

- [ ] **Step 3: Integration (deploy or local with OpenRouter key)**

With `copilot_enabled = true` for the test tenant (which has a catalog incl. Retatrutide/BPC-157/TB-500):
1. Inbound: "I'll take 2 reta and a bpc". Confirm: a `'draft'` order exists for the conversation (`select id,status,payment_amount from orders where conversation_id=… and status='draft'`) with 2× Retatrutide + 1× BPC-157 in `order_items`, total = catalog prices; and `agent_messages` shows the agent called `get_peptide_reference`/`query_catalog`/`update_draft_order` + narrated.
2. Inbound: "ship to 12 Test St, Bali" → `set_shipping_address` writes `orders.shipping_address`.
3. Inbound: "I'll pay USDT" → `set_payment_asset` sets `orders.payment_asset`.
4. Confirm the draft does NOT appear in the Orders page list.
5. `finalize_order` should surface as a pending confirm (it's gated) — in Phase 2 there's no copilot UI yet, so verify the pending tool call lands in `agent_messages.tool_calls` with `status:'pending'` (the approval UI is Phase 3).

- [ ] **Step 4: Commit fixes (if any)**

```bash
git add -A && git commit -m "fix(copilot): phase-2 integration fixes"
```

---

## Verification (whole plan)

- **Unit:** `applyItemDeltas` (add/update/remove/recompute/ignore-non-catalog); `get_peptide_reference` projection; commerce tool names + confirm flags + delta forwarding; copilot prompt embeds conversation/customer ids; copilot mode tool-set membership + `finalize_order` gated in `TOOL_MAP`.
- **Integration:** an inbound buying message builds a real `'draft'` order (items priced from catalog, peptide aliases resolved); shipping + payment asset captured; draft hidden from Orders list; `finalize_order` queued as a pending confirm.
- **Tenancy:** every draft-order query filters by `tenant_id` (service-role client bypasses RLS).

## Out of scope (Phase 2)

- **Gated customer-facing senders → Phase 2b:** `send_message` (replicate `@/lib/channels/*` dispatch + outbound message insert server-side; `/api/send` is cookie-gated) and `generate_payment_link` (replicate `createNowPayment` + `createPrivyWallet` + `crypto_payment_links` insert; the `createPaymentLink` server action is cookie-gated).
- **All inbox UI** (commentary timeline, draft-order surface, confirm cards, unified chat panel, retiring v1) → **Phase 3**. Phase 2 is verified via `orders`/`order_items`/`agent_messages` + logs.
- **`[SENT]`/`[OPERATOR]` message mirroring** → Phase 2b/3 (Phase 2 still triggers on `[CUSTOMER]` only).
- **One-draft-per-conversation hard constraint** — enforced in app logic (`getOrCreateDraftOrder` selects the single open draft); a partial unique index is a possible later hardening.
