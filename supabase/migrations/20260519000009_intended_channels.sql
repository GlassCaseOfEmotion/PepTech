ALTER TABLE tenants ADD COLUMN IF NOT EXISTS intended_channels text[] NOT NULL DEFAULT '{}';
