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
  /** Verbatim string the model read from the source. Stored in provenance for audit. */
  raw_name: string
  /** Family the model assigned, mapped to the canonical set for the tenant's
   * business_type. May be null when the model couldn't classify the row. */
  family: string | null
  /** The raw category text from the source (e.g. "RECOVERY & HEALING"). Kept
   * for audit and UI hover-state context; family is what gets committed. */
  raw_category: string | null
  /** Form factor: vial, pen, capsule, etc. Stored to products.presentation on commit. */
  presentation: Presentation | null
  /** Numeric unit price. */
  unit_price: number
  /** Initial stock-on-hand quantity. Written to batches.stock for the SEED-001 batch on commit. */
  stock: number
  /** Model self-rated confidence 0–1. */
  confidence: number
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

/** Per-row provenance stored in products.resources JSON on commit. */
export interface Provenance {
  source: 'extraction'
  model: string
  extracted_at: string
  source_file_ref: string
  source_filename: string
  raw_name: string
  confidence: number
  user_edited: boolean
  /** The category/family text exactly as the model read it from the source,
   * before normalisation to the canonical set. Useful audit info. */
  raw_family: string | null
}

/** What the commit server action accepts. */
export interface CommitInput {
  rows: Array<ExtractedProduct & { user_edited: boolean }>
  source_file_ref: string
  source_filename: string
  model: string
}
