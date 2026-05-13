-- One-time conversion: all stored amounts were entered in USD.
-- Tenant has switched to IDR. Multiply everything by 16,000 and mark orders as IDR.

-- Product prices
UPDATE public.products
SET
  unit_price = ROUND(unit_price * 16000),
  cost_price = CASE WHEN cost_price IS NOT NULL THEN ROUND(cost_price * 16000) ELSE NULL END;

-- Order item price snapshots
UPDATE public.order_items
SET unit_price_snapshot = ROUND(unit_price_snapshot * 16000);

-- Orders: convert payment_amount, set payment_amount_base (was nullified on currency change),
-- update currency label. The LTV trigger fires on payment_amount change and will recompute
-- customer LTV from the new payment_amount_base values.
UPDATE public.orders
SET
  payment_amount      = ROUND(payment_amount * 16000),
  payment_amount_base = ROUND(payment_amount * 16000),
  currency            = 'IDR'
WHERE currency = 'USD';
