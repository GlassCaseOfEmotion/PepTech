CREATE TABLE public.templates (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid        REFERENCES public.tenants(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  content         text        NOT NULL,
  sort_order      int         NOT NULL DEFAULT 0,
  hidden_by_tenants uuid[]    NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX templates_tenant_idx ON public.templates (tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY templates_select ON public.templates FOR SELECT USING (
  tenant_id = auth_tenant_id()
  OR (
    tenant_id IS NULL
    AND auth_tenant_id() IS NOT NULL
    AND NOT (auth_tenant_id() = ANY(hidden_by_tenants))
  )
);

CREATE POLICY templates_write ON public.templates
  FOR ALL
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE OR REPLACE FUNCTION public.hide_platform_template(template_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.templates
  SET hidden_by_tenants = array_append(hidden_by_tenants, auth_tenant_id())
  WHERE id = template_id
    AND tenant_id IS NULL
    AND NOT (auth_tenant_id() = ANY(hidden_by_tenants));
$$;

INSERT INTO public.templates (tenant_id, title, content, sort_order) VALUES
(NULL, 'Payment received',    'Thanks for your payment of $[AMOUNT]! Your order is being prepared and will be dispatched shortly.', 10),
(NULL, 'Order dispatched',    'Great news — your order has been dispatched! You''ll receive tracking info shortly.', 20),
(NULL, 'Tracking info',       'Your tracking number is [TRACKING]. You can use this to follow your shipment.', 30),
(NULL, 'Out of stock',        'Unfortunately [PRODUCT] is currently out of stock. We expect to restock within [TIMEFRAME] and will let you know as soon as it''s available.', 40),
(NULL, 'Order confirmed',     'Your order is confirmed! Total: $[AMOUNT]. We''ll update you once it''s on its way.', 50),
(NULL, 'Follow up',           'Hi [NAME], just checking in — is there anything else I can help you with?', 60);
