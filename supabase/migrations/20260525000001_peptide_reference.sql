-- Canonical reference for known peptides. Catalog imports look up extracted
-- products against this table by canonical_name + aliases, and on match
-- auto-populate products.description plus create a product_protocols row.
CREATE TABLE IF NOT EXISTS peptide_reference (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name      text NOT NULL UNIQUE,
  family              text NOT NULL,
  description         text NOT NULL,
  aliases             jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Mirrors product_protocols columns 1:1 so we can write rows directly.
  vial_strength       text,
  reconstitution_ml   numeric,
  draw_volume_ml      numeric,
  frequency           text,
  timing              text,
  cycle_length_weeks  integer,
  notes               text,
  dose_display        text,
  source              text NOT NULL DEFAULT 'curated',
  created_at          timestamp with time zone NOT NULL DEFAULT now(),
  updated_at          timestamp with time zone NOT NULL DEFAULT now()
);

-- GIN index on the aliases JSONB array so lookups by alias are fast.
CREATE INDEX IF NOT EXISTS idx_peptide_reference_aliases
  ON peptide_reference USING gin (aliases);

-- Case-insensitive canonical lookup index.
CREATE INDEX IF NOT EXISTS idx_peptide_reference_canonical
  ON peptide_reference (lower(canonical_name));

-- Reference data is platform-wide (not tenant-scoped). Allow read for all
-- authenticated users; writes happen via service role / migrations only.
ALTER TABLE peptide_reference ENABLE ROW LEVEL SECURITY;
CREATE POLICY "peptide_reference_read_all" ON peptide_reference
  FOR SELECT TO authenticated USING (true);
