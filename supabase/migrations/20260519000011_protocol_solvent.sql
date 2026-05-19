ALTER TABLE product_protocols
  ADD COLUMN IF NOT EXISTS reconstitution_solvent text NOT NULL DEFAULT 'bacteriostatic water';
