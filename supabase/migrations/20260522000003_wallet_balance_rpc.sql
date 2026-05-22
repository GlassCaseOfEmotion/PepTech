CREATE OR REPLACE FUNCTION increment_wallet_balance(p_tenant_id uuid, p_amount numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE tenant_crypto_wallets
  SET balance_usdc = balance_usdc + p_amount,
      last_synced_at = now()
  WHERE tenant_id = p_tenant_id;
$$;
