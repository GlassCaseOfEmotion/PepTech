-- Per-tenant opt-in for the proactive AI copilot (cost control + mute).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS copilot_enabled boolean NOT NULL DEFAULT false;
