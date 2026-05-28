-- Fire a Slack notification when a new Pep Tech merchant signs up.
-- Mirrors the waitlist trigger (20260527000002): calls the shared slack-notify
-- edge function asynchronously via pg_net so a slow/failing Slack post never
-- blocks (or rolls back) the signup.
--
-- This replaces the application-layer notifyNewMerchant() fetch that used to
-- run inside the signup server action — moving it to the DB layer means the
-- alert fires no matter how a merchant is created.
--
-- Why the trigger is on `users` (owner) and not `tenants`: at tenants-INSERT
-- time the owner's email does not exist yet (the users row is created later in
-- the signup flow). Firing on the owner users row is the first moment where
-- both the business name and the email are known. The function looks the
-- business name up from tenants and sends an enriched record.
--
-- Shared secret lives in Supabase Vault under 'slack_notify_secret' (same one
-- the waitlist trigger uses); it must match WEBHOOK_SECRET on the edge function.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_slack_new_merchant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_secret text;
  v_business_name text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'slack_notify_secret'
  LIMIT 1;

  SELECT name INTO v_business_name
  FROM public.tenants
  WHERE id = NEW.tenant_id;

  PERFORM net.http_post(
    url     := 'https://alabcczlqbtaspfbcizh.supabase.co/functions/v1/slack-notify',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', COALESCE(v_secret, '')
    ),
    body    := jsonb_build_object(
      'table',  'tenants',
      'type',   'INSERT',
      'record', jsonb_build_object(
        'tenant_id',     NEW.tenant_id,
        'business_name', v_business_name,
        'email',         NEW.email
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A notification failure must never block a signup.
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_owner_slack_notify
  AFTER INSERT ON public.users
  FOR EACH ROW
  WHEN (NEW.role = 'owner')
  EXECUTE FUNCTION public.notify_slack_new_merchant();
