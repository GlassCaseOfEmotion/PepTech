# Automation Conditions — Design Spec

**Date:** 2026-05-20  
**Status:** Approved

---

## Problem

The automation engine supports four condition types (`trust_score`, `ltv`, `last_message_hours`, `is_new_customer`) and two trigger patterns that handle customer fan-out (`protocol_progress`, event-driven triggers). Merchants cannot express common rules like "days remaining in cycle", "days since last order", "customer has tag", or "don't re-fire within 30 days". The `protocol_progress` trigger also hard-codes what should be a condition, making it impossible to combine protocol timing with other checks.

A second gap: `schedule` automations fire **once per tenant** with no customer context. A merchant who wants "run every day, if protocol days remaining ≤ 5 → send DM" has no way to express it — the schedule handler never iterates customers.

---

## Solution Overview

Three changes, no new database tables:

1. **Extend the `Condition` type** with four new condition types: `protocol_days_remaining`, `days_since_last_order`, `has_tag`, `cooldown_days`.
2. **Add per-customer fan-out to schedule automations** via an optional `scope` field on the trigger params.
3. **Update the builder UI** to expose the new conditions and the scope picker.

The `cooldown_days` condition is the safety valve that prevents a customer from receiving the same automation multiple times within a window — critical when running short-interval schedules.

---

## Data Model

### Condition type union (`src/types/automations.ts`)

No migration required — `conditions` is already `jsonb`. Only the TypeScript type changes.

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
```

`cooldown_days` has no operator — it always means "this automation has not fired (`state = 'ok'` or `'queued'`) for this customer in the last N days."

### Schedule trigger params

```typescript
| { cron: string; scope?: 'tenant' | 'customers' }  // schedule
```

`scope` defaults to `'tenant'` when absent, preserving all existing schedule automations without changes.

---

## Engine Changes (`src/lib/automations/engine.ts` + `src/app/api/automations/process/route.ts`)

### New condition evaluators

All new types are added as branches in `evaluateCondition`:

**`protocol_days_remaining`**
Replicates the calculation already in `processProtocolProgressAutomations`: fetches the customer's most recent delivered order, joins to `product_protocols` for `cycle_length_weeks`, computes `daysRemaining = cycleDays - daysSinceDelivery`. Returns `false` if the customer has no protocol data (safely skipped — no cycle, no fire).

**`days_since_last_order`**
Queries `orders` for the most recent row by `created_at` for `customerId`. Computes days elapsed from now. Returns `false` if no orders exist.

**`has_tag`**
Queries `customer_tags` where `customer_id = customerId` and `tag = cond.value`. Returns `true` if found.

**`cooldown_days`**
Queries `automation_runs` where:
- `automation_id` = current automation
- `context_ref` = `customerId`
- `state IN ('ok', 'queued')`
- `created_at >= now - N days`

Returns `false` if any row exists (cooldown active), `true` if none (safe to fire). Uses existing table — no schema change.

### Schedule fan-out (`processScheduleAutomations`)

When `trigger_params.scope === 'customers'`:

1. Fetch all customers for the tenant (`customers` table, no status filter — conditions handle relevance).
2. For each customer, look up their most recent conversation (`conversations` where `customer_id = X`, any status, ordered by `last_message_at desc`, limit 1) to get a `conversationId` for `send_dm` actions. If no conversation exists, `send_dm` returns `err` for that customer and processing continues.
3. Run `evaluateCondition` for each condition against `{ customerId, conversationId }`.
4. If all conditions pass, run `executeAction` with full customer context.
5. Insert an `automation_runs` row per customer (state `ok`, `queued`, `skip`, or `err`).

When `scope` is `'tenant'` or absent, existing behaviour is unchanged.

**Deduplication note:** `cooldown_days` is the primary dedup mechanism for per-customer schedules. The engine does not add a separate hardcoded dedup check — the condition handles it explicitly and visibly.

---

## Builder UI Changes (`src/components/automations/AutomationsView.tsx`)

### Condition picker

The condition type dropdown adds four new entries:

| Type | Label | Value input |
|---|---|---|
| `protocol_days_remaining` | Days remaining in cycle | Number + operator (≤ / ≥ / =) |
| `days_since_last_order` | Days since last order | Number + operator |
| `has_tag` | Customer has tag | Text field (e.g. `vip`) |
| `cooldown_days` | Don't re-fire within | Number field + static "days" label, no operator |

`cooldown_days` renders differently from the others — no operator dropdown, just: *"Don't fire again within [30] days"*.

### Schedule scope picker

When `trigger_type === 'schedule'`, a second control appears below the cron input:

- **Once per run** — fires once for the tenant (existing behaviour, default)
- **For each customer** — fans out to all customers, conditions evaluated per person

Switching to "For each customer" is what makes the new condition types meaningful for schedule automations.

---

## Backward Compatibility

- All existing automations continue working unchanged — `scope` defaults to `'tenant'`, no existing condition types are modified.
- `protocol_progress` as a trigger type is not removed — existing automations using it keep working. New automations should use `schedule` + `protocol_days_remaining` condition instead.

---

## Error Handling

- `protocol_days_remaining` returns `false` (skip) if the customer has no delivered orders or no product protocol — never throws.
- `days_since_last_order` returns `false` if no orders found.
- `cooldown_days` returns `false` (skip) if the query fails — fail closed rather than risk spamming a customer.
- Per-customer fan-out wraps each customer in a try/catch; one customer failing does not abort the rest.

---

## Out of Scope

- Removing `protocol_progress` trigger type
- Branching/parallel paths in automations (React Flow canvas)
- OR logic between conditions (all conditions remain AND)
- Bulk cooldown reset UI
- Per-condition failure visibility in the run history
