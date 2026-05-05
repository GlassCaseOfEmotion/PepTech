-- Per-tenant sequential order reference numbers
CREATE TABLE tenant_order_sequences (
  tenant_id  uuid PRIMARY KEY REFERENCES tenants(id),
  last_value integer NOT NULL DEFAULT 1000
);

ALTER TABLE tenant_order_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_sequence" ON tenant_order_sequences
  USING (tenant_id = auth_tenant_id());

-- Remove the global sequence default from ref_number (will be set by application)
ALTER TABLE orders ALTER COLUMN ref_number DROP DEFAULT;
DROP SEQUENCE IF EXISTS order_ref_seq;

-- updated_at trigger (reuse existing set_updated_at function)
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Status constraint
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('awaiting', 'confirming', 'packing', 'shipped', 'delivered'));

-- Qty constraint
ALTER TABLE order_items ADD CONSTRAINT order_items_qty_positive
  CHECK (qty > 0);

-- Indexes on high-traffic FK columns
CREATE INDEX orders_tenant_id_idx       ON orders (tenant_id);
CREATE INDEX orders_customer_id_idx     ON orders (customer_id);
CREATE INDEX orders_conversation_id_idx ON orders (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX order_items_order_id_idx   ON order_items (order_id);
CREATE INDEX order_items_product_id_idx ON order_items (product_id);
CREATE INDEX order_events_order_id_idx  ON order_events (order_id);
