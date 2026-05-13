-- base_currency on tenants (default USD for all existing tenants)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'USD';

ALTER TABLE tenants
  ADD CONSTRAINT tenants_base_currency_check
    CHECK (base_currency IN ('USD', 'IDR'));

-- currency: what currency payment_amount is stored in
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

ALTER TABLE orders
  ADD CONSTRAINT orders_currency_check
    CHECK (currency IN ('USD', 'IDR'));

-- exchange_rate: how many `currency` units equal 1 unit of the payment asset
-- e.g., USDT order with currency=IDR and exchange_rate=16000 means 1 USDT = Rp 16,000
-- NULL for cash, bank_transfer, and orders where base_currency = USD
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18, 6);

-- Global exchange rate cache — no tenant_id, no RLS (reference data)
CREATE TABLE IF NOT EXISTS exchange_rates (
  from_currency text           NOT NULL,
  to_currency   text           NOT NULL,
  rate          numeric(18, 6) NOT NULL,
  fetched_at    timestamptz    NOT NULL DEFAULT now(),
  PRIMARY KEY (from_currency, to_currency)
);
