// src/lib/catalog/reference/types.ts

/** Dose-aware protocol snapshot for a canonical peptide. Mirrors the
 * product_protocols columns so commit can write the row directly. */
export interface PeptideProtocol {
  vial_strength: string | null
  reconstitution_ml: number | null
  draw_volume_ml: number | null
  frequency: string | null
  timing: string | null
  cycle_length_weeks: number | null
  notes: string | null
  dose_display: string | null
}

/** One row from the peptide_reference table. */
export interface PeptideReference {
  id: string
  canonical_name: string
  family: string
  description: string
  aliases: string[]
  protocol: PeptideProtocol
}

/** Match result when an extracted product is looked up against the reference. */
export interface MatchResult {
  reference: PeptideReference
  matched_via: string  // the alias / canonical name string that matched
}
