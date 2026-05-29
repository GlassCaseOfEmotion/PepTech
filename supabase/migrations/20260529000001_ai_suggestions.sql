-- AI Copilot: proactive, draft-only commerce suggestions per conversation.
CREATE TABLE public.ai_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('cross_sell','draft_order','quote','reply','payment_link')),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','sent','committed','dismissed','expired')),
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence      numeric NOT NULL DEFAULT 0,
  reasoning       text,
  dedup_key       text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_suggestions_conversation_idx
  ON public.ai_suggestions (conversation_id, status, created_at DESC);

-- Used by dedup: fast lookup of open suggestions' dedup keys per conversation.
CREATE INDEX ai_suggestions_dedup_idx
  ON public.ai_suggestions (conversation_id, dedup_key)
  WHERE status = 'open';

ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.ai_suggestions
  FOR ALL
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- Realtime: inbox subscribes to INSERTs for the open conversation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ai_suggestions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_suggestions;
  END IF;
END $$;

ALTER TABLE public.ai_suggestions REPLICA IDENTITY FULL;
