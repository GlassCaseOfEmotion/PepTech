-- supabase/migrations/20260512000001_product_protocols.sql

CREATE TABLE product_protocols (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  vial_strength       text,
  reconstitution_ml   numeric(6,2) NOT NULL,
  draw_volume_ml      numeric(6,3) NOT NULL,
  frequency           text NOT NULL,
  timing              text,
  cycle_length_weeks  integer,
  storage             text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id)
);

CREATE INDEX product_protocols_tenant_id_idx ON product_protocols (tenant_id);

ALTER TABLE product_protocols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON product_protocols
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE TABLE customer_protocol_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  draw_volume_ml  numeric(6,3),
  frequency       text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, product_id)
);

CREATE INDEX customer_protocol_overrides_tenant_idx   ON customer_protocol_overrides (tenant_id);
CREATE INDEX customer_protocol_overrides_customer_idx ON customer_protocol_overrides (customer_id);

ALTER TABLE customer_protocol_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON customer_protocol_overrides
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
