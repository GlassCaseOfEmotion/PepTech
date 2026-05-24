-- Orders are created without a payment method; operator chooses it on the detail page.
-- The original table had DEFAULT 'USDT', so newly created orders silently inherited
-- that asset, making the order page look like USDT was already selected.
ALTER TABLE orders ALTER COLUMN payment_asset DROP DEFAULT;
