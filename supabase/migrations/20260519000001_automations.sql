-- supabase/migrations/20260519000001_automations.sql

CREATE TABLE automations (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  name            text NOT NULL,
  icon            text NOT NULL DEFAULT 'send',
  state           text NOT NULL DEFAULT 'off' CHECK (state IN ('on','off','paused')),
  trigger_type    text NOT NULL CHECK (trigger_type IN ('protocol_progress','schedule','new_thread','order_state')),
  trigger_params  jsonb NOT NULL DEFAULT '{}',
  conditions      jsonb NOT NULL DEFAULT '[]',
  action_type     text NOT NULL CHECK (action_type IN ('send_dm','operator_alert','score_adjust','operator_task')),
  action_params   jsonb NOT NULL DEFAULT '{}',
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_automations_select" ON automations
  FOR SELECT
  USING (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_automations_insert" ON automations
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_automations_update" ON automations
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_automations_delete" ON automations
  FOR DELETE
  USING (tenant_id = auth_tenant_id());

CREATE TABLE automation_runs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id   uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL,
  state           text NOT NULL CHECK (state IN ('ok','skip','warn','err','queued')),
  context_ref     text,
  context_label   text,
  action_summary  text,
  action_payload  jsonb,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_automation_runs_select" ON automation_runs
  FOR SELECT
  USING (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_automation_runs_insert" ON automation_runs
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_automation_runs_update" ON automation_runs
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_automation_runs_delete" ON automation_runs
  FOR DELETE
  USING (tenant_id = auth_tenant_id());

CREATE INDEX automations_tenant_state_idx ON automations(tenant_id, state);
CREATE INDEX automation_runs_automation_created_idx ON automation_runs(automation_id, created_at DESC);
CREATE INDEX automation_runs_tenant_idx ON automation_runs(tenant_id);

CREATE OR REPLACE FUNCTION seed_default_automations(p_tenant_id uuid)
RETURNS void LANGUAGE sql AS $$
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
      '{"to_status": "dispute"}',
      '[]',
      'score_adjust',
      '{"delta": -15, "reason": "Order disputed"}'
    );
$$;
