-- Atomic unread count increment (avoids race condition on concurrent messages)
create or replace function public.increment_unread_count(conv_id uuid, tenant uuid)
returns void language sql security definer as $$
  update public.conversations
  set unread_count = unread_count + 1
  where id = conv_id
    and tenant_id = tenant;
$$;

-- Grant to service_role (used by webhook handlers)
grant execute on function public.increment_unread_count to service_role;
