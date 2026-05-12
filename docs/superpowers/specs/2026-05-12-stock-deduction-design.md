# Stock Deduction on Packing — Design Spec

## Context

Peptech tracks inventory in `batches.stock`. Today, stock is never decremented — orders move through statuses with no inventory impact. This spec adds automatic, atomic stock deduction when an order is packed, using FIFO batch selection.

---

## Trigger: Packing Status Transition

Stock is deducted **when an order transitions to `packing` status** (i.e., from `confirming`). This is the natural point where goods are being physically prepared — payment is confirmed, but items haven't left the warehouse.

---

## Batch Assignment (FIFO)

For each `order_item`, the system selects the single best available batch:

```sql
SELECT id, stock
FROM batches
WHERE product_id = <item.product_id>
  AND tenant_id = <tenant_id>
  AND stock >= <item.qty>
  AND (expiry_date IS NULL OR expiry_date > now())
ORDER BY expiry_date ASC NULLS LAST, created_at ASC
LIMIT 1
```

FIFO = oldest expiry first, then oldest created_at as tiebreaker. Batches with no expiry date sort after those with one.

---

## Insufficient Stock Handling

If **any** item has no qualifying batch, the entire operation is rejected before any writes occur. The error message names the affected products:

> "Insufficient stock: BPC-157 5mg, Retatrutide 10mg"

The order status remains `confirming`. The operator must restock before retrying.

---

## `packOrder` Server Action

Replaces the current `updateOrderStatus` call for the `confirming → packing` transition.

**Location:** `src/app/orders/actions.ts`

**Signature:** `packOrder(orderId: string): Promise<{ error: string } | { success: true }>`

**Flow:**
1. Auth check: verify order belongs to current tenant, status is `confirming`
2. Fetch `order_items` for the order (id, product_id, qty)
3. For each item, run FIFO batch selection query
4. If any item returns no batch → return `{ error: "Insufficient stock: ..." }`
5. Call Supabase RPC `pack_order(p_order_id, p_tenant_id)` to atomically:
   a. Set `order_items.batch_id` for each item
   b. Decrement `batches.stock` by `qty` for each assigned batch
   c. Set `orders.status = 'packing'`, `orders.updated_at = now()`
6. Revalidate path, return `{ success: true }`

The pre-flight check in step 4 provides a user-friendly error. The DB `CHECK (stock >= 0)` constraint is a safety net for concurrent edge cases.

`updateOrderStatus` drops `confirming` from `ALLOWED_FROM['packing']` — that transition is now exclusively via `packOrder`.

---

## Database Changes

### Migration: `batches_stock_non_negative`

```sql
ALTER TABLE batches
  ADD CONSTRAINT batches_stock_non_negative CHECK (stock >= 0);
```

### RPC: `pack_order`

```sql
CREATE OR REPLACE FUNCTION pack_order(
  p_order_id uuid,
  p_tenant_id uuid,
  p_assignments jsonb  -- [{ "item_id": uuid, "batch_id": uuid, "qty": int }, ...]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Assign batches to order items
  UPDATE order_items oi
  SET batch_id = (a->>'batch_id')::uuid
  FROM jsonb_array_elements(p_assignments) AS a
  WHERE oi.id = (a->>'item_id')::uuid
    AND oi.tenant_id = p_tenant_id;

  -- Deduct stock
  UPDATE batches b
  SET stock = stock - (a->>'qty')::int
  FROM jsonb_array_elements(p_assignments) AS a
  WHERE b.id = (a->>'batch_id')::uuid
    AND b.tenant_id = p_tenant_id;

  -- Advance order status
  UPDATE orders
  SET status = 'packing', updated_at = now()
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id
    AND status = 'confirming';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found_or_wrong_status';
  END IF;
END;
$$;
```

---

## UI Changes

### `OrderDetailView` — Packing button

The "→ Packing" action button calls `packOrder(orderId)` instead of `updateOrderStatus(orderId, 'packing')`.

On error: display the error string in the existing action error area.

On success: router.refresh() — order reloads at `packing` status.

### Order items table

After packing, `order_items.batch_id` is populated. The order items table should show the assigned batch number. The batch number is already available via the `batches (batch_number, coa_path)` join in `ORDER_SELECT`.

Add a "Batch" column to the order items table in `OrderDetailView`, visible when the order is `packing` or beyond. Show `—` when not yet assigned.

---

## Testing

- Unit test `packOrder` with mock Supabase: happy path, insufficient stock for one item, insufficient stock for all items, wrong initial status
- Test that `batches.stock_non_negative` constraint fires on direct underflow (integration)
- Test FIFO ordering: two batches same product, older expiry selected first
- Test that `updateOrderStatus` rejects `confirming → packing` transition after the change

---

## Files

### New
- `supabase/migrations/20260512000005_pack_order_rpc.sql` — constraint + RPC

### Modified
- `src/app/orders/actions.ts` — add `packOrder`, remove `confirming` from `ALLOWED_FROM['packing']`
- `src/components/orders/OrderDetailView.tsx` — wire "→ Packing" button to `packOrder`, add Batch column
- `src/app/api/invoices/generate/route.ts` — no change needed

### Test
- `src/app/orders/__tests__/packOrder.test.ts` — new test file
