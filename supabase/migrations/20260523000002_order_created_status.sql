-- New orders start as 'created' instead of 'awaiting'
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'created';

-- Orders are created without a payment method; it is set on the detail page
ALTER TABLE orders ALTER COLUMN payment_asset DROP NOT NULL;

-- Legacy rows — migrate customer_chooses to null
UPDATE orders SET payment_asset = NULL WHERE payment_asset = 'customer_chooses';

-- Update status constraint to allow 'created' as the new initial status
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('created', 'awaiting', 'confirming', 'packing', 'shipped', 'delivered'));
