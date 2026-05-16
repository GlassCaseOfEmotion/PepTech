-- Expand currency check to cover all onboarding options
ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_base_currency_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_base_currency_check
    CHECK (base_currency IN ('USD', 'EUR', 'GBP', 'AUD', 'SGD', 'IDR', 'MYR', 'THB'));

-- business_type: which category the tenant chose in the wizard
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS business_type text
    CHECK (business_type IN ('peptides', 'nootropics', 'sarms', 'general'));

-- onboarded_at: NULL = wizard not yet completed
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;
