DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agent_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;
  END IF;
END $$;

ALTER TABLE public.agent_messages REPLICA IDENTITY FULL;
