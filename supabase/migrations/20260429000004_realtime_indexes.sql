CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON public.messages (conversation_id);
CREATE INDEX IF NOT EXISTS messages_tenant_id_idx ON public.messages (tenant_id);
CREATE INDEX IF NOT EXISTS conversations_tenant_id_idx ON public.conversations (tenant_id);
CREATE INDEX IF NOT EXISTS conversations_status_idx ON public.conversations (status);
