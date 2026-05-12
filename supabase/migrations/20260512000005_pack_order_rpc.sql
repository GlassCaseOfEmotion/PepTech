-- Prevent stock going negative (safety net for concurrent writes)
DO $$
BEGIN
  BEGIN
    ALTER TABLE batches
      ADD CONSTRAINT batches_stock_non_negative CHECK (stock >= 0);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

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
    AND oi.order_id  = p_order_id
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

GRANT EXECUTE ON FUNCTION pack_order(uuid, uuid, jsonb) TO authenticated;
