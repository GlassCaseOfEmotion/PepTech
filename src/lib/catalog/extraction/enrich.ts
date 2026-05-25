import type { ExtractionResult } from './types'
import { findMatch } from '@/lib/catalog/reference/match'
import type { PeptideReference } from '@/lib/catalog/reference/types'

/**
 * Pure function. For each product in the extraction result, look it up
 * against the loaded peptide reference. On match: tag with reference_id,
 * pull the reference's description and protocol, and override the model's
 * guessed family with the reference's authoritative family.
 *
 * No-op when references is empty or no product matches.
 */
export function enrichWithReference(
  result: ExtractionResult,
  references: PeptideReference[],
): ExtractionResult {
  if (references.length === 0) return result
  const products = result.products.map(p => {
    const match = findMatch(p.name, references)
    if (!match) return p
    return {
      ...p,
      reference_id: match.reference.id,
      description: match.reference.description,
      protocol: match.reference.protocol,
      family: match.reference.family,  // authoritative; overrides the model
    }
  })
  return { ...result, products }
}
