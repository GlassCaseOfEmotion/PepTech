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
