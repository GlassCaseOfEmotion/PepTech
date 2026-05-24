/** A single product the model extracted from an uploaded price list. */
export interface ExtractedProduct {
  /** Canonical name as it should appear in the products table. */
  name: string
  /** Verbatim string the model read from the source. Stored in provenance for audit. */
  raw_name: string
  /** Free-form category text from the source (e.g. "RECOVERY & HEALING"). Mapped to product_family on commit. */
  category: string | null
  /** Numeric unit price. */
  unit_price: number
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
}

/** What the commit server action accepts. */
export interface CommitInput {
  rows: Array<ExtractedProduct & { user_edited: boolean }>
  source_file_ref: string
  source_filename: string
  model: string
}
