-- Prevent double-crediting: one transaction row per payment link
-- (nullable FK so WHERE crypto_payment_link_id IS NOT NULL is needed)
CREATE UNIQUE INDEX wallet_transactions_link_id_unique
  ON wallet_transactions (crypto_payment_link_id)
  WHERE crypto_payment_link_id IS NOT NULL;
