-- payment_amount_base: the order total expressed in the tenant's base currency.
-- Equal to payment_amount for all current orders (base currency was USD before multi-currency).
-- Set explicitly on every new order so LTV can sum a single clean column.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_amount_base numeric(14, 4);

-- Update the LTV trigger to sum payment_amount_base instead of payment_amount.
-- Orders with NULL payment_amount_base (pre-backfill edge cases) are excluded from the sum.
CREATE OR REPLACE FUNCTION recalculate_customer_ltv()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  v_customer_id := COALESCE(NEW.customer_id, OLD.customer_id);

  UPDATE public.customers
  SET ltv = (
    SELECT COALESCE(SUM(payment_amount_base), 0)
    FROM public.orders
    WHERE customer_id = v_customer_id
      AND status NOT IN ('cancelled')
      AND payment_amount_base IS NOT NULL
  )
  WHERE id = v_customer_id;

  RETURN NULL;
END;
$$;

-- Backfill: all pre-multi-currency orders used USD amounts and all existing tenants
-- were USD, so payment_amount_base = payment_amount for every existing order.
UPDATE orders
SET payment_amount_base = payment_amount
WHERE payment_amount_base IS NULL;
