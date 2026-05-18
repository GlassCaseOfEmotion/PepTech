-- Fix 1: Add FK references to tenants table (pattern used by all tenant-scoped tables)
ALTER TABLE automations
  ADD CONSTRAINT automations_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE automation_runs
  ADD CONSTRAINT automation_runs_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Fix 2: NOT NULL on timestamp columns
ALTER TABLE automations ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE automations ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE automation_runs ALTER COLUMN created_at SET NOT NULL;

-- Fix 3: updated_at trigger (reuses existing set_updated_at() function)
CREATE TRIGGER automations_updated_at
  BEFORE UPDATE ON automations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Fix 4: Restore seed function with SECURITY DEFINER + correct conditions
CREATE OR REPLACE FUNCTION seed_default_automations(p_tenant_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  INSERT INTO automations (tenant_id, name, icon, trigger_type, trigger_params, conditions, action_type, action_params)
  VALUES
    (
      p_tenant_id,
      'Reorder nudge',
      'send',
      'protocol_progress',
      '{"days_before_end": 5}',
      '[{"type": "trust_score", "operator": "gte", "value": 50}]',
      'send_dm',
      '{"message": "Hey! Your cycle is almost up — want to reorder?", "review_required": true}'
    ),
    (
      p_tenant_id,
      'First-contact welcome',
      'wave',
      'new_thread',
      '{}',
      '[{"type": "is_new_customer", "operator": "eq", "value": true}]',
      'send_dm',
      '{"message": "Welcome! Happy to help you get started.", "review_required": true}'
    ),
    (
      p_tenant_id,
      'Daily digest',
      'sun',
      'schedule',
      '{"cron": "0 8 * * *"}',
      '[]',
      'operator_alert',
      '{"message": "Daily digest", "severity": "info"}'
    ),
    (
      p_tenant_id,
      'Trust score: delivery',
      'shield',
      'order_state',
      '{"to_status": "delivered"}',
      '[]',
      'score_adjust',
      '{"delta": 3, "reason": "Order delivered"}'
    ),
    (
      p_tenant_id,
      'Trust score: dispute',
      'alert',
      'order_state',
      '{"to_status": "disputed"}',
      '[]',
      'score_adjust',
      '{"delta": -15, "reason": "Order disputed"}'
    );
$$;

REVOKE EXECUTE ON FUNCTION seed_default_automations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_default_automations(uuid) TO service_role;
