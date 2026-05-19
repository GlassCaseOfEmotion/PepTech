-- Add fire_at column for deferred execution
ALTER TABLE automation_runs ADD COLUMN fire_at timestamptz;

-- Add 'scheduled' to the state check constraint
ALTER TABLE automation_runs DROP CONSTRAINT IF EXISTS automation_runs_state_check;
ALTER TABLE automation_runs ADD CONSTRAINT automation_runs_state_check
  CHECK (state IN ('ok', 'skip', 'warn', 'err', 'queued', 'scheduled'));

-- Index for the cron query: find scheduled runs due for execution
CREATE INDEX idx_automation_runs_scheduled ON automation_runs (tenant_id, fire_at)
  WHERE state = 'scheduled';
