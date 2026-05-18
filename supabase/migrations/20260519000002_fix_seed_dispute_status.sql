-- Fix typo in seed_default_automations: 'dispute' → 'disputed'
CREATE OR REPLACE FUNCTION seed_default_automations(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO automations (tenant_id, name, icon, trigger_type, trigger_params, conditions, action_type, action_params)
  SELECT
    p_tenant_id,
    name,
    icon,
    trigger_type,
    trigger_params::jsonb,
    '[]'::jsonb,
    action_type,
    action_params::jsonb
  FROM (VALUES
    (
      'Reorder nudge',
      'send',
      'protocol_progress',
      '{"days_before_end": 5}',
      'send_dm',
      '{"message": "Hey! Your current protocol is almost done. Ready to reorder?", "review_required": true}'
    ),
    (
      'First-contact welcome',
      'send',
      'new_thread',
      '{}',
      'send_dm',
      '{"message": "Welcome! Thanks for reaching out. How can I help you today?", "review_required": true}'
    ),
    (
      'Daily digest',
      'alert',
      'schedule',
      '{"cron": "0 8 * * *"}',
      'operator_alert',
      '{"message": "Daily digest: review your pending tasks and conversations.", "severity": "info"}'
    ),
    (
      'Trust score: delivery',
      'check',
      'order_state',
      '{"to_status": "delivered"}',
      'score_adjust',
      '{"delta": 3, "reason": "Order delivered"}'
    ),
    (
      'Trust score: dispute',
      'alert',
      'order_state',
      '{"to_status": "disputed"}',
      'score_adjust',
      '{"delta": -15, "reason": "Order disputed"}'
    )
  ) AS t(name, icon, trigger_type, trigger_params, action_type, action_params);
$$;
