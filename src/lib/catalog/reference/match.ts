// src/lib/catalog/reference/match.ts
import type { MatchResult, PeptideReference } from './types'

/** Normalise a product name for reference lookup: lowercase, treat hyphens /
 * slashes / underscores as spaces, collapse whitespace, strip trailing dose
 * suffix ("10mg", "50mg x 60caps", "5mg+5mg"). */
export function normaliseName(s: string): string {
  return s
    .replace(/\s+\d+(?:\.\d+)?\s*(?:mg|mcg|iu|ml|caps?)\b.*$/i, '')
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** First-match lookup against canonical_name + aliases. Both sides are
 * normalised, so e.g. "BPC157" matches a canonical "BPC-157 5mg" via
 * normalised form "bpc 157". */
export function findMatch(name: string, references: PeptideReference[]): MatchResult | null {
  const target = normaliseName(name)
  if (!target) return null
  for (const reference of references) {
    const candidates: string[] = [reference.canonical_name, ...reference.aliases]
    for (const candidate of candidates) {
      if (normaliseName(candidate) === target) {
        return { reference, matched_via: candidate }
      }
    }
  }
  return null
}
