# Peptech — Leads Management Design Spec
**Date:** 2026-05-23
**Status:** Approved (design phase)

---

## Overview

Peptech today has a single notion of a person: `customers`. The moment anyone messages a tenant's WhatsApp, Telegram, or email channel, a `customer` row is auto-created so the conversation can attach to it. This means the Customers directory is a mixed bag — real buyers, first-touch strangers, tire-kickers who ghosted, and spam — with most rows carrying meaningless `ltv = 0` and default `trust_score`.

This spec introduces a **lead** concept alongside the existing customer. A lead is a contact who has not yet converted (no paid order, not manually promoted). The split lets tenants:

1. Filter the noise out of the customer directory.
2. See the conversion funnel ("X new leads → Y converted in the last 30 days").
3. Track where leads come from (acquisition source) without polluting the customer record.

The split is implemented as a `lifecycle_stage` on the existing `customers` table — not a new table — so conversations, notes, channels, tags, and every existing relationship keep working unchanged.

---

## Scope

### In scope (v1)

- `lifecycle_stage` field on `customers` (`lead` | `customer`).
- `acquisition_source` field (5-bucket enum) + optional `referred_by_customer_id` and free-text note.
- `converted_at` timestamp on conversion.
- Auto-flip lead → customer when the first order moves to a paid status (Postgres trigger).
- Manual flip in both directions via row menu / detail page button.
- Rename `/customers` route to `/contacts` with Leads and Customers tabs (default: Leads).
- Subtle, dismissable acquisition-source prompt on first conversation open.
- Migration of existing customers: anyone with a paid order stays a customer, everyone else becomes a lead.

### Out of scope (deferred)

- Pipeline stages on leads (e.g. `new → contacted → quoted → lost`). Existing conversation status already covers conversation state.
- A `churned` lifecycle stage. Two states only: lead, customer.
- Acquisition-source analytics / charts. Capturing the field; visualisation comes in a follow-up spec.
- Lead-specific automations. Existing automation engine is untouched.
- Leads on the dashboard (reorder intelligence, revenue widgets stay customer-only).
- Bulk lead import (CSV).
- Lead approval queue.
- Auto-spam detection. Manual block only.

---

## Data Model

### Schema changes

Single migration on `public.customers`:

```sql
alter table public.customers
  add column lifecycle_stage text not null default 'lead'
    check (lifecycle_stage in ('lead', 'customer')),
  add column acquisition_source text
    check (acquisition_source in
      ('referral', 'community', 'group_chat', 'direct', 'other')),
  add column acquisition_source_note text,
  add column referred_by_customer_id uuid
    references public.customers(id) on delete set null,
  add column converted_at timestamptz;

create index customers_lifecycle_stage_idx
  on public.customers (tenant_id, lifecycle_stage);

create index customers_acquisition_source_idx
  on public.customers (tenant_id, acquisition_source)
  where acquisition_source is not null;
```

Field semantics:

| Field | Purpose |
|---|---|
| `lifecycle_stage` | `lead` or `customer`. Two values only. Drives tab filtering and detail-page section visibility. |
| `acquisition_source` | Nullable. How the lead found out about the tenant (channel-agnostic). |
| `acquisition_source_note` | Free-text companion. Used when source is `other`, or as a free-text note alongside `referral` when the referrer isn't in the system. |
| `referred_by_customer_id` | Optional FK back into `customers`. Only meaningful when `acquisition_source = 'referral'`. |
| `converted_at` | Set when lifecycle_stage flips lead → customer. Drives the funnel-time metric. |

### Acquisition source enum

Five buckets. Chosen for grey-market peptide acquisition realities; paid ads / social are excluded because they're effectively unavailable to dealers and would only produce empty data.

| Value | Meaning |
|---|---|
| `referral` | Sent by an existing customer. Sets `referred_by_customer_id` when the referrer is identifiable. |
| `community` | Forum or community (Reddit, MesoRX, AnabolicMinds, etc.). |
| `group_chat` | Telegram / Signal / Discord group where dealers are discussed. |
| `direct` | Came straight to the tenant's handle with no obvious upstream channel. Catch-all for word-of-mouth offline or unknowable origin. |
| `other` | Free-text fallback. Requires `acquisition_source_note`. |

### Channel of first contact

Not a new field. Already captured for free via `conversations.channel_type` (`whatsapp` | `telegram` | `email`). Exposed in the Leads list as a column and as a filter. Distinct from `acquisition_source` — channel is *how they reached you*; source is *how they heard about you*.

### Tables unchanged

`conversations`, `messages`, `notes`, `customer_channels`, `customer_tags`, `orders`, and all others are untouched. RLS is inherited from the existing `customers` policy.

---

## Conversion Mechanics

### Auto-flip on first paid order

Postgres trigger on `orders` AFTER UPDATE OF status (and AFTER INSERT, for the import case):

- If the new status is in `('confirming', 'packing', 'shipped', 'delivered')` — i.e. payment has been registered — and the linked customer's `lifecycle_stage = 'lead'`, the trigger sets:
  - `lifecycle_stage = 'customer'`
  - `converted_at = now()`
- Idempotent: if already `customer`, no-op.

Keeping the rule in the database means application code can't forget to call it, and it works regardless of how the order status was changed (server action, webhook, manual SQL).

### Manual flip — lead → customer

"Convert to customer" button in two locations:
- Lead detail page header.
- Inbox conversation header (when the linked contact is a lead).

Both call a `setLifecycleStage(customer_id, 'customer')` server action that flips the flag and sets `converted_at = now()`. Use case: tenant imports a known buyer, or someone paid off-platform.

### Manual flip — customer → lead

Row menu action "Mark as lead" with a confirm dialog. Clears `converted_at`. Use case: misclassification during the one-time migration. If the contact is later re-converted (auto or manual), `converted_at` is set to the new timestamp — the field always reflects the most recent conversion, not the historical first one.

### Activity log

Each lifecycle flip writes a row to a `customer_events` table:

```sql
create table public.customer_events (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  customer_id  uuid        not null references public.customers(id) on delete cascade,
  event_type   text        not null
                 check (event_type in
                   ('lifecycle_flip_to_customer', 'lifecycle_flip_to_lead')),
  reason       text        not null
                 check (reason in ('auto_on_paid_order', 'manual')),
  actor_user_id uuid       references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
```

(During planning, check whether an existing customer-event or audit table can be reused before adding this one.)

The event row is written by **both** code paths:
- **Auto-flip:** the same Postgres trigger that updates `lifecycle_stage` inserts the event row (`reason = 'auto_on_paid_order'`, `actor_user_id = null`).
- **Manual flip:** the `setLifecycleStage` server action writes the event row (`reason = 'manual'`, `actor_user_id = the acting user`).

### No notification

Conversion is a status change, not a celebration. Counts on the tabs are the only visible signal.

---

## UI Surface

### Route

Rename `/customers` → `/contacts`. The detail URL stays `/customers/[id]` so existing links and bookmarks continue to work; the detail page renders both lead and customer views transparently based on `lifecycle_stage`.

### Contacts list page

Two tabs at the top with count badges:

- **Leads** (default landing tab)
- **Customers**

Same underlying table component, different default columns:

| Tab | Columns |
|---|---|
| Leads | display_name · channel · acquisition_source · created_at · last_message_at |
| Customers | display_name · channel · ltv · trust_score · last_order_at |

The `channel` column shows the channel type of the contact's most recent conversation (`max(last_message_at)` in `conversations` for that customer). If a contact has channels but no conversations yet, fall back to their `is_primary = true` row in `customer_channels`. Displayed as a small icon (WhatsApp / Telegram / email).

Filters available in both tabs: channel, tag, date range. The Leads tab adds a `no source set` quick filter for batch backfill workflows.

Row menu items: **Mark as customer** / **Mark as lead** (whichever direction applies), Block, Tag, Delete. Bulk selection supports the same actions.

### Detail page

Single component, branches on `lifecycle_stage`:

**Lead view:**
- Hides the LTV section, hides the trust score, hides reorder intelligence.
- Prominent **Convert to customer** button in the header.
- "Acquisition source" card surfaced near the top with inline edit affordance.

**Customer view:**
- All existing customer detail UI visible (LTV, trust score, reorder, etc.).
- Acquisition source demoted to a smaller "Origin" section further down the page (still editable).

Notes, conversations, channels, and tags are shared across both views.

### Inbox

No nav changes. Two small additions:
- Conversation list rows for leads show a **Lead** pill.
- Conversation header on lead conversations shows the same **Convert to customer** button.

---

## Acquisition Source UX

### First-touch prompt

The first time a tenant opens a new lead's conversation, a thin inline banner appears above the composer:

> *Where'd they find you? · Referral · Community · Group chat · Direct · Other · skip*

Behaviour:

- Five chips plus a `skip` link.
- Selecting a chip writes `acquisition_source` and collapses the banner with a brief confirmation.
- Selecting `Referral` reveals a small "Who referred them?" autocomplete over existing customers (`referred_by_customer_id`). Skippable.
- Selecting `Other` reveals a one-line text field for `acquisition_source_note`. Skippable.
- If the tenant does nothing for **10 seconds**, the banner softly fades to a tiny "Set source" link in the conversation header. Not destroyed — demoted.
- Closing the banner or navigating away has the same demotion effect.
- The banner does not reappear on subsequent opens of that conversation. Source is settable any time from the lead detail page.

### Fallback path

- Lead detail page always has an editable "Acquisition source" card.
- Leads tab has a `no source set` filter chip for batch backfill.

### Capture philosophy

Optional. Subtle. Easily dismissable. A peptide dealer running a busy WhatsApp inbox will not tolerate a required field on every new lead — they'll pick whatever clears the prompt and the data will be garbage. Optional capture with a quiet fallback produces honest data on the leads that matter.

---

## Migration & Rollout

### One-shot migration

Embedded in the schema migration that adds the columns. The default on `lifecycle_stage` is `'lead'`, so every existing row starts as a lead. A single update statement promotes anyone with a qualifying order:

```sql
update public.customers c
set
  lifecycle_stage = 'customer',
  converted_at    = (
    select min(o.created_at)
    from public.orders o
    where o.customer_id = c.id
      and o.status in ('confirming', 'packing', 'shipped', 'delivered')
  )
where exists (
  select 1 from public.orders o
  where o.customer_id = c.id
    and o.status in ('confirming', 'packing', 'shipped', 'delivered')
);
```

`converted_at` is backfilled to the customer's first paid order timestamp so the funnel-time metric works from day one.

### Acquisition source for existing rows

Left null. The first-touch prompt is only for new conversations going forward. There's no honest way to reconstruct historical attribution.

### Release notes

A short user-facing note:

> Your existing customers were sorted into Leads and Customers based on whether they have at least one paid order. If anyone landed in the wrong bucket, use the row menu to flip them back.

---

## Open Questions / Risks

- **`customer_events` table reuse.** Verify during planning whether an existing audit or event table can carry the lifecycle-flip rows before adding a new table.
- **Order-status threshold.** The migration and trigger use `('confirming', 'packing', 'shipped', 'delivered')` as "has paid." Confirm this is the correct payment-received boundary by checking the payment-confirmation code path; if the boundary turns out to be a payment row rather than an order status, switch the rule accordingly.
- **Auto-create on inbound.** The existing behaviour of auto-creating a contact row when an inbound message arrives from an unknown handle is preserved. New rows now default to `lifecycle_stage = 'lead'`, which is the desired outcome — but worth a smoke test on the inbox webhook handlers to confirm nothing breaks.

---

## Success Criteria

- A tenant landing on `/contacts` sees their Leads tab populated with non-buyers and their Customers tab populated only with buyers.
- An order moving to a paid status automatically converts the linked lead to a customer with `converted_at` set.
- Manual flips work in both directions from both the list row menu and the detail page.
- The acquisition-source prompt appears once per new lead conversation, can be dismissed in 10 seconds, and never re-appears for the same conversation.
- Channel of first contact is visible without any new field being captured.
- No existing customer, conversation, or order URL breaks.
