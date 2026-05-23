-- Add 'created' to the orders_status_check constraint
-- (the constraint was updated in the migration file after the initial push,
--  so this re-applies it correctly against the remote database)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('created', 'awaiting', 'confirming', 'packing', 'shipped', 'delivered'));
