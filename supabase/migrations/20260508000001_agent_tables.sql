CREATE TABLE public.agent_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trigger      text NOT NULL DEFAULT 'user',
  trigger_ref  text,
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role         text NOT NULL,
  content      text,
  tool_calls   jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_sessions_tenant_id_idx ON public.agent_sessions (tenant_id);
CREATE INDEX agent_sessions_status_idx    ON public.agent_sessions (tenant_id, status);
CREATE INDEX agent_messages_session_idx   ON public.agent_messages (session_id);
CREATE INDEX agent_messages_tenant_idx    ON public.agent_messages (tenant_id);

ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.agent_sessions
  FOR ALL USING (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_isolation" ON public.agent_messages
  FOR ALL USING (tenant_id = auth_tenant_id());
