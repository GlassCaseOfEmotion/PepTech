-- Exclude 'draft' orders from customer LTV.
-- Draft orders (created by the copilot before finalisation) set payment_amount_base,
-- so they previously inflated LTV until cancelled or completed.
-- Only the status filter changes; everything else is verbatim from 20260513000002.
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
      AND status NOT IN ('cancelled', 'draft')
      AND payment_amount_base IS NOT NULL
  )
  WHERE id = v_customer_id;

  RETURN NULL;
END;
$$;
