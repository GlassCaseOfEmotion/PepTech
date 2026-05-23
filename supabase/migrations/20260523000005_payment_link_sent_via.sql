ALTER TABLE crypto_payment_links
  ADD COLUMN IF NOT EXISTS sent_via text;
