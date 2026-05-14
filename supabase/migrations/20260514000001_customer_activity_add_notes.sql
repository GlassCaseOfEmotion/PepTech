-- Add notes to the customer_activity view so the customer detail timeline
-- includes internal notes alongside order events and tag additions.

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
FROM customer_tags ct

UNION ALL

SELECT
  n.id,
  n.tenant_id,
  n.customer_id,
  'note'           AS source,
  'Note added'     AS label,
  NULL             AS ref_number,
  NULL             AS amount,
  LEFT(n.content, 80) AS note,
  n.created_at
FROM notes n;
