# Automation Conditions + Schedule Fan-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new condition types (`protocol_days_remaining`, `days_since_last_order`, `has_tag`, `cooldown_days`) and make schedule automations fan out per-customer so merchants can write "run every hour, if days remaining ≤ 5 AND not sent in 30 days → send DM."

**Architecture:** Extend the existing `Condition` union type and `evaluateCondition` function in the engine with four new branches. Add a `scope` field to schedule trigger params; when `scope: 'customers'`, `processScheduleAutomations` loops all tenant customers and evaluates conditions per person — identical to how `processProtocolProgressAutomations` already works. `cooldown_days` queries `automation_runs` directly, so no new DB tables are needed. The builder modal gets new condition type options and a scope toggle for schedule triggers.

**Tech Stack:** TypeScript, Next.js 15 App Router, Supabase JS client, Vitest

---

## File Map

| File | Change |
|---|---|
| `src/types/automations.ts` | Extend `Condition` union (4 new types), add `scope` to schedule `TriggerParams`, add `automationId` to engine `Context` |
| `src/lib/automations/engine.ts` | Add 4 new branches in `evaluateCondition`; add `automationId` to `Context` type |
| `src/app/api/automations/process/route.ts` | `processScheduleAutomations` fan-out loop; pass `automationId` to all `evaluateCondition` calls |
| `src/lib/__tests__/automations-engine.test.ts` | New — unit tests for the 4 new condition evaluators |
| `src/components/automations/AutomationModal.tsx` | New condition types in picker; scope toggle for schedule trigger |

---

## Task A: Extend TypeScript types

**Files:**
- Modify: `src/types/automations.ts`

- [ ] **Step 1: Replace the `Condition` type and extend `TriggerParams`**

Open `src/types/automations.ts`. Replace the existing `Condition` type and the schedule entry in `TriggerParams`:

```typescript
export type Condition =
  // Existing
  | { type: 'trust_score';             operator: 'gte' | 'lte' | 'eq'; value: number }
  | { type: 'ltv';                     operator: 'gte' | 'lte' | 'eq'; value: number }
  | { type: 'last_message_hours';      operator: 'gte' | 'lte' | 'eq'; value: number }
  | { type: 'is_new_customer';         operator: 'eq';                  value: boolean }
  // New
  | { type: 'protocol_days_remaining'; operator: 'gte' | 'lte' | 'eq'; value: number }
  | { type: 'days_since_last_order';   operator: 'gte' | 'lte' | 'eq'; value: number }
  | { type: 'has_tag';                 operator: 'eq';                  value: string  }
  | { type: 'cooldown_days';           value: number }

export type TriggerParams =
  | { days_before_end: number }                        // protocol_progress
  | { cron: string; scope?: 'tenant' | 'customers' }   // schedule
  | Record<string, never>                               // new_thread
  | { to_status: string }                              // order_state
```

Note: `cooldown_days` has no `operator` field — the semantics are always "not fired in last N days."

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors (the new union members are additive — existing code that switches on `cond.type` will hit the existing branches and the new ones fall through to the `return true` default).

- [ ] **Step 3: Commit**

```
git add src/types/automations.ts
git commit -m "feat: extend Condition union with 4 new types; add scope to schedule trigger"
```

---

## Task B: Write failing tests for new condition evaluators

**Files:**
- Create: `src/lib/__tests__/automations-engine.test.ts`

The engine's `evaluateCondition` is async and hits Supabase. We mock the client using a proxy chain — any method call returns the chain itself, and `await chain` resolves through the `then` property.

- [ ] **Step 1: Create the test file with the mock helper and first failing test**

Create `src/lib/__tests__/automations-engine.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { evaluateCondition } from '@/lib/automations/engine'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Builds a Supabase mock where every table query resolves to the given result.
// Pass a map of table name → { data, count } to override per table.
function makeSupabase(
  tables: Record<string, { data?: unknown; count?: number | null }> = {}
): SupabaseClient<Database> {
  return {
    from: vi.fn((table: string) => {
      const resp = tables[table] ?? {}
      const result = { data: resp.data ?? null, count: resp.count ?? null, error: null }
      const resolved = Promise.resolve(result)
      const chain: Record<string, unknown> = {
        then: resolved.then.bind(resolved),
        catch: resolved.catch.bind(resolved),
      }
      ;['select','eq','neq','in','gte','not','order','limit'].forEach(m => {
        chain[m] = vi.fn().mockReturnValue(chain)
      })
      chain['maybeSingle'] = vi.fn().mockResolvedValue(result)
      chain['single']      = vi.fn().mockResolvedValue(result)
      return chain
    }),
  } as unknown as SupabaseClient<Database>
}

// ── protocol_days_remaining ───────────────────────────────────────────────────

describe('evaluateCondition: protocol_days_remaining', () => {
  it('returns true when days remaining satisfy lte condition', async () => {
    // Customer delivered 23 days ago on a 4-week (28-day) cycle → 5 days remaining
    const deliveredAt = new Date(Date.now() - 23 * 86_400_000).toISOString()
    const supabase = makeSupabase({
      orders:           { data: { id: 'ord1', delivered_at: deliveredAt } },
      order_items:      { data: [{ product_id: 'p1' }] },
      product_protocols:{ data: [{ cycle_length_weeks: 4 }] },
    })
    const result = await evaluateCondition(
      { type: 'protocol_days_remaining', operator: 'lte', value: 5 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(true)
  })

  it('returns false when days remaining do not satisfy condition', async () => {
    // Customer delivered 10 days ago on a 4-week cycle → 18 days remaining
    const deliveredAt = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const supabase = makeSupabase({
      orders:           { data: { id: 'ord1', delivered_at: deliveredAt } },
      order_items:      { data: [{ product_id: 'p1' }] },
      product_protocols:{ data: [{ cycle_length_weeks: 4 }] },
    })
    const result = await evaluateCondition(
      { type: 'protocol_days_remaining', operator: 'lte', value: 5 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(false)
  })

  it('returns false when customer has no delivered order', async () => {
    const supabase = makeSupabase({ orders: { data: null } })
    const result = await evaluateCondition(
      { type: 'protocol_days_remaining', operator: 'lte', value: 5 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(false)
  })

  it('returns false when product has no protocol', async () => {
    const deliveredAt = new Date(Date.now() - 23 * 86_400_000).toISOString()
    const supabase = makeSupabase({
      orders:           { data: { id: 'ord1', delivered_at: deliveredAt } },
      order_items:      { data: [{ product_id: 'p1' }] },
      product_protocols:{ data: [] },
    })
    const result = await evaluateCondition(
      { type: 'protocol_days_remaining', operator: 'lte', value: 5 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(false)
  })
})

// ── days_since_last_order ─────────────────────────────────────────────────────

describe('evaluateCondition: days_since_last_order', () => {
  it('returns true when days since last order satisfy gte condition', async () => {
    const createdAt = new Date(Date.now() - 35 * 86_400_000).toISOString()
    const supabase = makeSupabase({ orders: { data: { created_at: createdAt } } })
    const result = await evaluateCondition(
      { type: 'days_since_last_order', operator: 'gte', value: 30 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(true)
  })

  it('returns false when last order is too recent', async () => {
    const createdAt = new Date(Date.now() - 5 * 86_400_000).toISOString()
    const supabase = makeSupabase({ orders: { data: { created_at: createdAt } } })
    const result = await evaluateCondition(
      { type: 'days_since_last_order', operator: 'gte', value: 30 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(false)
  })

  it('returns false when customer has no orders', async () => {
    const supabase = makeSupabase({ orders: { data: null } })
    const result = await evaluateCondition(
      { type: 'days_since_last_order', operator: 'gte', value: 30 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(false)
  })
})

// ── has_tag ───────────────────────────────────────────────────────────────────

describe('evaluateCondition: has_tag', () => {
  it('returns true when customer has the tag', async () => {
    const supabase = makeSupabase({ customer_tags: { data: { tag: 'vip' } } })
    const result = await evaluateCondition(
      { type: 'has_tag', operator: 'eq', value: 'vip' },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(true)
  })

  it('returns false when customer does not have the tag', async () => {
    const supabase = makeSupabase({ customer_tags: { data: null } })
    const result = await evaluateCondition(
      { type: 'has_tag', operator: 'eq', value: 'vip' },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(false)
  })
})

// ── cooldown_days ─────────────────────────────────────────────────────────────

describe('evaluateCondition: cooldown_days', () => {
  it('returns false when automation fired for this customer within the window', async () => {
    const supabase = makeSupabase({ automation_runs: { count: 1 } })
    const result = await evaluateCondition(
      { type: 'cooldown_days', value: 30 },
      { customerId: 'c1', automationId: 'auto1' },
      supabase,
    )
    expect(result).toBe(false)
  })

  it('returns true when no run exists within the window', async () => {
    const supabase = makeSupabase({ automation_runs: { count: 0 } })
    const result = await evaluateCondition(
      { type: 'cooldown_days', value: 30 },
      { customerId: 'c1', automationId: 'auto1' },
      supabase,
    )
    expect(result).toBe(true)
  })

  it('returns false (fail closed) when automationId is missing', async () => {
    const supabase = makeSupabase({})
    const result = await evaluateCondition(
      { type: 'cooldown_days', value: 30 },
      { customerId: 'c1' },  // no automationId
      supabase,
    )
    expect(result).toBe(false)
  })

  it('returns false (fail closed) when query errors', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ count: null, error: { message: 'DB error' } }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>
    const result = await evaluateCondition(
      { type: 'cooldown_days', value: 30 },
      { customerId: 'c1', automationId: 'auto1' },
      supabase,
    )
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — confirm they all fail**

```
npm run test:run -- src/lib/__tests__/automations-engine.test.ts
```

Expected: all tests fail with "evaluateCondition is not a function" or similar (the new condition types don't exist yet).

- [ ] **Step 3: Commit the failing tests**

```
git add src/lib/__tests__/automations-engine.test.ts
git commit -m "test: failing tests for new automation condition evaluators"
```

---

## Task C: Implement new condition evaluators

**Files:**
- Modify: `src/lib/automations/engine.ts`

- [ ] **Step 1: Add `automationId` to the `Context` type**

At the top of `src/lib/automations/engine.ts`, update the `Context` type:

```typescript
type Context = {
  conversationId?: string
  customerId?: string
  orderId?: string
  toStatus?: string
  fromStatus?: string
  automationId?: string
}
```

- [ ] **Step 2: Add the four new branches in `evaluateCondition`**

Inside `evaluateCondition`, after the existing `if (cond.type === 'is_new_customer')` block and before the final `return true`, add:

```typescript
  if (cond.type === 'protocol_days_remaining') {
    // Step 1: most recent delivered order for this customer
    const { data: order } = await supabase
      .from('orders')
      .select('id, delivered_at')
      .eq('customer_id', customerId)
      .eq('status', 'delivered')
      .not('delivered_at', 'is', null)
      .order('delivered_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!order?.delivered_at) return false

    // Step 2: product IDs in that order
    const { data: items } = await supabase
      .from('order_items')
      .select('product_id')
      .eq('order_id', order.id)
    const productIds = (items ?? []).map((r: { product_id: string }) => r.product_id)
    if (!productIds.length) return false

    // Step 3: max cycle_length_weeks across those products
    const { data: protocols } = await supabase
      .from('product_protocols')
      .select('cycle_length_weeks')
      .in('product_id', productIds)
    const weeks = (protocols ?? []).reduce(
      (max: number, r: { cycle_length_weeks: number | null }) =>
        r.cycle_length_weeks != null && r.cycle_length_weeks > max ? r.cycle_length_weeks : max,
      0,
    )
    if (!weeks) return false

    const cycleDays = weeks * 7
    const daysSince = (Date.now() - new Date(order.delivered_at).getTime()) / 86_400_000
    const daysRemaining = Math.round(cycleDays - daysSince)
    return compare(daysRemaining, cond.operator, cond.value as number)
  }

  if (cond.type === 'days_since_last_order') {
    const { data: order } = await supabase
      .from('orders')
      .select('created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!order?.created_at) return false
    const daysSince = (Date.now() - new Date(order.created_at).getTime()) / 86_400_000
    return compare(daysSince, cond.operator, cond.value as number)
  }

  if (cond.type === 'has_tag') {
    const { data } = await supabase
      .from('customer_tags')
      .select('tag')
      .eq('customer_id', customerId)
      .eq('tag', cond.value as string)
      .maybeSingle()
    return data != null
  }

  if (cond.type === 'cooldown_days') {
    const { automationId } = context
    if (!automationId) return false  // fail closed — no automationId means can't check
    const windowStart = new Date(Date.now() - (cond.value as number) * 86_400_000).toISOString()
    try {
      const { count, error } = await supabase
        .from('automation_runs')
        .select('id', { count: 'exact', head: true })
        .eq('automation_id', automationId)
        .eq('context_ref', customerId)
        .in('state', ['ok', 'queued'])
        .gte('created_at', windowStart)
      if (error) return false  // fail closed on DB error
      return (count ?? 1) === 0
    } catch {
      return false  // fail closed on any exception
    }
  }
```

- [ ] **Step 3: Run tests — confirm they all pass**

```
npm run test:run -- src/lib/__tests__/automations-engine.test.ts
```

Expected: all 11 tests pass.

- [ ] **Step 4: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```
git add src/lib/automations/engine.ts
git commit -m "feat: add protocol_days_remaining, days_since_last_order, has_tag, cooldown_days condition evaluators"
```

---

## Task D: Schedule fan-out + pass automationId to all evaluateCondition calls

**Files:**
- Modify: `src/app/api/automations/process/route.ts`
- Modify: `src/lib/automations/engine.ts` (add `automationId` to context in `runAutomationsForEvent`)

Two changes across these files:
1. Every existing call to `evaluateCondition` needs `automationId: automation.id` added to the context object, so `cooldown_days` works across all trigger types.
2. `processScheduleAutomations` gets a new per-customer path when `scope === 'customers'`.

- [ ] **Step 1: Pass `automationId` to all existing `evaluateCondition` calls**

Search the file for `evaluateCondition(c,` — there are four call sites. Add `automationId: automation.id` to the context argument in each:

In `processScheduleAutomations` (around line 63):
```typescript
      const condResults = await Promise.all(
        conditions.map(c => evaluateCondition(c, { automationId: automation.id }, supabase)),
      )
```

In `processProtocolProgressAutomations` (around line 264):
```typescript
        const context = { customerId: customer.customer_id, automationId: automation.id }
```

In `processScheduledRuns` (around line 364):
```typescript
      const ctx = {
        customerId: storedPayload?.context?.customerId ?? undefined,
        orderId: storedPayload?.context?.orderId ?? undefined,
        conversationId: storedPayload?.context?.conversationId ?? undefined,
        automationId: run.automation_id,
      }
```

In `runAutomationsForEvent` in `engine.ts` (around line 216):
```typescript
      const condResults = await Promise.all(
        conditions.map(c => evaluateCondition(c, { ...context, automationId: automation.id }, supabase))
      )
```

- [ ] **Step 2: Add the per-customer fan-out path to `processScheduleAutomations`**

Replace the entire `processScheduleAutomations` function with this version that handles both `scope: 'tenant'` (existing) and `scope: 'customers'` (new):

```typescript
async function processScheduleAutomations(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const { data: automations } = await supabase
    .from('automations')
    .select('*')
    .eq('state', 'on')
    .eq('trigger_type', 'schedule')

  if (!automations?.length) return 0

  const currentHour = new Date().getUTCHours()
  let inserted = 0

  for (const rawAuto of automations) {
    const automation = rawAuto as unknown as Automation
    const tp = automation.trigger_params as { cron?: string; scope?: 'tenant' | 'customers' }
    if (!tp.cron) continue

    const triggerHour = parseCronHour(tp.cron)
    if (triggerHour !== currentHour) continue

    if (tp.scope === 'customers') {
      inserted += await processSchedulePerCustomer(supabase, automation)
    } else {
      inserted += await processScheduleTenant(supabase, automation)
    }
  }

  return inserted
}

async function processScheduleTenant(
  supabase: ReturnType<typeof createServiceClient>,
  automation: Automation,
): Promise<number> {
  try {
    const conditions = (automation.conditions ?? []) as Condition[]
    const condResults = await Promise.all(
      conditions.map(c => evaluateCondition(c, { automationId: automation.id }, supabase)),
    )
    if (!condResults.every(Boolean)) {
      await supabase.from('automation_runs').insert({
        automation_id: automation.id,
        tenant_id: automation.tenant_id,
        state: 'skip',
        context_ref: null,
        context_label: null,
        action_summary: 'Conditions not met',
        action_payload: null,
      })
      return 1
    }
    const result = await executeAction(automation, {}, supabase)
    await supabase.from('automation_runs').insert({
      automation_id: automation.id,
      tenant_id: automation.tenant_id,
      state: result.state,
      context_ref: null,
      context_label: null,
      action_summary: result.action_summary,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      action_payload: result.action_payload as any,
    })
    return 1
  } catch (err) {
    console.error(`[cron] schedule automation ${automation.id} failed:`, err)
    try {
      await supabase.from('automation_runs').insert({
        automation_id: automation.id,
        tenant_id: automation.tenant_id,
        state: 'err',
        context_ref: null,
        context_label: null,
        action_summary: err instanceof Error ? err.message : String(err),
        action_payload: null,
      })
    } catch { /* swallow */ }
    return 1
  }
}

async function processSchedulePerCustomer(
  supabase: ReturnType<typeof createServiceClient>,
  automation: Automation,
): Promise<number> {
  // Fetch all customers for this tenant
  const { data: customers } = await supabase
    .from('customers')
    .select('id')
    .eq('tenant_id', automation.tenant_id)

  if (!customers?.length) return 0

  let inserted = 0
  for (const customer of customers) {
    const customerId = customer.id

    // Look up most recent conversation for send_dm actions
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('customer_id', customerId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    const context = {
      customerId,
      conversationId: conv?.id ?? undefined,
      automationId: automation.id,
    }

    try {
      const conditions = (automation.conditions ?? []) as Condition[]
      const condResults = await Promise.all(
        conditions.map(c => evaluateCondition(c, context, supabase)),
      )

      if (!condResults.every(Boolean)) {
        await supabase.from('automation_runs').insert({
          automation_id: automation.id,
          tenant_id: automation.tenant_id,
          state: 'skip',
          context_ref: customerId,
          context_label: null,
          action_summary: 'Conditions not met',
          action_payload: null,
        })
        inserted++
        continue
      }

      const result = await executeAction(automation, context, supabase)
      await supabase.from('automation_runs').insert({
        automation_id: automation.id,
        tenant_id: automation.tenant_id,
        state: result.state,
        context_ref: customerId,
        context_label: null,
        action_summary: result.action_summary,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action_payload: result.action_payload as any,
      })
      inserted++
    } catch (err) {
      console.error(`[cron] schedule per-customer automation ${automation.id} customer ${customerId} failed:`, err)
      try {
        await supabase.from('automation_runs').insert({
          automation_id: automation.id,
          tenant_id: automation.tenant_id,
          state: 'err',
          context_ref: customerId,
          context_label: null,
          action_summary: err instanceof Error ? err.message : String(err),
          action_payload: null,
        })
        inserted++
      } catch { /* swallow */ }
    }
  }
  return inserted
}
```

- [ ] **Step 3: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 4: Run all tests**

```
npm run test:run
```

Expected: all tests pass, including the 11 engine tests from Task C.

- [ ] **Step 5: Commit**

```
git add src/app/api/automations/process/route.ts src/lib/automations/engine.ts
git commit -m "feat: schedule automations fan out per-customer when scope='customers'; pass automationId to all condition evaluations"
```

---

## Task E: Update the automation builder modal

**Files:**
- Modify: `src/components/automations/AutomationModal.tsx`

Two changes: (1) new condition types in the picker with appropriate inputs, (2) scope toggle for schedule triggers.

- [ ] **Step 1: Add new condition types to the CONDITION_TYPES array and labels**

At the top of `AutomationModal.tsx`, replace:

```typescript
const CONDITION_TYPES: Condition['type'][] = ['trust_score', 'ltv', 'last_message_hours', 'is_new_customer']
```

With:

```typescript
const CONDITION_TYPES: { value: Condition['type']; label: string }[] = [
  { value: 'trust_score',             label: 'Trust score'              },
  { value: 'ltv',                     label: 'Lifetime value'           },
  { value: 'last_message_hours',      label: 'Hours since last message' },
  { value: 'is_new_customer',         label: 'Is new customer'         },
  { value: 'protocol_days_remaining', label: 'Days remaining in cycle'  },
  { value: 'days_since_last_order',   label: 'Days since last order'    },
  { value: 'has_tag',                 label: 'Customer has tag'         },
  { value: 'cooldown_days',           label: 'Don\'t re-fire within'    },
]
```

- [ ] **Step 2: Update `addCondition` to use the new shape**

Replace:

```typescript
  function addCondition() {
    setConditions(prev => [...prev, { type: 'trust_score', operator: 'gte', value: 0 }])
  }
```

With:

```typescript
  function addCondition() {
    setConditions(prev => [...prev, { type: 'trust_score', operator: 'gte', value: 0 } as Condition])
  }
```

- [ ] **Step 3: Update `updateCondition` to handle new types**

Replace the existing `updateCondition` function:

```typescript
  function updateCondition(i: number, patch: Partial<Record<string, unknown>>) {
    setConditions(prev => prev.map((c, idx) => {
      if (idx !== i) return c
      const next = { ...c, ...patch } as Condition
      if (patch.type !== undefined && patch.type !== c.type) {
        const t = patch.type as Condition['type']
        if (t === 'is_new_customer') return { type: t, operator: 'eq', value: false } as Condition
        if (t === 'has_tag') return { type: t, operator: 'eq', value: '' } as Condition
        if (t === 'cooldown_days') return { type: t, value: 30 } as Condition
        return { type: t, operator: 'gte', value: 0 } as Condition
      }
      return next
    }))
  }
```

- [ ] **Step 4: Replace the condition row renderer**

Find the condition row JSX (the `.map((c, i) => ...)` block) and replace it entirely:

```tsx
                {conditions.map((c, i) => (
                  <div key={i} className="pt-au-condition-row">
                    <select
                      className="pt-input"
                      value={c.type}
                      onChange={e => updateCondition(i, { type: e.target.value })}
                    >
                      {CONDITION_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>

                    {/* No operator for cooldown_days */}
                    {c.type !== 'cooldown_days' && c.type !== 'has_tag' && (
                      <select
                        className="pt-input pt-au-condition-op"
                        value={(c as { operator: string }).operator ?? 'gte'}
                        onChange={e => updateCondition(i, { operator: e.target.value })}
                      >
                        {CONDITION_OPERATORS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}

                    {/* Value input varies by type */}
                    {c.type === 'is_new_customer' && (
                      <input
                        type="checkbox"
                        className="pt-au-condition-bool"
                        checked={Boolean(c.value)}
                        onChange={e => updateCondition(i, { value: e.target.checked })}
                      />
                    )}
                    {c.type === 'has_tag' && (
                      <input
                        type="text"
                        className="pt-input pt-au-condition-val"
                        placeholder="tag name"
                        value={c.value as string}
                        onChange={e => updateCondition(i, { value: e.target.value })}
                      />
                    )}
                    {c.type === 'cooldown_days' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="number"
                          className="pt-input pt-au-condition-val"
                          min={1}
                          value={c.value as number}
                          onChange={e => updateCondition(i, { value: Number(e.target.value) })}
                        />
                        <span style={{ fontSize: 12, color: 'var(--pt-fg-3)', whiteSpace: 'nowrap' }}>days</span>
                      </div>
                    )}
                    {c.type !== 'is_new_customer' && c.type !== 'has_tag' && c.type !== 'cooldown_days' && (
                      <input
                        type="number"
                        className="pt-input pt-au-condition-val"
                        value={c.value as number}
                        onChange={e => updateCondition(i, { value: Number(e.target.value) })}
                      />
                    )}

                    <button
                      className="pt-au-condition-remove"
                      onClick={() => removeCondition(i)}
                      aria-label="Remove condition"
                    >✕</button>
                  </div>
                ))}
```

- [ ] **Step 5: Add scope toggle to the schedule trigger params renderer**

Inside `renderTriggerParams()`, in the `case 'schedule':` block, add the scope toggle after the hour select:

```tsx
      case 'schedule': {
        const cron  = (triggerParams.cron  as string | undefined) ?? '0 9 * * *'
        const scope = (triggerParams.scope as string | undefined) ?? 'tenant'
        const hour  = parseInt(cron.split(' ')[1] ?? '9', 10)
        return (
          <>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Hour (every day)</label>
              <select
                className="pt-input"
                value={hour}
                onChange={e => setTriggerParams(prev => ({ ...prev, cron: `0 ${e.target.value} * * *` }))}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Runs</label>
              <select
                className="pt-input"
                value={scope}
                onChange={e => setTriggerParams(prev => ({ ...prev, scope: e.target.value }))}
              >
                <option value="tenant">Once per run</option>
                <option value="customers">For each customer</option>
              </select>
            </div>
            {scope === 'customers' && (
              <p className="pt-au-modal-hint">
                Evaluates conditions for every customer individually. Add a <b>Don&apos;t re-fire within</b> condition to prevent repeated sends.
              </p>
            )}
          </>
        )
      }
```

- [ ] **Step 6: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run all tests**

```
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```
git add src/components/automations/AutomationModal.tsx
git commit -m "feat: add new condition types and per-customer scope picker to automation builder"
```

---

## Verification

After all tasks complete:

1. Open the automation builder → create a new automation with `schedule` trigger → verify "Runs" dropdown shows "Once per run" / "For each customer"
2. Switch to "For each customer" → verify hint text appears recommending a cooldown condition
3. Add a condition → verify all 8 condition types appear in the dropdown
4. Select "Don't re-fire within" → verify no operator dropdown, just a number field + "days" label
5. Select "Customer has tag" → verify a text input appears (no operator, no number)
6. Select "Days remaining in cycle" → verify operator dropdown + number field
7. Save the automation → verify it saves without TypeScript/runtime errors
8. Trigger the cron endpoint manually (or wait for the hourly run) → check `automation_runs` rows have `context_ref` set to customer IDs when `scope: 'customers'`
9. Fire the same automation again → check the `cooldown_days` condition prevents double-firing (rows show `state: 'skip'`)
