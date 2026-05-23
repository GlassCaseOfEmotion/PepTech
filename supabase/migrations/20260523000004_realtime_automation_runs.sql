-- Add automation_runs (and order_events, used by the notification bell) to the
-- supabase_realtime publication so the client can subscribe to INSERTs.
-- Guarded with NOT EXISTS so re-running is safe even if a table was added
-- out-of-band via Studio.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'automation_runs'
  ) then
    alter publication supabase_realtime add table public.automation_runs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_events'
  ) then
    alter publication supabase_realtime add table public.order_events;
  end if;
end $$;

-- Realtime needs REPLICA IDENTITY FULL to surface all column values on INSERT
alter table public.automation_runs replica identity full;
alter table public.order_events replica identity full;
