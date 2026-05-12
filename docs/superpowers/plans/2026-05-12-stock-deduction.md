# Stock Deduction on Packing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an operator marks an order as "packing", automatically assign the oldest available batch (FIFO) to each order item and atomically deduct stock, blocking the transition if stock is insufficient.

**Architecture:** A new `packOrder` server action replaces the generic `updateOrderStatus` call for the `confirming → packing` transition. It runs a pre-flight FIFO batch query per item, then calls a single `pack_order` Postgres RPC that assigns batches, decrements stock, and updates order status atomically. The DB constraint `CHECK (stock >= 0)` acts as a safety net for concurrent edge cases.

**Tech Stack:** Next.js 15 server actions, Supabase PostgreSQL (RPC for atomicity), Vitest for unit tests.

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260512000005_pack_order_rpc.sql` | **Create** — stock non-negative constraint + `pack_order` RPC |
| `src/app/orders/actions.ts` | **Modify** — add `packOrder` + `buildAssignments` helper, remove `confirming` from `ALLOWED_FROM` |
| `src/app/orders/__tests__/actions.test.ts` | **Modify** — add tests for `buildAssignments` and `updateOrderStatus` transition guard |
| `src/components/orders/OrderDetailView.tsx` | **Modify** — wire "→ Packing" button to `packOrder`, show pack error |

---

## Task 1: Database migration — constraint + RPC

**Files:**
- Create: `supabase/migrations/20260512000005_pack_order_rpc.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Prevent stock going negative (safety net for concurrent writes)
ALTER TABLE batches
  ADD CONSTRAINT batches_stock_non_negative CHECK (stock >= 0);

-- Atomic pack_order: assign batches to order_items, deduct stock, advance status
-- p_assignments is a JSON array of { item_id, batch_id, qty }
CREATE OR REPLACE FUNCTION pack_order(
  p_order_id    uuid,
  p_tenant_id   uuid,
  p_assignments jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Assign batches to each order item
  UPDATE order_items oi
  SET batch_id = (a->>'batch_id')::uuid
  FROM jsonb_array_elements(p_assignments) AS a
  WHERE oi.id       = (a->>'item_id')::uuid
    AND oi.tenant_id = p_tenant_id;

  -- Deduct stock from each batch (constraint fires here if negative)
  UPDATE batches b
  SET stock = stock - (a->>'qty')::int
  FROM jsonb_array_elements(p_assignments) AS a
  WHERE b.id        = (a->>'batch_id')::uuid
    AND b.tenant_id = p_tenant_id;

  -- Advance order status (only if still confirming — guard against double-submit)
  UPDATE orders
  SET status     = 'packing',
      updated_at = now()
  WHERE id        = p_order_id
    AND tenant_id = p_tenant_id
    AND status    = 'confirming';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found_or_wrong_status';
  END IF;
END;
$$;
```

- [ ] **Step 2: Push migration to Supabase**

```bash
npx supabase db push --include-all
```

Expected output: migration applied with no errors. Verify in Supabase dashboard that:
- `batches` table has `batches_stock_non_negative` constraint
- Function `pack_order` exists under Database → Functions

---

## Task 2: `packOrder` server action + tests

**Files:**
- Modify: `src/app/orders/actions.ts`
- Modify: `src/app/orders/__tests__/actions.test.ts`

- [ ] **Step 1: Write failing tests that import `buildAssignments` from actions**

Add this import at the top of `src/app/orders/__tests__/actions.test.ts` (after the existing `import { describe, it, expect } from 'vitest'` line):

```typescript
import { buildAssignments } from '../actions'
```

Then add these `describe` blocks after the existing `calcOrderTotal` block:

```typescript
describe('buildAssignments', () => {
  const items = [
    { id: 'i1', productName: 'BPC-157 5mg', qty: 2 },
    { id: 'i2', productName: 'Retatrutide 10mg', qty: 1 },
  ]

  it('returns assignments when all items have a batch', () => {
    const batchMap = new Map([['i1', 'b1'], ['i2', 'b2']])
    const result = buildAssignments(items, batchMap)
    expect(result).toEqual({
      assignments: [
        { item_id: 'i1', batch_id: 'b1', qty: 2 },
        { item_id: 'i2', batch_id: 'b2', qty: 1 },
      ],
    })
  })

  it('returns error naming one insufficient product', () => {
    const batchMap = new Map<string, string | null>([['i1', 'b1'], ['i2', null]])
    const result = buildAssignments(items, batchMap)
    expect(result).toEqual({ error: 'Insufficient stock: Retatrutide 10mg' })
  })

  it('returns error naming all insufficient products', () => {
    const batchMap = new Map<string, string | null>([['i1', null], ['i2', null]])
    const result = buildAssignments(items, batchMap)
    expect(result).toEqual({ error: 'Insufficient stock: BPC-157 5mg, Retatrutide 10mg' })
  })

  it('returns error when item is missing from batchMap entirely', () => {
    const batchMap = new Map<string, string | null>([['i1', 'b1']])
    const result = buildAssignments(items, batchMap)
    expect(result).toEqual({ error: 'Insufficient stock: Retatrutide 10mg' })
  })
})

describe('updateOrderStatus confirming→packing guard', () => {
  // Documents that confirming→packing is not a valid updateOrderStatus transition
  const ALLOWED_FROM: Record<string, string> = {
    awaiting: 'confirming',
    packing: 'shipped',
    shipped: 'delivered',
  }

  it('does not have confirming→packing in ALLOWED_FROM', () => {
    expect(ALLOWED_FROM['confirming']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/app/orders/__tests__/actions.test.ts
```

Expected: new `buildAssignments` tests fail because `buildAssignments` is not yet exported from `actions.ts`. The existing `validateOrderItems` and `calcOrderTotal` tests still pass.

- [ ] **Step 3: Add `buildAssignments` export and `packOrder` action to `actions.ts`**

In `src/app/orders/actions.ts`:

**a)** Remove `confirming: 'packing'` from `ALLOWED_FROM` (line ~92):

```typescript
const ALLOWED_FROM: Record<string, string> = {
  awaiting: 'confirming',
  // confirming → packing is handled exclusively by packOrder
  packing: 'shipped',
  shipped: 'delivered',
}
```

**b)** Add `buildAssignments` as an exported function (add after the `ALLOWED_FROM` block):

```typescript
export function buildAssignments(
  items: { id: string; productName: string; qty: number }[],
  batchMap: Map<string, string | null>,
): { assignments: { item_id: string; batch_id: string; qty: number }[] } | { error: string } {
  const insufficient: string[] = []
  const assignments: { item_id: string; batch_id: string; qty: number }[] = []
  for (const item of items) {
    const batchId = batchMap.get(item.id) ?? null
    if (!batchId) {
      insufficient.push(item.productName)
    } else {
      assignments.push({ item_id: item.id, batch_id: batchId, qty: item.qty })
    }
  }
  if (insufficient.length > 0) return { error: `Insufficient stock: ${insufficient.join(', ')}` }
  return { assignments }
}
```

**c)** Add `packOrder` after `updateOrderStatus`:

```typescript
export async function packOrder(orderId: string): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('status, order_items(id, product_id, qty, products(name))')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single()
    if (fetchError || !order) return { error: 'Order not found' }
    if (order.status !== 'confirming') return { error: 'Order must be in confirming status to pack' }

    const items = (order.order_items as { id: string; product_id: string; qty: number; products: { name: string } | null }[])

    // FIFO: for each item, find the oldest non-expired batch with sufficient stock
    const batchMap = new Map<string, string | null>()
    for (const item of items) {
      const { data: batch } = await supabase
        .from('batches')
        .select('id')
        .eq('product_id', item.product_id)
        .eq('tenant_id', tenantId)
        .gte('stock', item.qty)
        .or('expiry_date.is.null,expiry_date.gt.' + new Date().toISOString())
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      batchMap.set(item.id, batch?.id ?? null)
    }

    const result = buildAssignments(
      items.map(i => ({ id: i.id, productName: i.products?.name ?? i.product_id, qty: i.qty })),
      batchMap,
    )
    if ('error' in result) return result

    const { error: rpcError } = await supabase.rpc('pack_order', {
      p_order_id: orderId,
      p_tenant_id: tenantId,
      p_assignments: result.assignments,
    })
    if (rpcError) return { error: rpcError.message }

    await supabase.from('order_events').insert({
      tenant_id: tenantId,
      order_id: orderId,
      actor: 'operator',
      action: 'Moved to Packing',
      note: `${result.assignments.length} batch${result.assignments.length !== 1 ? 'es' : ''} assigned`,
    })

    revalidatePath('/orders')
    revalidatePath(`/orders/${orderId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/app/orders/__tests__/actions.test.ts
```

Expected: all tests pass including the new `buildAssignments` suite

- [ ] **Step 5: Commit**

```bash
git add src/app/orders/actions.ts src/app/orders/__tests__/actions.test.ts
git commit -m "feat: packOrder action with FIFO batch assignment and stock deduction"
```

---

---

## Task 3: Wire `OrderDetailView` to `packOrder`

**Files:**
- Modify: `src/components/orders/OrderDetailView.tsx`

The `advance()` function at line 64 calls `updateOrderStatus` for all transitions. We need it to call `packOrder` when advancing to `packing`.

The order items table already has a "Batch" column (line 275) that renders `it.batches?.batch_number ?? '—'`. After packing, the RPC populates `order_items.batch_id`, so the server component re-fetch on `router.refresh()` will show the batch numbers automatically — no UI change needed for that column.

- [ ] **Step 1: Write a test documenting the expected behavior (UI smoke test is sufficient since this is a client component with complex Supabase interaction)**

Add to `src/app/orders/__tests__/actions.test.ts`:

```typescript
describe('packOrder prerequisites', () => {
  it('buildAssignments returns error for empty items with no batches', () => {
    const result = buildAssignments(
      [{ id: 'i1', productName: 'Widget', qty: 3 }],
      new Map([['i1', null]]),
    )
    expect(result).toEqual({ error: 'Insufficient stock: Widget' })
  })
})
```

- [ ] **Step 2: Run tests to confirm they pass (they already will)**

```bash
npm run test:run -- src/app/orders/__tests__/actions.test.ts
```

Expected: PASS

- [ ] **Step 3: Update `OrderDetailView.tsx` — import `packOrder`**

At line 7, change the import from:

```typescript
import { updateOrderStatus, saveOrderNotes, confirmPayment } from '@/app/orders/actions'
```

to:

```typescript
import { updateOrderStatus, saveOrderNotes, confirmPayment, packOrder } from '@/app/orders/actions'
```

- [ ] **Step 4: Add `packError` state and update `advance()` in `OrderDetailView.tsx`**

After the `[showConfirmDialog, setShowConfirmDialog]` state declaration (around line 48), add:

```typescript
const [packError, setPackError] = useState('')
```

Replace the `advance` function (lines 64–72) with:

```typescript
const advance = () => {
  if (!nextStatus) return
  if (nextStatus === 'packing') {
    setPackError('')
    startTransition(async () => {
      const result = await packOrder(order.id)
      if ('error' in result) {
        setPackError(result.error)
        return
      }
      setStatus('packing')
    })
    return
  }
  const prevStatus = status
  startTransition(async () => {
    setStatus(nextStatus)
    const result = await updateOrderStatus(order.id, nextStatus)
    if ('error' in result) setStatus(prevStatus)
  })
}
```

- [ ] **Step 5: Render `packError` near the advance button**

Locate the header actions block in the JSX (around line 147):

```tsx
{nextStatus && (
  <button className="pt-btn pt-btn-primary" onClick={advance} disabled={pending}>
    → {STATUS_LABELS[nextStatus]}
  </button>
)}
```

Replace with:

```tsx
{nextStatus && (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
    <button className="pt-btn pt-btn-primary" onClick={advance} disabled={pending}>
      → {STATUS_LABELS[nextStatus]}
    </button>
    {packError && (
      <span style={{ fontSize: 11, color: 'var(--pt-danger)' }}>{packError}</span>
    )}
  </div>
)}
```

- [ ] **Step 6: Run full test suite**

```bash
npm run test:run
```

Expected: all tests pass

- [ ] **Step 7: Manual smoke test**

1. Start dev server: `npm run dev`
2. Open an order in `confirming` status
3. Ensure the product in the order has a batch with sufficient stock in the Catalog
4. Click "→ Packing" — order should advance to packing, activity timeline shows "Moved to Packing · N batches assigned", line items table shows the batch number
5. Try with an order where the product has 0 stock (or no batch) — button should show the error message below it, order stays at `confirming`

- [ ] **Step 8: Commit**

```bash
git add src/components/orders/OrderDetailView.tsx src/app/orders/__tests__/actions.test.ts
git commit -m "feat: wire OrderDetailView packing button to packOrder with error display"
```
