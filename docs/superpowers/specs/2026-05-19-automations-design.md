# Automations — Design Spec

**Date:** 2026-05-19
**Status:** Approved

---

## Problem

Tenant operators manually handle routine touchpoints that should be automated: sending reorder reminders when a customer's peptide cycle is ending, welcoming new inbound contacts, updating trust scores when orders are delivered, and sending a daily digest. This is repetitive, error-prone, and doesn't scale. The platform already has a polished mock UI for automations — but there's no backend.

---

## Goal

Build a full workflow automation system: a WHEN → IF → THEN builder that tenants can configure, toggle, and monitor. Automations fire from real events (new thread, order state change) and on a scheduled basis (protocol progress, daily cron). Outbound DMs are queued for human review before sending.

---

## Scope

**In scope:**
- CRUD for automations (create, edit, delete, toggle on/off/paused)
- 4 trigger types: `protocol_progress`, `schedule`, `new_thread`, `order_state`
- 4 action types: `send_dm` (review queue), `operator_alert`, `score_adjust`, `operator_task`
- Condition evaluation: trust score, LTV, last message hours, is new customer
- Execution engine wired into existing event handlers
- Vercel cron for scheduled triggers
- Approve/dismiss UI for queued draft DMs
- Default templates seeded for new tenants

**Out of scope:**
- SMS/email actions (WhatsApp/Telegram only, via existing `/api/send`)
- Complex branching logic (if/else trees)
- A/B testing of automation messages
- Real-time execution logs dashboard

---

## Data Model

### `automations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | FK, RLS-scoped |
| `name` | text | Display name |
| `icon` | text | Icon key (send, check, alert, etc.) |
| `state` | text | `on` \| `off` \| `paused` |
| `trigger_type` | text | See trigger types below |
| `trigger_params` | jsonb | Type-specific parameters |
| `conditions` | jsonb | Array of condition objects |
| `action_type` | text | See action types below |
| `action_params` | jsonb | Type-specific parameters |
| `sort_order` | int | Display ordering |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `automation_runs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `automation_id` | uuid | FK → automations, CASCADE |
| `tenant_id` | uuid | RLS-scoped |
| `state` | text | `ok` \| `skip` \| `warn` \| `err` \| `queued` |
| `context_ref` | text | customer_id or order_id |
| `context_label` | text | Human-readable (e.g. "swolepriest") |
| `action_summary` | text | What happened |
| `action_payload` | jsonb | For queued DMs: `{conversationId, message, customerId}` |
| `created_at` | timestamptz | |

---

## Trigger Types

### `protocol_progress`
Fires when a customer's estimated cycle has N days remaining, based on their most recent delivered order date and the product's `cycle_length_weeks` from `product_protocols`.

**Parameters:** `{ days_before_end: number }` — e.g. `{ days_before_end: 5 }`

**Deduplication:** Skip if an `automation_runs` row already exists for this customer + automation within the current cycle window.

### `schedule`
Fires at a fixed UTC hour every day.

**Parameters:** `{ cron: string }` — e.g. `{ cron: "0 8 * * *" }` (8am UTC daily)

**Implementation:** Simple hour match — `new Date().getUTCHours() === parsed_hour`.

### `new_thread`
Fires when a new inbound conversation is created for the first time (not on subsequent messages in an existing conversation).

**Parameters:** `{}` (none)

**Hook:** Inside `processInboundMessage()` in `src/lib/webhooks/processor.ts`, after the conversation is newly inserted (not found pre-existing).

### `order_state`
Fires when an order transitions to a specific status.

**Parameters:** `{ to_status: string }` — e.g. `{ to_status: "delivered" }`

**Hook:** End of `updateOrderStatus()`, `confirmPayment()`, `packOrder()`, `shipOrder()` in `src/app/orders/actions.ts`.

---

## Condition Types

All conditions are evaluated server-side by querying the DB. Each condition:
```typescript
{ type: ConditionType, operator: 'gte' | 'lte' | 'eq', value: number | boolean }
```

| Type | What it checks |
|---|---|
| `trust_score` | `customers.trust_score` |
| `ltv` | `customers.ltv` |
| `last_message_hours` | Hours since customer's last message |
| `is_new_customer` | No prior delivered orders |

If any condition fails → `state: 'skip'` run logged, automation does not execute.

---

## Action Types

### `send_dm`
Sends a WhatsApp/Telegram message to the customer associated with the trigger context.

**Parameters:** `{ message: string, review_required: boolean }`

**With `review_required: true`** (default): Inserts `automation_runs` row with `state: 'queued'` and `action_payload: { conversationId, message, customerId }`. Operator sees it in the Automations page "Pending review" section and can Approve (sends via `/api/send`) or Dismiss.

**With `review_required: false`**: Sends immediately via `/api/send`, logs `state: 'ok'`.

### `operator_alert`
Creates a visible alert for the operator.

**Parameters:** `{ message: string, severity: 'info' | 'warn' | 'err' }`

**Implementation:** Inserts `automation_runs` row with matching state (`warn`/`err`/`ok`). Surfaces on the Automations page recent runs list.

### `score_adjust`
Adjusts a customer's trust score.

**Parameters:** `{ delta: number, reason: string }`

**Implementation:** `UPDATE customers SET trust_score = trust_score + delta WHERE id = customerId`. Clamps to 0–100. Logs `state: 'ok'`.

### `operator_task`
Creates a reminder task for the operator.

**Parameters:** `{ title: string }`

**Implementation:** Logs `state: 'ok'` with title as `action_summary`. (Future: dedicated tasks table.)

---

## Execution Engine

Single entry point:
```typescript
// src/lib/automations/engine.ts
export async function runAutomationsForEvent(
  supabase: SupabaseClient,
  tenantId: string,
  triggerType: 'new_thread' | 'order_state',
  context: EventContext
): Promise<void>
```

**EventContext shape:**
```typescript
{
  conversationId?: string
  customerId?: string
  orderId?: string
  toStatus?: string
  fromStatus?: string
}
```

**Per automation:**
1. Fetch all `state = 'on'` automations for `tenantId` with matching `trigger_type`
2. Filter by `trigger_params` match (e.g. `to_status` matches for `order_state`)
3. Evaluate each condition in `conditions[]` — all must pass
4. Execute action
5. Insert `automation_runs` row
6. Wrap each automation in try/catch — on error, insert `state: 'err'` run and continue

**Non-blocking:** All event hook calls are fire-and-forget (`void fn().catch(console.error)`). Automation failures never block the main request.

---

## Scheduled Execution

**Route:** `GET /api/automations/process`

**Security:** Bearer token from `CRON_SECRET` env var.

**Schedule:** Hourly via Vercel cron (`vercel.json`).

**What it does:**
1. Uses `createServiceClient()` (bypasses RLS) to scan all tenants
2. **Schedule automations:** Match automations whose `trigger_params.cron` hour equals current UTC hour. Fire once per matching tenant per day.
3. **Protocol progress:** Join `customers` → `orders` (latest delivered) → `order_items` → `product_protocols`. Compute days remaining. Match against `trigger_params.days_before_end`. Deduplicate via existing runs.

---

## UI Changes

### AutomationsView (existing, modified)
- Replaces hardcoded `AUTOMATIONS_DATA` with server-fetched data
- Toggle calls `toggleAutomation()` server action (optimistic)
- Recent runs section rendered from real `automation_runs` data
- New **"Pending review"** section in the detail panel for `state: 'queued'` runs with Approve/Dismiss buttons
- "New automation" and "Edit flow" buttons open `AutomationModal`

### AutomationModal (new)
Single-scroll modal (no wizard steps) with four sections:

```
Name + Icon
─────────────
WHEN  [trigger type select + params]
─────────────
IF    [conditions list + add button]
─────────────
THEN  [action type select + params]
─────────────
[Cancel] [Save automation]
```

**Trigger param fields:**
- `protocol_progress`: number input "Days before cycle end"
- `schedule`: hour select (0–23) + "every day" label
- `new_thread`: static text only
- `order_state`: status select (awaiting/confirming/packing/shipped/delivered)

**Action param fields:**
- `send_dm`: textarea + review checkbox (default: checked)
- `operator_alert`: message text + severity select
- `score_adjust`: number input (± delta) + reason text
- `operator_task`: title text input

---

## Default Templates

Seeded via `seed_default_automations(tenant_id)` SQL function when a new tenant is created. All start in `off` state so they don't fire until the operator reviews and enables them.

| # | Name | Trigger | Action |
|---|---|---|---|
| 1 | Reorder nudge | `protocol_progress` (5d before end) | `send_dm` (review) |
| 2 | First-contact welcome | `new_thread` | `send_dm` (review) |
| 3 | Daily digest | `schedule` (08:00 UTC) | `operator_alert` |
| 4 | Trust score: delivery | `order_state` (→ delivered) | `score_adjust` (+3) |
| 5 | Trust score: dispute | `order_state` (→ disputed) | `score_adjust` (−15) |

---

## Security & Multi-tenancy

- Both `automations` and `automation_runs` tables have RLS policies: `tenant_id` must match the authenticated user's tenant (resolved via `users` table join, same pattern as `media_items`).
- Server actions verify ownership before any mutation.
- The cron endpoint uses `createServiceClient()` (service role) only for the scheduled cross-tenant scan — all subsequent action execution uses per-tenant Supabase clients.
- `CRON_SECRET` env var prevents unauthorized cron endpoint invocation.

---

## Non-Goals & Future Work

- **Builder complexity:** No branching, no multi-step flows, no delays. This is a v1 WHEN→IF→THEN system.
- **Real-time run logs:** Runs are shown in the detail panel (last 5). A full run history page is out of scope.
- **External integrations:** No Zapier/Make/webhook outputs. Actions are internal only.
- **Protocol tracking per customer:** The engine reads the most recent delivered order + protocol. More sophisticated cycle tracking (e.g., partial doses) is a future enhancement.
