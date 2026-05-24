-- Lifecycle stage + acquisition source on customers
ALTER TABLE public.customers
  ADD COLUMN lifecycle_stage text NOT NULL DEFAULT 'lead'
    CHECK (lifecycle_stage IN ('lead', 'customer')),
  ADD COLUMN acquisition_source text
    CHECK (acquisition_source IN ('referral', 'community', 'group_chat', 'direct', 'other')),
  ADD COLUMN acquisition_source_note text,
  ADD COLUMN referred_by_customer_id uuid
    REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN converted_at timestamptz;

CREATE INDEX customers_lifecycle_stage_idx
  ON public.customers (tenant_id, lifecycle_stage);

CREATE INDEX customers_acquisition_source_idx
  ON public.customers (tenant_id, acquisition_source)
  WHERE acquisition_source IS NOT NULL;

-- Audit table for lifecycle flips
CREATE TABLE public.customer_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id   uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  event_type    text        NOT NULL
                  CHECK (event_type IN ('lifecycle_flip_to_customer', 'lifecycle_flip_to_lead')),
  reason        text        NOT NULL
                  CHECK (reason IN ('auto_on_paid_order', 'manual')),
  actor_user_id uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_events_customer_idx
  ON public.customer_events (tenant_id, customer_id, created_at DESC);

-- RLS — tenant isolation, same shape as other tenant-scoped tables
ALTER TABLE public.customer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_events_tenant_isolation
  ON public.customer_events
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- One-shot backfill: anyone with at least one paid-or-after order is a customer.
-- 'confirming' = payment received, awaiting confirmations; everything from there onwards counts.
UPDATE public.customers c
SET
  lifecycle_stage = 'customer',
  converted_at    = (
    SELECT min(o.created_at)
    FROM public.orders o
    WHERE o.customer_id = c.id
      AND o.status IN ('confirming', 'packing', 'shipped', 'delivered')
  )
WHERE EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.customer_id = c.id
    AND o.status IN ('confirming', 'packing', 'shipped', 'delivered')
);
