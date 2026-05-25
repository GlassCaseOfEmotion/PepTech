// src/lib/catalog/reference/lookup.ts
import type { AgentSupabase } from '@/lib/agent/types'
import type { PeptideReference } from './types'

/** Load every peptide_reference row. The table is small (a couple of hundred
 * rows max), platform-wide, and rarely changes — full select per import is
 * fine and avoids per-product query round-trips. */
export async function loadPeptideReference(supabase: AgentSupabase): Promise<PeptideReference[]> {
  const { data, error } = await supabase
    .from('peptide_reference')
    .select('id, canonical_name, family, description, aliases, vial_strength, reconstitution_ml, draw_volume_ml, frequency, timing, cycle_length_weeks, notes, dose_display')
  if (error) throw new Error(`peptide_reference load failed: ${error.message}`)
  const rows = (data ?? []) as Array<{
    id: string
    canonical_name: string
    family: string
    description: string
    aliases: unknown
    vial_strength: string | null
    reconstitution_ml: number | null
    draw_volume_ml: number | null
    frequency: string | null
    timing: string | null
    cycle_length_weeks: number | null
    notes: string | null
    dose_display: string | null
  }>
  return rows.map(r => ({
    id: r.id,
    canonical_name: r.canonical_name,
    family: r.family,
    description: r.description,
    aliases: Array.isArray(r.aliases) ? (r.aliases as string[]) : [],
    protocol: {
      vial_strength: r.vial_strength,
      reconstitution_ml: r.reconstitution_ml,
      draw_volume_ml: r.draw_volume_ml,
      frequency: r.frequency,
      timing: r.timing,
      cycle_length_weeks: r.cycle_length_weeks,
      notes: r.notes,
      dose_display: r.dose_display,
    },
  }))
}
