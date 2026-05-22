CREATE TABLE tenant_crypto_wallets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL UNIQUE REFERENCES tenants(id),
  privy_wallet_id  text NOT NULL UNIQUE,
  solana_address   text NOT NULL UNIQUE,
  balance_usdc     numeric(14,6) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_synced_at   timestamptz
);
ALTER TABLE tenant_crypto_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON tenant_crypto_wallets
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE TABLE crypto_payment_links (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  order_id              uuid NOT NULL REFERENCES orders(id),
  nowpayments_id        text NOT NULL UNIQUE,
  hosted_url            text NOT NULL,
  amount_usd            numeric(10,2) NOT NULL,
  status                text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','confirming','confirmed','sending','partially_paid','finished','failed','refunded','expired')),
  payout_address        text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz,
  confirmed_at          timestamptz,
  paid_token            text,
  paid_amount           numeric(20,8),
  usdc_received         numeric(14,6),
  nowpayments_tx_id     text
);
ALTER TABLE crypto_payment_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON crypto_payment_links
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE INDEX ON crypto_payment_links (order_id);
CREATE INDEX ON crypto_payment_links (tenant_id, status);

CREATE TABLE wallet_transactions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  crypto_payment_link_id uuid REFERENCES crypto_payment_links(id),
  amount_usdc            numeric(14,6) NOT NULL,
  solana_tx_signature    text,
  source_token           text,
  source_amount          numeric(20,8),
  created_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON wallet_transactions
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE INDEX ON wallet_transactions (tenant_id, created_at DESC);
CREATE INDEX ON wallet_transactions (crypto_payment_link_id);
