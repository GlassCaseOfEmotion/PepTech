CREATE OR REPLACE FUNCTION recalculate_customer_ltv()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  v_customer_id := COALESCE(NEW.customer_id, OLD.customer_id);

  UPDATE public.customers
  SET ltv = (
    SELECT COALESCE(SUM(payment_amount), 0)
    FROM public.orders
    WHERE customer_id = v_customer_id
      AND status NOT IN ('cancelled')
  )
  WHERE id = v_customer_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_order_ltv
AFTER INSERT OR UPDATE OF status, payment_amount OR DELETE
ON public.orders
FOR EACH ROW EXECUTE FUNCTION recalculate_customer_ltv();
