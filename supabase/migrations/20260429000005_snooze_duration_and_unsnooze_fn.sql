ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

CREATE OR REPLACE FUNCTION public.unsnooze_expired()
RETURNS void LANGUAGE sql AS $$
  UPDATE public.conversations
  SET status = 'needs_reply', snoozed_until = NULL
  WHERE status = 'snoozed'
    AND snoozed_until IS NOT NULL
    AND snoozed_until < now();
$$;
