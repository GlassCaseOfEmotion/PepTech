-- Trust score: starts at 70 (new customers are trusted by default).
-- Increases with positive history, decreases on red flags.
--
-- Formula:
--   base 70
--   + min(delivered_orders * 3, 24)   -- up to +24 for 8 completed orders
--   + min(account_age_months, 6)       -- up to +6 for 6+ months on platform
--   - (25 if 'payment' tag)            -- payment issue flag
--   - min(cancelled_orders * 5, 15)    -- up to -15 for 3+ cancellations
--   clamped to [0, 100]

CREATE OR REPLACE FUNCTION compute_customer_trust(p_customer_id uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  v_delivered   int;
  v_cancelled   int;
  v_months      int;
  v_has_payment bool;
  v_score       int;
BEGIN
  SELECT LEAST(
    (EXTRACT(YEAR  FROM age(now(), created_at)) * 12 +
     EXTRACT(MONTH FROM age(now(), created_at)))::int,
    12
  ) INTO v_months FROM public.customers WHERE id = p_customer_id;

  SELECT
    COUNT(*) FILTER (WHERE status = 'delivered'),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_delivered, v_cancelled
  FROM public.orders WHERE customer_id = p_customer_id;

  SELECT EXISTS (
    SELECT 1 FROM public.customer_tags
    WHERE customer_id = p_customer_id AND tag = 'payment'
  ) INTO v_has_payment;

  v_score := 70
    + LEAST(v_delivered * 3, 24)
    + LEAST(v_months, 6)
    - CASE WHEN v_has_payment THEN 25 ELSE 0 END
    - LEAST(v_cancelled * 5, 15);

  RETURN GREATEST(0, LEAST(100, v_score));
END;
$$;

-- Trigger function called from both triggers below
CREATE OR REPLACE FUNCTION trg_recompute_trust()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_cid uuid;
BEGIN
  v_cid := COALESCE(NEW.customer_id, OLD.customer_id);
  UPDATE public.customers SET trust_score = compute_customer_trust(v_cid) WHERE id = v_cid;
  RETURN NULL;
END;
$$;

-- Fire when an order's status changes (or order created/deleted)
CREATE TRIGGER trg_order_trust
AFTER INSERT OR UPDATE OF status OR DELETE
ON public.orders
FOR EACH ROW EXECUTE FUNCTION trg_recompute_trust();

-- Fire when a tag is added or removed (payment tag affects score)
CREATE TRIGGER trg_tag_trust
AFTER INSERT OR DELETE
ON public.customer_tags
FOR EACH ROW EXECUTE FUNCTION trg_recompute_trust();

-- Backfill all existing customers
UPDATE public.customers SET trust_score = compute_customer_trust(id);
