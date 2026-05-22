-- supabase/migrations/20260522000002_crypto_wallet_fixes.sql

-- Add WITH CHECK to RLS policies
DROP POLICY "tenant_isolation" ON tenant_crypto_wallets;
CREATE POLICY "tenant_isolation" ON tenant_crypto_wallets
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

DROP POLICY "tenant_isolation" ON crypto_payment_links;
CREATE POLICY "tenant_isolation" ON crypto_payment_links
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

DROP POLICY "tenant_isolation" ON wallet_transactions;
CREATE POLICY "tenant_isolation" ON wallet_transactions
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- Add missing FK index
CREATE INDEX ON wallet_transactions (crypto_payment_link_id);

-- Add status CHECK constraint
ALTER TABLE crypto_payment_links
  ADD CONSTRAINT crypto_payment_links_status_check
  CHECK (status IN ('waiting','confirming','confirmed','sending','partially_paid','finished','failed','refunded','expired'));

-- Add UNIQUE constraints
ALTER TABLE tenant_crypto_wallets ADD CONSTRAINT tenant_crypto_wallets_privy_wallet_id_key UNIQUE (privy_wallet_id);
ALTER TABLE tenant_crypto_wallets ADD CONSTRAINT tenant_crypto_wallets_solana_address_key UNIQUE (solana_address);
