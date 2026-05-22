-- Store the tenant-facing amount separately from the USD amount sent to NOWPayments.
-- amount_usd = USD value passed to NOWPayments (the gateway amount).
-- amount_base = amount in the tenant's own currency (what they see, e.g. IDR).
-- For USD tenants these two are identical.
ALTER TABLE crypto_payment_links
  ADD COLUMN IF NOT EXISTS amount_base     numeric(14, 4),
  ADD COLUMN IF NOT EXISTS base_currency   text NOT NULL DEFAULT 'USD';

-- Backfill: all existing links were created with USD tenants, so amount_base = amount_usd.
UPDATE crypto_payment_links
SET amount_base = amount_usd
WHERE amount_base IS NULL;
