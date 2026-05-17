-- Track 24hr WhatsApp conversation window
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS window_expires_at timestamptz;

-- WhatsApp HSM templates (separate from quick-reply templates)
CREATE TABLE public.whatsapp_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  body         text        NOT NULL,
  variables    jsonb       NOT NULL DEFAULT '[]',
  content_sid  text,
  status       text        NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','pending','approved','rejected')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_whatsapp_templates" ON public.whatsapp_templates
  USING  (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE TRIGGER set_updated_at_whatsapp_templates
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
