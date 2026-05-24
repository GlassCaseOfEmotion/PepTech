import { CANONICAL_FAMILIES, PRESENTATION_OPTIONS } from './types'

export interface PromptContext {
  businessType: 'peptides' | 'nootropics' | 'sarms' | 'general' | null
  baseCurrency: string
}

// strict: false intentionally. We rely on the validator to normalise and
// default any missing/extra fields. The previous strict:true configuration
// (with all the new family / presentation / raw_category fields required)
// was correlating with very slow runs and occasionally empty responses
// against Gemini 2.5 Pro on large PDFs — too many constraints to satisfy
// while reading the document. Best-effort schema + a robust validator is
// the right trade.
export const EXTRACTION_JSON_SCHEMA = {
  name: 'catalog_extraction',
  strict: false,
  schema: {
    type: 'object',
    required: ['products'],
    properties: {
      detected_currency: {
        type: ['string', 'null'],
        description: 'ISO 4217 currency code if you can determine it from the source, otherwise null.',
      },
      products: {
        type: 'array',
        items: {
          type: 'object',
          // Only the bare essentials are required. The model is told in the
          // prompt to also fill sku / family / presentation / raw_category,
          // but if it's unsure it can omit them and the server will fill
          // defaults.
          required: ['name', 'unit_price'],
          properties: {
            name:         { type: 'string', description: 'Cleaned product name (compound + dose), e.g. "BPC-157 5mg"' },
            sku:          { type: ['string', 'null'], description: 'Short product code following the SKU convention in the prompt (compound shorthand + dose, e.g. RETA-10, BPC157-5)' },
            raw_name:     { type: 'string', description: 'Verbatim string from the source' },
            raw_category: { type: ['string', 'null'], description: 'Verbatim category heading from the source, e.g. "RECOVERY & HEALING"' },
            family:       { type: ['string', 'null'], description: 'The CANONICAL family slug (see prompt) for this product, or null if uncertain' },
            presentation: { type: ['string', 'null'], description: 'Form factor — one of: vial, pen, capsule, spray, oral, other — or null if unclear' },
            unit_price:   { type: 'number', description: 'Numeric price as printed; ignore currency symbols' },
            confidence:   { type: 'number', minimum: 0, maximum: 1, description: 'Your confidence that this row is a real product entry, not a header or footnote' },
          },
        },
      },
      tenant_notes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Catalogue-wide notes the supplier wants known (e.g. "All purchases include syringes")',
      },
    },
  },
} as const

function familyGuide(bt: PromptContext['businessType']): string {
  if (!bt) return ''
  const families = CANONICAL_FAMILIES[bt]
  const examples: Record<string, string> = {
    'GLP-1':    'Semaglutide, Tirzepatide, Retatrutide, Cagrilintide — metabolic / weight-loss',
    HEALING:    'BPC-157, TB-500, Thymosin Alpha-1/Beta-4, KPV, LL-37 — recovery / repair',
    GH:         'CJC-1295, Ipamorelin, Tesamorelin, Hexarelin, IGF-1 LR3 — growth hormone axis',
    COSMETIC:   'GHK-Cu, Melanotan II, PT-141, Kisspeptin — skin / aesthetic / libido',
    MITO:       'MOTS-c, SS-31, 5-Amino-1MQ, NAD+ — mitochondrial / cellular energy',
    NEURO:      'Semax, Selank, DSIP, Cerebrolysin, Dihexa — cognition / brain',
    OTHER:      'Anything that doesn\'t fit the above',
  }
  return [
    '',
    'CANONICAL FAMILY SET — assign each product to EXACTLY ONE of these slugs (or null if you\'re unsure):',
    ...families.map(f => `  - ${f}${examples[f] ? `   (${examples[f]})` : ''}`),
    'Mapping rules:',
    '- Read the source\'s category header (e.g. "FAT LOSS & MUSCLE GAIN (NATURAL GH BOOSTER)") AND the product name; pick the canonical family that best fits the COMPOUND, not just the header.',
    '- A header like "FAT LOSS & WEIGHT LOSS" contains both GLP-1 drugs (Tirzepatide, Retatrutide) AND mitochondrial agents (5-Amino-1MQ, MOTS-c) — classify by the compound itself.',
    '- Keep the verbatim header in raw_category. Put the canonical slug in family.',
  ].join('\n')
}

function skuGuide(): string {
  return [
    '',
    'SKU — short product identifier you propose for each row:',
    '  Format: <COMPOUND_CODE>-<DOSE> in uppercase, alphanumeric + hyphens only, max 16 chars.',
    '  Examples:',
    '    Retatrutide 10mg                            → RETA-10',
    '    Tirzepatide 30mg                            → TIRZ-30',
    '    Semaglutide 10mg                            → SEMA-10',
    '    Ipamorelin 5mg                              → IPAM-5',
    '    BPC-157 5mg                                 → BPC157-5    (drop internal hyphens in the compound code)',
    '    TB-500 5mg                                  → TB500-5',
    '    TB-500 10mg                                 → TB500-10    (different dose → different SKU)',
    '    GHK-Cu 50mg                                 → GHKCU-50',
    '    5-Amino-1MQ 50mg                            → AMNO1MQ-50  (pick a recognisable shorthand if the name is long)',
    '    CJC-1295+Ipamorelin Blend 5mg+5mg          → CJC1295-5    (use the first compound for blends)',
    '    Glow Stack (BPC/TB/GHK-Cu) 10mg/10mg/50mg   → GLOW-STACK',
    '  Rules:',
    '    - ALWAYS include the dose number, even when the compound name already contains digits — otherwise different doses of the same compound would collide.',
    '    - 3–6 char compound code: take a recognisable shorthand of the compound name, drop internal hyphens.',
    '    - Uppercase, alphanumeric and hyphens only.',
    '    - When uncertain, output null and the server will derive one.',
  ].join('\n')
}

function presentationGuide(): string {
  return [
    '',
    'PRESENTATION — pick the physical form from this set (or null if not stated):',
    `  ${PRESENTATION_OPTIONS.join(', ')}`,
    'Rules:',
    '- Look for clues in the source: "Pen", "Vial", "Capsule", "Spray", "sublingual", "x 60caps" → capsule.',
    '- For peptide rows with no explicit form factor, default to "vial" — peptides ship in vials by default.',
    '- "Pen/vial" written together means a pen device that contains a vial — use "pen".',
  ].join('\n')
}

export function buildExtractionPrompt(ctx: PromptContext): string {
  const domainHint = ctx.businessType === 'peptides'
    ? 'This is a peptide supplier. Product names will look like "BPC-157", "Semaglutide", "Tirzepatide" — dose strings are usually attached (5mg, 10mg).'
    : ctx.businessType
      ? `This is a ${ctx.businessType} supplier.`
      : 'The supplier category is not yet known.'

  return [
    'You extract a tenant\'s product catalogue from an uploaded price list (PDF, image, or text).',
    domainHint,
    `Their declared base currency is ${ctx.baseCurrency}; if the file is clearly in a different currency, set detected_currency accordingly, otherwise prefer ${ctx.baseCurrency}.`,
    '',
    'Rules:',
    '- Output ONLY the structured JSON described by the response schema. No prose.',
    '- One row per distinct product offering. Combine multi-line entries that belong to the same item.',
    '- Keep the verbatim source string in raw_name. Put a cleaned, commit-ready version (with dose) in name.',
    '- For unit_price, strip currency symbols and thousand separators. "1.700.000" in an IDR list means 1700000; "1,200.00" in a USD list means 1200.',
    '- Skip rows that are clearly not products: footnotes, disclaimers, contact info, advertisements. Lift those into tenant_notes instead.',
    '- Use confidence to flag rows you are unsure about (e.g. handwritten, low-resolution, ambiguous price).',
    familyGuide(ctx.businessType),
    presentationGuide(),
    skuGuide(),
  ].join('\n')
}
