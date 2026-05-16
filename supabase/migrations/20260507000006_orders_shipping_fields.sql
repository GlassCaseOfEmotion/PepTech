alter table public.orders
  add column if not exists tracking_url      text,
  add column if not exists estimated_delivery date,
  add column if not exists shipped_at        timestamptz;
