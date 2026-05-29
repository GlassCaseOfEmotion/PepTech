import type { AgentTool } from '../types'
import { loadPeptideReference } from '@/lib/catalog/reference/lookup'

/** Read-only: the platform-wide peptide reference (canonical names + informal
 * aliases) for resolving customer shorthand. Compact projection to keep the
 * prompt small. */
export const getPeptideReference: AgentTool = {
  name: 'get_peptide_reference',
  description: 'List known peptides with their canonical names and informal aliases (e.g. "reta" → Retatrutide). Use to interpret customer shorthand, then match the canonical name against the tenant catalog (query_catalog).',
  inputSchema: { type: 'object', properties: {} },
  requiresConfirmation: false,
  async execute(_raw, supabase) {
    const refs = await loadPeptideReference(supabase)
    return refs.map(r => ({ canonical_name: r.canonical_name, family: r.family, aliases: r.aliases }))
  },
}
