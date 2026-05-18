-- Atomic trust score adjustment with clamping [0, 100]
-- Called by the automation engine to avoid read-modify-write races
CREATE OR REPLACE FUNCTION adjust_trust_score(p_customer_id uuid, p_delta int)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  UPDATE customers
  SET trust_score = LEAST(100, GREATEST(0, trust_score + p_delta))
  WHERE id = p_customer_id;
$$;

REVOKE EXECUTE ON FUNCTION adjust_trust_score(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adjust_trust_score(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION adjust_trust_score(uuid, int) TO authenticated;
