# Leads Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `lead` lifecycle stage on `customers` so tenants can separate prospects from buyers, capture acquisition source, and auto-convert leads to customers when an order is paid.

**Architecture:** Add `lifecycle_stage`, `acquisition_source`, and related columns to the existing `customers` table (no new contact table). A Postgres trigger auto-flips leads to customers when an order's status crosses the payment threshold. The customer list page moves from `/customers` to `/contacts` with a Leads/Customers tab toggle; the detail page at `/customers/[id]` renders show/hide sections based on `lifecycle_stage`. Acquisition source is captured via a subtle, dismissable inline banner the first time a tenant opens a lead's conversation.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase (Postgres + RLS) · Vitest + React Testing Library · existing `pt-*` CSS design system.

**Spec:** [docs/superpowers/specs/2026-05-23-leads-management-design.md](../specs/2026-05-23-leads-management-design.md)

---

## File map

**New files:**
- `supabase/migrations/20260524000001_leads_management.sql` — schema + backfill
- `supabase/migrations/20260524000002_lifecycle_auto_flip_trigger.sql` — trigger
- `src/app/contacts/page.tsx` — new list page (moved from `customers/page.tsx`)
- `src/app/contacts/actions.ts` — `setLifecycleStage`, `setAcquisitionSource`
- `src/app/contacts/__tests__/actions.test.ts` — server action tests
- `src/components/contacts/ContactsListView.tsx` — new tabbed list component
- `src/components/contacts/LeadsTable.tsx` — Leads tab table
- `src/components/contacts/CustomersTable.tsx` — Customers tab table (extracted from existing CustomersListView)
- `src/components/contacts/AcquisitionSourceCard.tsx` — editable card on lead detail
- `src/components/contacts/ConvertToCustomerButton.tsx` — convert button (shared between detail header + inbox header)
- `src/components/inbox/AcquisitionSourceBanner.tsx` — first-touch prompt above composer
- `src/components/inbox/__tests__/AcquisitionSourceBanner.test.tsx`

**Modified files:**
- `src/app/customers/page.tsx` — replaced with a redirect to `/contacts`
- `src/app/customers/[customerId]/page.tsx` — pass `lifecycle_stage` + acquisition fields, conditionally render sections
- `src/app/inbox/[conversationId]/page.tsx` — include lifecycle on conversation row, mount banner + convert button
- `src/components/shell/Sidebar.tsx` — `/customers` → `/contacts`
- `src/components/shell/BottomNav.tsx` — `/customers` → `/contacts`
- `src/types/database.ts` — extend `Customer` type
- `src/types/inbox.ts` — extend `ConversationWithCustomer`, `DbConversation`, `InboxThread`
- `src/components/customers/CustomersListView.tsx` — superseded; delete after extraction

---

## Conventions used in this plan

- **Migration filenames** use `20260524…` as placeholder timestamps. If a newer migration has shipped by the time you apply this plan, bump the prefix so it stays the highest.
- **Migrations are applied with** `npx supabase db push --include-all` (per project convention).
- **Tests** are vitest, run with `npm run test:run` (one-shot) or `npm test` (watch).
- **`getTenantId()`** is the existing server-action helper pattern in `src/app/customers/actions.ts` — reuse it verbatim in the new actions file.
- **Commit messages** use conventional commits (`feat:`, `fix:`, `test:`, `chore:`).

---

## Task 1: Database schema migration + backfill

**Files:**
- Create: `supabase/migrations/20260524000001_leads_management.sql`
- Test: (verified by applying migration and querying schema)

- [ ] **Step 1: Check whether a reusable customer-event/audit table already exists**

Run:
```bash
ls supabase/migrations/ | grep -iE "event|audit|log"
```

If you find a generic customer-events/audit table that already carries `(customer_id, event_type, actor_user_id, created_at)` semantics, plan to reuse it instead of creating `customer_events`. If not (expected), proceed to Step 2 below to create the new table.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260524000001_leads_management.sql`:

```sql
-- Lifecycle stage + acquisition source on customers
ALTER TABLE public.customers
  ADD COLUMN lifecycle_stage text NOT NULL DEFAULT 'lead'
    CHECK (lifecycle_stage IN ('lead', 'customer')),
  ADD COLUMN acquisition_source text
    CHECK (acquisition_source IN ('referral', 'community', 'group_chat', 'direct', 'other')),
  ADD COLUMN acquisition_source_note text,
  ADD COLUMN referred_by_customer_id uuid
    REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN converted_at timestamptz;

CREATE INDEX customers_lifecycle_stage_idx
  ON public.customers (tenant_id, lifecycle_stage);

CREATE INDEX customers_acquisition_source_idx
  ON public.customers (tenant_id, acquisition_source)
  WHERE acquisition_source IS NOT NULL;

-- Audit table for lifecycle flips
CREATE TABLE public.customer_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id   uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  event_type    text        NOT NULL
                  CHECK (event_type IN ('lifecycle_flip_to_customer', 'lifecycle_flip_to_lead')),
  reason        text        NOT NULL
                  CHECK (reason IN ('auto_on_paid_order', 'manual')),
  actor_user_id uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_events_customer_idx
  ON public.customer_events (tenant_id, customer_id, created_at DESC);

-- RLS — tenant isolation, same shape as other tenant-scoped tables
ALTER TABLE public.customer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_events_tenant_isolation
  ON public.customer_events
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- One-shot backfill: anyone with at least one paid-or-after order is a customer.
-- 'confirming' = payment received, awaiting confirmations; everything from there onwards counts.
UPDATE public.customers c
SET
  lifecycle_stage = 'customer',
  converted_at    = (
    SELECT min(o.created_at)
    FROM public.orders o
    WHERE o.customer_id = c.id
      AND o.status IN ('confirming', 'packing', 'shipped', 'delivered')
  )
WHERE EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.customer_id = c.id
    AND o.status IN ('confirming', 'packing', 'shipped', 'delivered')
);
```

- [ ] **Step 3: Apply the migration**

Run:
```bash
npx supabase db push --include-all
```

Expected: migration applied successfully, no errors. If you see "column already exists", a prior partial run is in your local DB — investigate before retrying.

- [ ] **Step 4: Verify schema and backfill**

In the Supabase SQL editor (or `psql`), run:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'customers'
  AND column_name IN ('lifecycle_stage', 'acquisition_source', 'acquisition_source_note', 'referred_by_customer_id', 'converted_at');

SELECT lifecycle_stage, count(*)
FROM public.customers
GROUP BY lifecycle_stage;
```

Expected: all five columns present; the count split shows customers with paid orders are `customer`, the rest are `lead`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260524000001_leads_management.sql
git commit -m "feat: add lifecycle_stage and acquisition_source to customers"
```

---

## Task 2: Auto-flip trigger on order payment

**Files:**
- Create: `supabase/migrations/20260524000002_lifecycle_auto_flip_trigger.sql`

- [ ] **Step 1: Write the trigger migration**

Create `supabase/migrations/20260524000002_lifecycle_auto_flip_trigger.sql`:

```sql
-- Auto-flip lead -> customer when an order moves to a paid-or-after status.
CREATE OR REPLACE FUNCTION trg_lifecycle_flip_on_order()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_current_stage text;
  v_tenant_id     uuid;
BEGIN
  -- Only act when crossing into a paid status
  IF NEW.status NOT IN ('confirming', 'packing', 'shipped', 'delivered') THEN
    RETURN NULL;
  END IF;

  SELECT lifecycle_stage, tenant_id
    INTO v_current_stage, v_tenant_id
  FROM public.customers
  WHERE id = NEW.customer_id;

  IF v_current_stage = 'customer' THEN
    RETURN NULL; -- already converted, no-op
  END IF;

  UPDATE public.customers
    SET lifecycle_stage = 'customer',
        converted_at    = now()
    WHERE id = NEW.customer_id;

  INSERT INTO public.customer_events
    (tenant_id, customer_id, event_type, reason, actor_user_id)
  VALUES
    (v_tenant_id, NEW.customer_id, 'lifecycle_flip_to_customer', 'auto_on_paid_order', NULL);

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_order_lifecycle_flip
AFTER INSERT OR UPDATE OF status
ON public.orders
FOR EACH ROW EXECUTE FUNCTION trg_lifecycle_flip_on_order();
```

- [ ] **Step 2: Apply the migration**

Run:
```bash
npx supabase db push --include-all
```

Expected: applied with no errors.

- [ ] **Step 3: Smoke-test the trigger**

In the SQL editor, against a non-production database:

```sql
-- Insert a lead, then a paid order, observe flip
WITH tid AS (SELECT id FROM public.tenants LIMIT 1)
INSERT INTO public.customers (tenant_id, display_name, lifecycle_stage)
SELECT id, 'Trigger Smoke Test', 'lead' FROM tid
RETURNING id;

-- Use the returned id below as :cid
-- Insert a 'confirming' order
INSERT INTO public.orders (tenant_id, customer_id, status, created_at)
VALUES ((SELECT tenant_id FROM public.customers WHERE id = ':cid'), ':cid', 'confirming', now());

-- Verify
SELECT lifecycle_stage, converted_at FROM public.customers WHERE id = ':cid';
SELECT event_type, reason FROM public.customer_events WHERE customer_id = ':cid';
```

Expected: `lifecycle_stage = 'customer'`, `converted_at` is set, one event row with `reason = 'auto_on_paid_order'`.

Clean up:
```sql
DELETE FROM public.customers WHERE display_name = 'Trigger Smoke Test';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260524000002_lifecycle_auto_flip_trigger.sql
git commit -m "feat: auto-flip lead to customer when order reaches paid status"
```

---

## Task 3: Type updates

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/types/inbox.ts`

- [ ] **Step 1: Inspect the existing Customer type shape**

Run:
```bash
grep -n "lifecycle_stage\|trust_score\|ltv" src/types/database.ts | head -20
```

Locate the `Customer` row type (or the table definition Supabase generates) and identify where to add the new columns.

- [ ] **Step 2: Add the new fields to `src/types/database.ts`**

Add to the `Customer` row type (exact location depends on the file; add adjacent to `trust_score`/`ltv`):

```ts
lifecycle_stage: 'lead' | 'customer'
acquisition_source: 'referral' | 'community' | 'group_chat' | 'direct' | 'other' | null
acquisition_source_note: string | null
referred_by_customer_id: string | null
converted_at: string | null
```

If `database.ts` is auto-generated from Supabase, regenerate with the project's existing command instead of hand-editing. Check `package.json` scripts for a `gen:types` or similar.

- [ ] **Step 3: Extend `ConversationWithCustomer` and `DbConversation` in `src/types/inbox.ts`**

In `src/types/inbox.ts`, both shapes currently include `customers: { id, display_name, trust_score, ltv, customer_tags, ... }`. Add `lifecycle_stage` and `acquisition_source` to both:

```ts
customers: {
  id: string
  display_name: string
  trust_score: number
  ltv: number
  lifecycle_stage: 'lead' | 'customer'
  acquisition_source: 'referral' | 'community' | 'group_chat' | 'direct' | 'other' | null
  customer_tags: { tag: string }[]
  // ...existing fields
} | null
```

- [ ] **Step 4: Add `lifecycleStage` to `InboxThread` and map it in `dbConversationToThread`**

In `src/types/inbox.ts`, add to `InboxThread`:

```ts
lifecycleStage: 'lead' | 'customer'
```

Update `dbConversationToThread`:

```ts
return {
  // ...existing fields
  lifecycleStage: c.customers?.lifecycle_stage ?? 'lead',
}
```

- [ ] **Step 5: Run typecheck and tests**

Run:
```bash
npm run test:run
```

Expected: existing tests still pass. The new fields default to optional/nullable so no existing code should break. If something type-errors, follow the error to its source and add missing fields to test mocks rather than weakening the types.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts src/types/inbox.ts
git commit -m "feat: add lifecycle_stage and acquisition_source to customer types"
```

---

## Task 4: Server action — `setLifecycleStage`

**Files:**
- Create: `src/app/contacts/actions.ts`
- Create: `src/app/contacts/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/contacts/__tests__/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [] })) }))

import { setLifecycleStage } from '../actions'
import { createClient } from '@/lib/supabase/server'

type MockedSupabase = ReturnType<typeof makeMockClient>

function makeMockClient(opts: {
  authUserId?: string | null
  tenantId?: string | null
  updateError?: { message: string } | null
} = {}) {
  const updateChain = {
    eq: vi.fn().mockReturnThis(),
    // terminal: returns { error }
    then: undefined,
  }
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.authUserId ? { id: opts.authUserId } : null },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: opts.tenantId ? { tenant_id: opts.tenantId } : null,
              }),
            }),
          }),
        }
      }
      if (table === 'customers') {
        return {
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: opts.updateError ?? null }),
            }),
          }),
        }
      }
      if (table === 'customer_events') {
        return {
          insert: () => Promise.resolve({ error: null }),
        }
      }
      return {}
    }),
  }
  return supabase
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('setLifecycleStage', () => {
  it('flips lead to customer and writes an event row', async () => {
    const supabase = makeMockClient({ authUserId: 'u1', tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await setLifecycleStage('cust-1', 'customer')

    expect(result).toEqual({ success: true })
    expect(supabase.from).toHaveBeenCalledWith('customers')
    expect(supabase.from).toHaveBeenCalledWith('customer_events')
  })

  it('returns error when not authenticated', async () => {
    const supabase = makeMockClient({ authUserId: null })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await setLifecycleStage('cust-1', 'customer')

    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('rejects invalid stage values', async () => {
    const supabase = makeMockClient({ authUserId: 'u1', tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    // @ts-expect-error — testing runtime validation of invalid input
    const result = await setLifecycleStage('cust-1', 'churned')

    expect(result).toEqual({ error: 'Invalid lifecycle stage' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm run test:run -- src/app/contacts/__tests__/actions.test.ts
```

Expected: FAIL with `Cannot find module '../actions'`.

- [ ] **Step 3: Implement `setLifecycleStage`**

Create `src/app/contacts/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id as string, userId: user.id }
}

export async function setLifecycleStage(
  customerId: string,
  stage: 'lead' | 'customer',
): Promise<{ success: true } | { error: string }> {
  if (stage !== 'lead' && stage !== 'customer') {
    return { error: 'Invalid lifecycle stage' }
  }
  try {
    const { supabase, tenantId, userId } = await getTenantId()

    const update: Record<string, unknown> = { lifecycle_stage: stage }
    if (stage === 'customer') update.converted_at = new Date().toISOString()
    else                       update.converted_at = null

    const { error } = await supabase
      .from('customers')
      .update(update)
      .eq('tenant_id', tenantId)
      .eq('id', customerId)

    if (error) return { error: error.message }

    await supabase.from('customer_events').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      event_type: stage === 'customer' ? 'lifecycle_flip_to_customer' : 'lifecycle_flip_to_lead',
      reason: 'manual',
      actor_user_id: userId,
    })

    revalidatePath('/contacts')
    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm run test:run -- src/app/contacts/__tests__/actions.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/contacts/actions.ts src/app/contacts/__tests__/actions.test.ts
git commit -m "feat: add setLifecycleStage server action with manual flip support"
```

---

## Task 5: Server action — `setAcquisitionSource`

**Files:**
- Modify: `src/app/contacts/actions.ts`
- Modify: `src/app/contacts/__tests__/actions.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/app/contacts/__tests__/actions.test.ts`:

```ts
import { setAcquisitionSource } from '../actions'

describe('setAcquisitionSource', () => {
  it('writes the source and optional referred_by_customer_id', async () => {
    const supabase = makeMockClient({ authUserId: 'u1', tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await setAcquisitionSource('cust-1', {
      source: 'referral',
      referredByCustomerId: 'cust-2',
    })

    expect(result).toEqual({ success: true })
    expect(supabase.from).toHaveBeenCalledWith('customers')
  })

  it('rejects invalid source values', async () => {
    const supabase = makeMockClient({ authUserId: 'u1', tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    // @ts-expect-error — testing runtime validation
    const result = await setAcquisitionSource('cust-1', { source: 'paid_ads' })

    expect(result).toEqual({ error: 'Invalid acquisition source' })
  })

  it('requires a note when source is "other"', async () => {
    const supabase = makeMockClient({ authUserId: 'u1', tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await setAcquisitionSource('cust-1', { source: 'other', note: '' })

    expect(result).toEqual({ error: 'Note required when source is "other"' })
  })

  it('allows clearing the source by passing null', async () => {
    const supabase = makeMockClient({ authUserId: 'u1', tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await setAcquisitionSource('cust-1', { source: null })

    expect(result).toEqual({ success: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm run test:run -- src/app/contacts/__tests__/actions.test.ts
```

Expected: FAIL on the new `setAcquisitionSource` tests.

- [ ] **Step 3: Implement `setAcquisitionSource`**

Append to `src/app/contacts/actions.ts`:

```ts
export type AcquisitionSource = 'referral' | 'community' | 'group_chat' | 'direct' | 'other'

const VALID_SOURCES: AcquisitionSource[] = ['referral', 'community', 'group_chat', 'direct', 'other']

export async function setAcquisitionSource(
  customerId: string,
  input: {
    source: AcquisitionSource | null
    referredByCustomerId?: string | null
    note?: string | null
  },
): Promise<{ success: true } | { error: string }> {
  if (input.source !== null && !VALID_SOURCES.includes(input.source)) {
    return { error: 'Invalid acquisition source' }
  }
  if (input.source === 'other' && !input.note?.trim()) {
    return { error: 'Note required when source is "other"' }
  }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase
      .from('customers')
      .update({
        acquisition_source: input.source,
        acquisition_source_note: input.note?.trim() || null,
        referred_by_customer_id: input.source === 'referral' ? (input.referredByCustomerId ?? null) : null,
      })
      .eq('tenant_id', tenantId)
      .eq('id', customerId)

    if (error) return { error: error.message }

    revalidatePath('/contacts')
    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm run test:run -- src/app/contacts/__tests__/actions.test.ts
```

Expected: PASS (all tests, including the original three).

- [ ] **Step 5: Commit**

```bash
git add src/app/contacts/actions.ts src/app/contacts/__tests__/actions.test.ts
git commit -m "feat: add setAcquisitionSource server action with validation"
```

---

## Task 6: Move `/customers` list to `/contacts` with redirect

**Files:**
- Create: `src/app/contacts/page.tsx`
- Modify: `src/app/customers/page.tsx` (becomes redirect)
- Modify: `src/components/shell/Sidebar.tsx`
- Modify: `src/components/shell/BottomNav.tsx`

- [ ] **Step 1: Create the new `/contacts/page.tsx`**

Create `src/app/contacts/page.tsx`. Start as an exact copy of the current `src/app/customers/page.tsx`, then:

1. Update the query to select the new fields:
   ```ts
   .select('id, display_name, trust_score, ltv, lifecycle_stage, acquisition_source, acquisition_source_note, referred_by_customer_id, converted_at, created_at, customer_channels(channel_type, display_handle, is_primary), customer_tags(tag)')
   ```
2. Change the rendered component to the new tabbed component (built in Task 7):
   ```tsx
   import { ContactsListView } from '@/components/contacts/ContactsListView'
   // ...
   <Shell section="Contacts">
     <ContactsListView customers={customers ?? []} supplyStatuses={supplyStatuses} orderStats={orderStats} baseCurrency={baseCurrency} hasChannels={(channelCount ?? 0) > 0} recentConvByCustomer={recentConvByCustomer} />
   </Shell>
   ```
3. Also fetch the latest conversation per customer (for both the Leads "Last message" column and the channel-of-most-recent-conversation resolution). Add to the parallel queries:
   ```ts
   supabase
     .from('conversations')
     .select('customer_id, channel_type, last_message_at')
     .order('last_message_at', { ascending: false, nullsFirst: false }),
   ```
   Then reduce — take the first occurrence per `customer_id`, since rows are already sorted desc:
   ```ts
   const recentConvByCustomer: Record<string, { channelType: string; lastMessageAt: string | null }> = {}
   for (const row of conversations ?? []) {
     if (!recentConvByCustomer[row.customer_id]) {
       recentConvByCustomer[row.customer_id] = {
         channelType: row.channel_type,
         lastMessageAt: row.last_message_at,
       }
     }
   }
   ```
   Pass `recentConvByCustomer` as a prop.

(Don't build `ContactsListView` yet — that's Task 7. After this step the page won't render cleanly, but the route will exist.)

- [ ] **Step 2: Replace `/customers` list with a redirect**

Replace the contents of `src/app/customers/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

export default function CustomersIndexPage() {
  redirect('/contacts')
}
```

This preserves bookmarks of the list page. `/customers/[customerId]` continues to work (the detail route is untouched).

- [ ] **Step 3: Update navigation links**

In `src/components/shell/Sidebar.tsx`, change:
```ts
{ label: 'Customers',   href: '/customers',      icon: Icons.users,  badge: null },
```
to:
```ts
{ label: 'Contacts',    href: '/contacts',       icon: Icons.users,  badge: null },
```

In `src/components/shell/BottomNav.tsx`, change:
```ts
{ label: 'Customers', href: '/customers',  icon: Icons.users  },
```
to:
```ts
{ label: 'Contacts', href: '/contacts',  icon: Icons.users  },
```

- [ ] **Step 4: Run typecheck and tests**

Run:
```bash
npm run test:run
```

Expected: no new failures. The page will fail to render at runtime until Task 7 lands `ContactsListView`, but tests should still pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/contacts/page.tsx src/app/customers/page.tsx src/components/shell/Sidebar.tsx src/components/shell/BottomNav.tsx
git commit -m "feat: move customers list to /contacts with redirect"
```

---

## Task 7: Contacts list with Leads/Customers tabs

**Files:**
- Create: `src/components/contacts/ContactsListView.tsx`
- Create: `src/components/contacts/LeadsTable.tsx`
- Create: `src/components/contacts/CustomersTable.tsx`
- Create: `src/components/contacts/__tests__/ContactsListView.test.tsx`
- Delete: `src/components/customers/CustomersListView.tsx` (after copying its logic into `CustomersTable`)

- [ ] **Step 1: Write the failing test for tab selection**

Create `src/components/contacts/__tests__/ContactsListView.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContactsListView } from '../ContactsListView'

const baseContact = {
  display_name: 'Test',
  trust_score: 50,
  ltv: 0,
  customer_channels: [],
  customer_tags: [],
  acquisition_source: null,
  acquisition_source_note: null,
  referred_by_customer_id: null,
  converted_at: null,
  created_at: '2026-05-01T00:00:00Z',
}

describe('ContactsListView', () => {
  it('defaults to the Leads tab', () => {
    render(<ContactsListView
      customers={[
        { ...baseContact, id: 'a', display_name: 'Alice', lifecycle_stage: 'lead' },
        { ...baseContact, id: 'b', display_name: 'Bob',   lifecycle_stage: 'customer' },
      ]}
      supplyStatuses={{}} orderStats={{}} baseCurrency="USD" hasChannels recentConvByCustomer={{}}
    />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
  })

  it('switches to the Customers tab on click', () => {
    render(<ContactsListView
      customers={[
        { ...baseContact, id: 'a', display_name: 'Alice', lifecycle_stage: 'lead' },
        { ...baseContact, id: 'b', display_name: 'Bob',   lifecycle_stage: 'customer' },
      ]}
      supplyStatuses={{}} orderStats={{}} baseCurrency="USD" hasChannels recentConvByCustomer={{}}
    />)
    fireEvent.click(screen.getByRole('tab', { name: /customers/i }))
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('shows count badges on each tab', () => {
    render(<ContactsListView
      customers={[
        { ...baseContact, id: 'a', display_name: 'Alice', lifecycle_stage: 'lead' },
        { ...baseContact, id: 'b', display_name: 'Bob',   lifecycle_stage: 'customer' },
        { ...baseContact, id: 'c', display_name: 'Cara',  lifecycle_stage: 'lead' },
      ]}
      supplyStatuses={{}} orderStats={{}} baseCurrency="USD" hasChannels recentConvByCustomer={{}}
    />)
    expect(screen.getByRole('tab', { name: /leads.*2/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /customers.*1/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm run test:run -- src/components/contacts/__tests__/ContactsListView.test.tsx
```

Expected: FAIL (`Cannot find module '../ContactsListView'`).

- [ ] **Step 3: Extract existing customer-list logic into `CustomersTable`**

Create `src/components/contacts/CustomersTable.tsx` by copying the contents of `src/components/customers/CustomersListView.tsx` and renaming the exported component to `CustomersTable`. Strip out the top-level page chrome (search bar, etc., is moved up to `ContactsListView` so it's shared across both tabs). Keep the row-rendering logic.

The `CustomersTable` should accept the same props the existing list accepts, plus `customers` already filtered to `lifecycle_stage === 'customer'` by the parent.

- [ ] **Step 4: Create `LeadsTable`**

Create `src/components/contacts/LeadsTable.tsx`. Mirror the structure of `CustomersTable` but with the Leads-tab columns:

```tsx
'use client'

import Link from 'next/link'
import { Icons } from '@/lib/icons'

type Channel = { channel_type: string; display_handle: string; is_primary: boolean }

type Lead = {
  id: string
  display_name: string
  acquisition_source: 'referral' | 'community' | 'group_chat' | 'direct' | 'other' | null
  created_at: string
  customer_channels: Channel[]
}

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = {
  whatsapp: Icons.wa,
  telegram: Icons.tg,
  email:    Icons.em,
}

const SOURCE_LABEL: Record<string, string> = {
  referral:    'Referral',
  community:   'Community',
  group_chat:  'Group chat',
  direct:      'Direct',
  other:       'Other',
}

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0]]).join('')
}

function fmtAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

interface Props {
  leads: Lead[]
  recentConvByCustomer: Record<string, { channelType: string; lastMessageAt: string | null }>
}

export function LeadsTable({ leads, recentConvByCustomer }: Props) {
  if (leads.length === 0) {
    return (
      <div className="pt-empty">
        <p>No leads yet. New conversations from unknown handles will appear here.</p>
      </div>
    )
  }
  return (
    <table className="pt-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Channel</th>
          <th>Source</th>
          <th>Created</th>
          <th>Last message</th>
          <th /> {/* row menu column */}
        </tr>
      </thead>
      <tbody>
        {leads.map(l => {
          // Channel resolution: most recent conversation's channel,
          // fall back to primary channel from customer_channels.
          const recentConv = recentConvByCustomer[l.id]
          const fallback   = l.customer_channels.find(c => c.is_primary) ?? l.customer_channels[0]
          const channelType = recentConv?.channelType ?? fallback?.channel_type ?? null
          const Icon = channelType ? CH_ICONS[channelType] : null
          const lastMsg = recentConv?.lastMessageAt ?? null
          return (
            <tr key={l.id}>
              <td>
                <Link href={`/customers/${l.id}`} className="pt-link">
                  <span className="pt-avatar">{initials(l.display_name)}</span>
                  {l.display_name}
                </Link>
              </td>
              <td>{Icon ? <Icon size={16} /> : '—'}</td>
              <td>{l.acquisition_source ? SOURCE_LABEL[l.acquisition_source] : <span className="pt-muted">—</span>}</td>
              <td>{fmtAge(l.created_at)}</td>
              <td>{lastMsg ? fmtAge(lastMsg) : '—'}</td>
              <td>{/* RowMenu added in Task 11 */}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

(Adjust class names to match the actual `pt-*` classes used by `CustomersListView.tsx` — copy from there.)

- [ ] **Step 5: Create `ContactsListView` with tabs and shared filters**

Create `src/components/contacts/ContactsListView.tsx`. Hoist the search and shared filters (channel, tag) into this wrapper so both tables consume already-filtered input. The Leads tab gets an extra `no source set` quick filter.

```tsx
'use client'

import { useState, useMemo } from 'react'
import { LeadsTable } from './LeadsTable'
import { CustomersTable } from './CustomersTable'
import type { SupplyStatus } from '@/types/protocols'

type Channel = { channel_type: string; display_handle: string; is_primary: boolean }
type Tag = { tag: string }

type Contact = {
  id: string
  display_name: string
  trust_score: number
  ltv: number
  lifecycle_stage: 'lead' | 'customer'
  acquisition_source: 'referral' | 'community' | 'group_chat' | 'direct' | 'other' | null
  acquisition_source_note: string | null
  referred_by_customer_id: string | null
  converted_at: string | null
  created_at: string
  customer_channels: Channel[]
  customer_tags: Tag[]
}

interface Props {
  customers: Contact[]
  supplyStatuses?: Record<string, SupplyStatus | null>
  orderStats?: Record<string, { count: number; lastOrderAt: string | null }>
  baseCurrency: string
  hasChannels?: boolean
  recentConvByCustomer: Record<string, { channelType: string; lastMessageAt: string | null }>
}

export function ContactsListView({
  customers,
  supplyStatuses = {},
  orderStats = {},
  baseCurrency,
  hasChannels = false,
  recentConvByCustomer,
}: Props) {
  const [tab, setTab]                       = useState<'leads' | 'customers'>('leads')
  const [search, setSearch]                 = useState('')
  const [channelFilter, setChannelFilter]   = useState<string | null>(null)
  const [tagFilter, setTagFilter]           = useState<string | null>(null)
  const [noSourceOnly, setNoSourceOnly]     = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return customers.filter(c => {
      if (q) {
        const handle = c.customer_channels.find(ch => ch.is_primary)?.display_handle ?? ''
        if (!c.display_name.toLowerCase().includes(q) && !handle.toLowerCase().includes(q)) return false
      }
      if (channelFilter) {
        const primary = c.customer_channels.find(ch => ch.is_primary) ?? c.customer_channels[0]
        if (!primary || primary.channel_type !== channelFilter) return false
      }
      if (tagFilter) {
        const tags = c.customer_tags.map(t => t.tag)
        if (!tags.includes(tagFilter)) return false
      }
      return true
    })
  }, [customers, search, channelFilter, tagFilter])

  const leads  = filtered.filter(c => c.lifecycle_stage === 'lead'
    && (!noSourceOnly || c.acquisition_source === null))
  const buyers = filtered.filter(c => c.lifecycle_stage === 'customer')

  return (
    <div className="pt-contacts">
      <div role="tablist" className="pt-tabs">
        <button
          role="tab"
          aria-selected={tab === 'leads'}
          className={tab === 'leads' ? 'pt-tab pt-tab--active' : 'pt-tab'}
          onClick={() => setTab('leads')}
        >
          Leads <span className="pt-tab__count">{leads.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'customers'}
          className={tab === 'customers' ? 'pt-tab pt-tab--active' : 'pt-tab'}
          onClick={() => setTab('customers')}
        >
          Customers <span className="pt-tab__count">{buyers.length}</span>
        </button>
      </div>

      <div className="pt-filters">
        <input
          type="search"
          placeholder="Search name or handle"
          className="pt-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {/* channel + tag filter pills — copy the pill rendering pattern from the original CustomersListView */}
        {tab === 'leads' && (
          <button
            type="button"
            className={noSourceOnly ? 'pt-chip pt-chip--active' : 'pt-chip'}
            onClick={() => setNoSourceOnly(v => !v)}
          >
            No source set
          </button>
        )}
      </div>

      {tab === 'leads' ? (
        <LeadsTable leads={leads} recentConvByCustomer={recentConvByCustomer} />
      ) : (
        <CustomersTable
          customers={buyers}
          supplyStatuses={supplyStatuses}
          orderStats={orderStats}
          baseCurrency={baseCurrency}
          hasChannels={hasChannels}
        />
      )}
    </div>
  )
}
```

The channel/tag pill rendering is intentionally elided — copy from the original `CustomersListView.tsx` you're replacing (lines ~50–100). Same `setChannelFilter`/`setTagFilter` wiring, just hoisted up one level.

- [ ] **Step 6: Delete the old list component and update imports**

Delete `src/components/customers/CustomersListView.tsx`. Confirm nothing still imports it:

```bash
grep -rn "CustomersListView" src/
```

Expected: no matches (the only consumer was `src/app/customers/page.tsx`, which Task 6 replaced with a redirect).

- [ ] **Step 7: Run tests**

Run:
```bash
npm run test:run
```

Expected: PASS, including the three new `ContactsListView` tests.

- [ ] **Step 8: Run the dev server and confirm the page renders**

Run:
```bash
npm run dev
```

Navigate to `/contacts`. Confirm: the Leads tab is the default, both tabs show counts, switching tabs works, and `/customers` redirects to `/contacts`.

- [ ] **Step 9: Commit**

```bash
git add src/components/contacts/ src/components/customers/CustomersListView.tsx src/app/contacts/page.tsx
git commit -m "feat: contacts page with Leads and Customers tabs"
```

---

## Task 8: Customer detail page — conditional rendering by lifecycle_stage

**Files:**
- Modify: `src/app/customers/[customerId]/page.tsx`
- Create: `src/components/contacts/AcquisitionSourceCard.tsx`
- Create: `src/components/contacts/ConvertToCustomerButton.tsx`

- [ ] **Step 1: Build the `ConvertToCustomerButton` component**

Create `src/components/contacts/ConvertToCustomerButton.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setLifecycleStage } from '@/app/contacts/actions'

interface Props {
  customerId: string
  currentStage: 'lead' | 'customer'
}

export function ConvertToCustomerButton({ customerId, currentStage }: Props) {
  const [pending, start] = useTransition()
  const router = useRouter()

  if (currentStage === 'customer') return null

  return (
    <button
      type="button"
      className="pt-btn pt-btn--primary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await setLifecycleStage(customerId, 'customer')
          if ('error' in result) {
            alert(result.error)
            return
          }
          router.refresh()
        })
      }
    >
      {pending ? 'Converting…' : 'Convert to customer'}
    </button>
  )
}
```

- [ ] **Step 2: Build the `AcquisitionSourceCard` component**

Create `src/components/contacts/AcquisitionSourceCard.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setAcquisitionSource, type AcquisitionSource } from '@/app/contacts/actions'

const SOURCE_LABELS: Record<AcquisitionSource, string> = {
  referral:   'Referral',
  community:  'Community',
  group_chat: 'Group chat',
  direct:     'Direct',
  other:      'Other',
}

interface Props {
  customerId: string
  initialSource: AcquisitionSource | null
  initialNote: string | null
  initialReferredBy: string | null
}

export function AcquisitionSourceCard({ customerId, initialSource, initialNote, initialReferredBy }: Props) {
  const [source, setSource] = useState<AcquisitionSource | null>(initialSource)
  const [note, setNote]     = useState(initialNote ?? '')
  const [referredBy, setReferredBy] = useState(initialReferredBy ?? '')
  const [pending, start]    = useTransition()
  const router = useRouter()

  function save(nextSource: AcquisitionSource | null) {
    start(async () => {
      const result = await setAcquisitionSource(customerId, {
        source: nextSource,
        note: nextSource === 'other' ? note : null,
        referredByCustomerId: nextSource === 'referral' ? (referredBy || null) : null,
      })
      if ('error' in result) {
        alert(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="pt-card">
      <h3 className="pt-card__title">Acquisition source</h3>
      <div className="pt-chip-row">
        {(Object.keys(SOURCE_LABELS) as AcquisitionSource[]).map(s => (
          <button
            key={s}
            type="button"
            className={source === s ? 'pt-chip pt-chip--active' : 'pt-chip'}
            disabled={pending}
            onClick={() => {
              setSource(s)
              save(s)
            }}
          >
            {SOURCE_LABELS[s]}
          </button>
        ))}
        {source && (
          <button
            type="button"
            className="pt-chip pt-chip--ghost"
            disabled={pending}
            onClick={() => {
              setSource(null)
              save(null)
            }}
          >
            Clear
          </button>
        )}
      </div>

      {source === 'other' && (
        <input
          type="text"
          placeholder="Where from?"
          className="pt-input"
          value={note}
          onChange={e => setNote(e.target.value)}
          onBlur={() => save('other')}
        />
      )}
      {source === 'referral' && (
        <input
          type="text"
          placeholder="Referred by (customer id, optional)"
          className="pt-input"
          value={referredBy}
          onChange={e => setReferredBy(e.target.value)}
          onBlur={() => save('referral')}
        />
      )}
    </section>
  )
}
```

(The `referredBy` field is a freeform id for now; a typeahead-over-existing-customers is a follow-up.)

- [ ] **Step 3: Modify the detail page to branch by stage**

In `src/app/customers/[customerId]/page.tsx`:

1. Add `lifecycle_stage, acquisition_source, acquisition_source_note, referred_by_customer_id, converted_at` to the customer SELECT.
2. At the top of the rendered JSX, in the header section, conditionally render:
   ```tsx
   {customer.lifecycle_stage === 'lead' && (
     <ConvertToCustomerButton customerId={customer.id} currentStage="lead" />
   )}
   ```
3. Wrap the LTV section, trust score badge, and Active Cycles card (reorder intel) in `{customer.lifecycle_stage === 'customer' && (…existing JSX…)}`.
4. For leads, render `<AcquisitionSourceCard …/>` near the top.
5. For customers, render the same card (read-only or fully editable) in a less prominent "Origin" section further down. Reuse `AcquisitionSourceCard` either way — it doesn't need a separate "compact" mode for v1.

Import the new components:
```ts
import { ConvertToCustomerButton } from '@/components/contacts/ConvertToCustomerButton'
import { AcquisitionSourceCard } from '@/components/contacts/AcquisitionSourceCard'
```

- [ ] **Step 4: Run tests and dev server**

Run:
```bash
npm run test:run
npm run dev
```

Navigate to a customer detail page for both a lead and a buyer; confirm:
- Lead view: shows Convert button, shows source card prominently, hides LTV / trust score / reorder cycles.
- Customer view: hides Convert button, shows LTV / trust / cycles, source card lives further down.

- [ ] **Step 5: Commit**

```bash
git add src/app/customers/[customerId]/page.tsx src/components/contacts/AcquisitionSourceCard.tsx src/components/contacts/ConvertToCustomerButton.tsx
git commit -m "feat: lead vs customer detail page rendering"
```

---

## Task 9: First-touch acquisition source banner in inbox

**Files:**
- Create: `src/components/inbox/AcquisitionSourceBanner.tsx`
- Create: `src/components/inbox/__tests__/AcquisitionSourceBanner.test.tsx`
- Modify: `src/components/inbox/ConversationPane.tsx` (mount the banner)

- [ ] **Step 1: Write the failing test**

Create `src/components/inbox/__tests__/AcquisitionSourceBanner.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AcquisitionSourceBanner } from '../AcquisitionSourceBanner'

vi.mock('@/app/contacts/actions', () => ({
  setAcquisitionSource: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

describe('AcquisitionSourceBanner', () => {
  it('does not render when source is already set', () => {
    const { container } = render(
      <AcquisitionSourceBanner customerId="c1" currentSource="referral" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('does not render for non-leads', () => {
    const { container } = render(
      <AcquisitionSourceBanner customerId="c1" currentSource={null} lifecycleStage="customer" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the prompt when source is null and stage is lead', () => {
    render(
      <AcquisitionSourceBanner customerId="c1" currentSource={null} lifecycleStage="lead" />
    )
    expect(screen.getByText(/where'd they find you/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /referral/i })).toBeInTheDocument()
  })

  it('dismisses (demotes to inline link) when skip is clicked', () => {
    render(
      <AcquisitionSourceBanner customerId="c1" currentSource={null} lifecycleStage="lead" />
    )
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(screen.queryByText(/where'd they find you/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set source/i })).toBeInTheDocument()
  })

  it('demotes itself after 10 seconds of inactivity', () => {
    vi.useFakeTimers()
    render(
      <AcquisitionSourceBanner customerId="c1" currentSource={null} lifecycleStage="lead" />
    )
    expect(screen.getByText(/where'd they find you/i)).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(10_001) })
    expect(screen.queryByText(/where'd they find you/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set source/i })).toBeInTheDocument()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm run test:run -- src/components/inbox/__tests__/AcquisitionSourceBanner.test.tsx
```

Expected: FAIL (`Cannot find module '../AcquisitionSourceBanner'`).

- [ ] **Step 3: Implement the banner**

Create `src/components/inbox/AcquisitionSourceBanner.tsx`:

```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setAcquisitionSource, type AcquisitionSource } from '@/app/contacts/actions'

const SOURCE_LABELS: Record<AcquisitionSource, string> = {
  referral:   'Referral',
  community:  'Community',
  group_chat: 'Group chat',
  direct:     'Direct',
  other:      'Other',
}

interface Props {
  customerId: string
  currentSource: AcquisitionSource | null
  lifecycleStage?: 'lead' | 'customer'
}

export function AcquisitionSourceBanner({ customerId, currentSource, lifecycleStage = 'lead' }: Props) {
  const [demoted, setDemoted] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  // 10-second auto-demote
  useEffect(() => {
    if (currentSource !== null || lifecycleStage !== 'lead' || demoted) return
    const t = setTimeout(() => setDemoted(true), 10_000)
    return () => clearTimeout(t)
  }, [currentSource, lifecycleStage, demoted])

  if (currentSource !== null) return null
  if (lifecycleStage !== 'lead') return null

  function pick(source: AcquisitionSource) {
    start(async () => {
      const result = await setAcquisitionSource(customerId, {
        source,
        note: source === 'other' ? '' : null,
      })
      if ('error' in result) return
      router.refresh()
    })
  }

  if (demoted) {
    return (
      <button
        type="button"
        className="pt-banner__link"
        onClick={() => setDemoted(false)}
      >
        Set source
      </button>
    )
  }

  return (
    <div className="pt-banner pt-banner--soft" role="region" aria-label="Acquisition source prompt">
      <span className="pt-banner__label">Where&apos;d they find you?</span>
      {(Object.keys(SOURCE_LABELS) as AcquisitionSource[]).map(s => (
        <button
          key={s}
          type="button"
          className="pt-chip pt-chip--sm"
          disabled={pending}
          onClick={() => pick(s)}
        >
          {SOURCE_LABELS[s]}
        </button>
      ))}
      <button
        type="button"
        className="pt-banner__skip"
        onClick={() => setDemoted(true)}
      >
        skip
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Mount the banner in `ConversationPane`**

In `src/components/inbox/ConversationPane.tsx`, locate where the composer is rendered. Just above it, mount:

```tsx
<AcquisitionSourceBanner
  customerId={thread.customerId}
  currentSource={thread.acquisitionSource ?? null}
  lifecycleStage={thread.lifecycleStage}
/>
```

You'll need to thread `acquisitionSource` and `lifecycleStage` into the `InboxThread` mapping (Task 3 already added `lifecycleStage`; add `acquisitionSource` the same way: `acquisitionSource: c.customers?.acquisition_source ?? null`).

Also extend `InboxThread` in `src/types/inbox.ts`:
```ts
acquisitionSource: 'referral' | 'community' | 'group_chat' | 'direct' | 'other' | null
```

- [ ] **Step 5: Run tests**

Run:
```bash
npm run test:run -- src/components/inbox/__tests__/AcquisitionSourceBanner.test.tsx
```

Expected: PASS (5 tests).

Then run the full suite:
```bash
npm run test:run
```

Expected: PASS overall.

- [ ] **Step 6: Manual verification**

Run `npm run dev` and open a lead conversation. Confirm:
- Banner appears above the composer.
- Clicking a chip writes the source and the banner disappears.
- Clicking "skip" demotes to the "Set source" link.
- Doing nothing for 10s demotes automatically.
- Reopening the conversation after a source is set: no banner.

- [ ] **Step 7: Commit**

```bash
git add src/components/inbox/AcquisitionSourceBanner.tsx src/components/inbox/__tests__/AcquisitionSourceBanner.test.tsx src/components/inbox/ConversationPane.tsx src/types/inbox.ts
git commit -m "feat: first-touch acquisition source banner in inbox"
```

---

## Task 10: Inbox — Lead pill + Convert button in conversation header

**Files:**
- Modify: `src/components/inbox/ThreadRow.tsx` — Lead pill on conversation list rows
- Modify: `src/components/inbox/ConversationPane.tsx` — Convert button in header
- Modify: `src/components/inbox/__tests__/ThreadRow.test.tsx` — assert pill

- [ ] **Step 1: Write the failing test for the Lead pill**

In `src/components/inbox/__tests__/ThreadRow.test.tsx`, add:

```tsx
it('shows a Lead pill when the thread is a lead', () => {
  render(<ThreadRow thread={{ ...baseThread, lifecycleStage: 'lead' }} {...handlers} />)
  expect(screen.getByText(/lead/i)).toBeInTheDocument()
})

it('does not show a Lead pill for customers', () => {
  render(<ThreadRow thread={{ ...baseThread, lifecycleStage: 'customer' }} {...handlers} />)
  expect(screen.queryByText(/lead/i)).not.toBeInTheDocument()
})
```

(Update `baseThread` in that test file to include `lifecycleStage: 'customer'` and `acquisitionSource: null`.)

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm run test:run -- src/components/inbox/__tests__/ThreadRow.test.tsx
```

Expected: FAIL on the new pill assertion.

- [ ] **Step 3: Add the Lead pill to `ThreadRow`**

In `src/components/inbox/ThreadRow.tsx`, near the existing tag/badge rendering, add:

```tsx
{thread.lifecycleStage === 'lead' && (
  <span className="pt-pill pt-pill--lead">Lead</span>
)}
```

- [ ] **Step 4: Mount `ConvertToCustomerButton` in the conversation header**

In `src/components/inbox/ConversationPane.tsx`, locate the conversation header (where the customer name/handle is displayed). Add:

```tsx
{thread.lifecycleStage === 'lead' && (
  <ConvertToCustomerButton customerId={thread.customerId} currentStage="lead" />
)}
```

Import:
```ts
import { ConvertToCustomerButton } from '@/components/contacts/ConvertToCustomerButton'
```

- [ ] **Step 5: Run tests**

Run:
```bash
npm run test:run
```

Expected: PASS.

- [ ] **Step 6: Manual verification**

Run `npm run dev` and confirm:
- Lead conversations show a "Lead" pill in the inbox list.
- Lead conversation header shows a "Convert to customer" button.
- Clicking it converts the contact, the pill disappears, the button disappears, the LTV/trust UI in any open detail view appears.

- [ ] **Step 7: Commit**

```bash
git add src/components/inbox/ThreadRow.tsx src/components/inbox/ConversationPane.tsx src/components/inbox/__tests__/ThreadRow.test.tsx
git commit -m "feat: lead pill and convert button in inbox conversation view"
```

---

## Task 11: Row-menu actions on the Contacts list

**Files:**
- Modify: `src/components/contacts/LeadsTable.tsx`
- Modify: `src/components/contacts/CustomersTable.tsx`

- [ ] **Step 1: Add a row-menu component**

In both `LeadsTable` and `CustomersTable`, add a kebab menu per row with a single action:
- On Leads: **Mark as customer** (calls `setLifecycleStage(id, 'customer')`).
- On Customers: **Mark as lead** (calls `setLifecycleStage(id, 'lead')` after a `confirm()` prompt).

Minimal implementation — a `<details>` element with a button inside, no fancy floating menu library needed for v1:

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setLifecycleStage } from '@/app/contacts/actions'

export function RowMenu({ customerId, currentStage }: {
  customerId: string
  currentStage: 'lead' | 'customer'
}) {
  const [pending, start] = useTransition()
  const router = useRouter()

  const targetStage: 'lead' | 'customer' = currentStage === 'lead' ? 'customer' : 'lead'
  const label = currentStage === 'lead' ? 'Mark as customer' : 'Mark as lead'

  return (
    <details className="pt-row-menu">
      <summary aria-label="Row actions">⋯</summary>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (targetStage === 'lead' && !confirm('Mark this customer as a lead?')) return
          start(async () => {
            const result = await setLifecycleStage(customerId, targetStage)
            if ('error' in result) {
              alert(result.error)
              return
            }
            router.refresh()
          })
        }}
      >
        {label}
      </button>
    </details>
  )
}
```

Put this in `src/components/contacts/RowMenu.tsx` and import it from both tables.

- [ ] **Step 2: Add a trailing column to each table that renders `<RowMenu />`**

In `LeadsTable.tsx`:
```tsx
<td><RowMenu customerId={l.id} currentStage="lead" /></td>
```

In `CustomersTable.tsx` (in the row-rendering JSX you copied from `CustomersListView`):
```tsx
<td><RowMenu customerId={c.id} currentStage="customer" /></td>
```

Add a matching empty `<th />` to each table header.

- [ ] **Step 3: Verify**

Run:
```bash
npm run test:run
npm run dev
```

In the dev server, navigate to `/contacts`:
- Open a lead row's kebab → "Mark as customer" → row moves to the Customers tab.
- Open a customer row's kebab → "Mark as lead" → confirm dialog → row moves to the Leads tab.

- [ ] **Step 4: Commit**

```bash
git add src/components/contacts/RowMenu.tsx src/components/contacts/LeadsTable.tsx src/components/contacts/CustomersTable.tsx
git commit -m "feat: row-menu mark-as-lead / mark-as-customer actions"
```

---

## Task 12: End-to-end verification

- [ ] **Step 1: Full test suite**

Run:
```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 2: Build check**

Run:
```bash
npm run build
```

Expected: build completes with no type or lint errors.

- [ ] **Step 3: Manual end-to-end smoke**

Run `npm run dev` and walk through the full flow:

1. Open `/contacts` — Leads tab is default; counts on tabs match actual rows.
2. Click a lead → detail page shows Convert button, source card, no LTV/trust/reorder.
3. Open the lead's inbox conversation → first-touch banner appears above composer.
4. Click "Referral" chip → banner disappears, source is set; refresh and verify it's still set.
5. Open another lead → banner appears again (per-conversation, not global).
6. Wait 10s on a fresh lead conversation → banner demotes to "Set source" link.
7. From the conversation header, click "Convert to customer" → contact moves to Customers tab; LTV section now visible on the detail page.
8. From `/contacts` Customers tab row menu → "Mark as lead" → contact moves back to Leads tab; `converted_at` is cleared in DB.
9. From an order: change an order's status to `confirming` for a lead → automatically becomes a customer (auto-flip trigger).
10. `/customers` redirects to `/contacts`; existing customer detail URLs (`/customers/[id]`) still work.

- [ ] **Step 4: Commit any tidying**

If any small fixes surfaced during the smoke walk, commit them as `fix:` or `chore:` commits. Otherwise skip.

---

## Notes for the engineer

- **RLS is enforced by the database**, not by application code. Never add `.eq('tenant_id', tenantId)` in queries that already inherit RLS via the customers table — but DO scope explicit writes (`setLifecycleStage`, `setAcquisitionSource`) by tenant_id as a defense-in-depth check.
- **Don't introduce Tailwind or any CSS framework.** Use existing `pt-*` classes from `styles/peptech.css`. If a class name you need doesn't exist, follow the existing naming convention and add it to `peptech.css` rather than inlining styles.
- **`converted_at` semantics:** always reflects the *most recent* conversion. If a customer is flipped back to lead, it's cleared; if then re-converted, set to the new timestamp.
- **The auto-flip trigger fires on `AFTER INSERT OR UPDATE OF status`** — so creating a brand-new order with status `'confirming'` (e.g. data import) also converts the linked lead.
- **The acquisition source banner is per-conversation behaviour** (it appears whenever `current_source IS NULL` and `lifecycle_stage = 'lead'`). It does not need a separate "dismissed" state stored in the DB — the source-being-set or the stage-being-customer naturally turns it off.
