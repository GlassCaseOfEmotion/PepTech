-- Add 'draft' to the orders status set (the copilot builds orders at 'draft'
-- before finalizing them into the normal pipeline).
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('draft', 'created', 'awaiting', 'confirming', 'packing', 'shipped', 'delivered'));
