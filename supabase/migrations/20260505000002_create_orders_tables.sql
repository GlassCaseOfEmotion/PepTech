CREATE SEQUENCE IF NOT EXISTS order_ref_seq START WITH 2000;

CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  ref_number       text UNIQUE NOT NULL DEFAULT ('A-' || nextval('order_ref_seq')::text),
  customer_id      uuid NOT NULL REFERENCES customers(id),
  conversation_id  uuid REFERENCES conversations(id),
  status           text NOT NULL DEFAULT 'awaiting',
  payment_asset    text NOT NULL DEFAULT 'USDT',
  payment_amount   numeric(10,2) NOT NULL DEFAULT 0,
  payment_address  text,
  tx_hash          text,
  shipping_address jsonb,
  carrier          text,
  tracking_number  text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_orders" ON orders
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE TABLE order_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES products(id),
  batch_id            uuid REFERENCES batches(id),
  qty                 integer NOT NULL,
  unit_price_snapshot numeric(10,2) NOT NULL
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_order_items" ON order_items
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE TABLE order_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  order_id   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor      text NOT NULL DEFAULT 'operator',
  action     text NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_order_events" ON order_events
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
