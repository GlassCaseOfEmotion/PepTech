-- products.presentation: physical form factor of the product
-- (e.g. 'vial', 'pen', 'capsule', 'spray', 'other'). Nullable for back-compat;
-- intentionally not constrained to an enum so the agent can pass through
-- unusual form factors discovered in catalog extraction without a migration.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS presentation text;
