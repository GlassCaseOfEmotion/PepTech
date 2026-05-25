/** Physical form factor. Values are not strictly enforced server-side but the
 * extraction prompt asks the model to choose from this set; the proposal
 * editor restricts user-selected values to these too. */
export type Presentation = 'vial' | 'pen' | 'capsule' | 'spray' | 'oral' | 'other'

export const PRESENTATION_OPTIONS: Presentation[] = ['vial', 'pen', 'capsule', 'spray', 'oral', 'other']

/** Canonical product families per tenant business type. The extraction prompt
 * is told to MAP whatever category headings it finds in the source onto one of
 * these values. The proposal editor's dropdown is restricted to this set. */
export const CANONICAL_FAMILIES: Record<'peptides' | 'nootropics' | 'sarms' | 'general', string[]> = {
  peptides:   ['GLP-1', 'HEALING', 'GH', 'COSMETIC', 'MITO', 'NEURO', 'OTHER'],
  nootropics: ['COGNITIVE', 'ADAPTOGEN', 'NAD+', 'OTHER'],
  sarms:      ['BULKING', 'CUTTING', 'RECOMP', 'OTHER'],
  general:    ['VITAMIN', 'MINERAL', 'HERBAL', 'OTHER'],
}

/** A single product the model extracted from an uploaded price list. */
export interface ExtractedProduct {
  /** Canonical name as it should appear in the products table. */
  name: string
  /** Shorthand SKU like "RETA-10", "BPC-157". Auto-generated server-side
   * from the name but editable in the proposal UI; what the user types
   * becomes the committed value (with collision-dedup against existing
   * tenant SKUs). */
  sku: string
  /** Verbatim string the model read from the source. Used for the inline
   * "Source: <name>" tooltip in the proposal table when the user edits the
   * name field to something different. Not persisted. */
  raw_name: string
  /** Family the model assigned, mapped to the canonical set for the tenant's
   * business_type. May be null when the model couldn't classify the row. */
  family: string | null
  /** The raw category text from the source (e.g. "RECOVERY & HEALING"). Kept
   * for UI hover-state context only. Not persisted. */
  raw_category: string | null
  /** Form factor: vial, pen, capsule, etc. Stored to products.presentation on commit. */
  presentation: Presentation | null
  /** Numeric unit price. */
  unit_price: number
  /** Initial stock-on-hand quantity. Written to batches.stock for the SEED-001 batch on commit. */
  stock: number
  /** Model self-rated confidence 0–1. */
  confidence: number
  /** ID of the matching peptide_reference row, or null if unmatched. */
  reference_id: string | null
  /** Description copied from the matching reference, or null if unmatched. */
  description: string | null
  /** Protocol copied from the matching reference, or null if unmatched. */
  protocol: import('@/lib/catalog/reference/types').PeptideProtocol | null
}

/** Result of one extraction call. */
export interface ExtractionResult {
  detected_currency: string | null
  products: ExtractedProduct[]
  tenant_notes: string[]
  source_file_ref: string
  source_filename: string
  model: string
}

/** What the commit server action accepts. */
export interface CommitInput {
  rows: Array<ExtractedProduct & { user_edited: boolean }>
  source_file_ref: string
  source_filename: string
  model: string
}
