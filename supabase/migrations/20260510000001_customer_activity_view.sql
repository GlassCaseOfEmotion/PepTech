-- customer_activity view: unified per-customer timeline from order_events + customer_tags.
-- Uses security invoker (PG 15 default) so RLS on the underlying tables applies automatically.

CREATE OR REPLACE VIEW customer_activity AS
SELECT
  oe.id,
  o.tenant_id,
  o.customer_id,
  'order'          AS source,
  oe.action        AS label,
  o.ref_number,
  o.payment_amount AS amount,
  oe.note,
  oe.created_at
FROM order_events oe
JOIN orders o ON o.id = oe.order_id

UNION ALL

SELECT
  ct.id,
  ct.tenant_id,
  ct.customer_id,
  'tag'            AS source,
  'Tag added'      AS label,
  NULL             AS ref_number,
  NULL             AS amount,
  ct.tag           AS note,
  ct.created_at
FROM customer_tags ct;
