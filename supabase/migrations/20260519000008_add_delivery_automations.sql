-- Replace seed function with all 8 default templates (5 original + 3 delivery-related)
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
      '{"to_status": "disputed"}',
      '[]',
      'score_adjust',
      '{"delta": -15, "reason": "Order disputed"}'
    ),
    (
      p_tenant_id,
      'Post-delivery check-in',
      'send',
      'order_state',
      '{"to_status": "delivered", "delay_days": 2}',
      '[]',
      'send_dm',
      '{"message": "Hey! Just checking in to make sure everything arrived okay and you''re happy with your order. Let us know if you have any questions at all — we''re always here to help 😊", "review_required": true}'
    ),
    (
      p_tenant_id,
      'Mid-cycle check-in',
      'send',
      'order_state',
      '{"to_status": "delivered", "delay_days": 14}',
      '[]',
      'send_dm',
      '{"message": "Hey! You''re about halfway through now — just wanted to check in and make sure everything''s going well. Still here if you have any questions!", "review_required": true}'
    ),
    (
      p_tenant_id,
      'Payment received',
      'check',
      'order_state',
      '{"to_status": "confirming"}',
      '[]',
      'send_dm',
      '{"message": "Great news — we''ve received your payment! We''re getting everything packed up now and will be shipping it off as soon as possible. We''ll send you tracking info once it''s on its way 📦", "review_required": true}'
    );
$$;

-- Back-fill the 3 new templates for all existing tenants that don't already have them
INSERT INTO automations (tenant_id, name, icon, trigger_type, trigger_params, conditions, action_type, action_params)
SELECT
  t.id,
  v.name,
  v.icon,
  v.trigger_type,
  v.trigger_params::jsonb,
  v.conditions::jsonb,
  v.action_type,
  v.action_params::jsonb
FROM tenants t
CROSS JOIN (VALUES
  (
    'Post-delivery check-in',
    'send',
    'order_state',
    '{"to_status": "delivered", "delay_days": 2}',
    '[]',
    'send_dm',
    '{"message": "Hey! Just checking in to make sure everything arrived okay and you''re happy with your order. Let us know if you have any questions at all — we''re always here to help 😊", "review_required": true}'
  ),
  (
    'Mid-cycle check-in',
    'send',
    'order_state',
    '{"to_status": "delivered", "delay_days": 14}',
    '[]',
    'send_dm',
    '{"message": "Hey! You''re about halfway through now — just wanted to check in and make sure everything''s going well. Still here if you have any questions!", "review_required": true}'
  ),
  (
    'Payment received',
    'check',
    'order_state',
    '{"to_status": "confirming"}',
    '[]',
    'send_dm',
    '{"message": "Great news — we''ve received your payment! We''re getting everything packed up now and will be shipping it off as soon as possible. We''ll send you tracking info once it''s on its way 📦", "review_required": true}'
  )
) AS v(name, icon, trigger_type, trigger_params, conditions, action_type, action_params)
-- Only insert if this tenant doesn't already have an automation with this name
WHERE NOT EXISTS (
  SELECT 1 FROM automations a
  WHERE a.tenant_id = t.id AND a.name = v.name
);
