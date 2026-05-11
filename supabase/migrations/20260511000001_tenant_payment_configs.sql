CREATE TABLE tenant_payment_configs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  type           text NOT NULL,
  wallet_address text,
  bank_name      text,
  account_name   text,
  account_number text,
  sort_code      text,
  iban           text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, type)
);

CREATE INDEX ON tenant_payment_configs (tenant_id);

ALTER TABLE tenant_payment_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON tenant_payment_configs
  USING (tenant_id = auth_tenant_id());
