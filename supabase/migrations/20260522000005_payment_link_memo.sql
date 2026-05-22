-- Add user-facing memo to payment links (shown on checkout page and in list)
ALTER TABLE crypto_payment_links
  ADD COLUMN IF NOT EXISTS memo text;
