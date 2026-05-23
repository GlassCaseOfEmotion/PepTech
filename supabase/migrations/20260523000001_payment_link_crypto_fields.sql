ALTER TABLE crypto_payment_links
  ADD COLUMN IF NOT EXISTS pay_address     text,
  ADD COLUMN IF NOT EXISTS pay_currency    text,
  ADD COLUMN IF NOT EXISTS pay_amount_crypto numeric(20,8);
