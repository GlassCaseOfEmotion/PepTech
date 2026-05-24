export interface PromptContext {
  businessType: 'peptides' | 'nootropics' | 'sarms' | 'general' | null
  baseCurrency: string
}

export const EXTRACTION_JSON_SCHEMA = {
  name: 'catalog_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['detected_currency', 'products', 'tenant_notes'],
    properties: {
      detected_currency: {
        type: ['string', 'null'],
        description: 'ISO 4217 currency code if you can determine it from the source, otherwise null.',
      },
      products: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'raw_name', 'category', 'unit_price', 'confidence'],
          properties: {
            name:        { type: 'string', description: 'Cleaned product name including dose/presentation, e.g. "BPC-157 5mg"' },
            raw_name:    { type: 'string', description: 'Verbatim string from the source' },
            category:    { type: ['string', 'null'], description: 'Category/family heading from the source, e.g. "RECOVERY & HEALING"' },
            unit_price:  { type: 'number', description: 'Numeric price as printed; ignore currency symbols' },
            confidence:  { type: 'number', minimum: 0, maximum: 1, description: 'Your confidence that this row is a real product entry, not a header or footnote' },
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
    '- Keep the verbatim source string in raw_name. Put a cleaned, commit-ready version (with dose/presentation) in name.',
    '- Map category headers (e.g. "RECOVERY & HEALING") onto each product underneath that header. Use null when there is no obvious category.',
    '- For unit_price, strip currency symbols and thousand separators. "1.700.000" in an IDR list means 1700000; "1,200.00" in a USD list means 1200.',
    '- Skip rows that are clearly not products: footnotes, disclaimers, contact info, advertisements. Lift those into tenant_notes instead.',
    '- Use confidence to flag rows you are unsure about (e.g. handwritten, low-resolution, ambiguous price).',
  ].join('\n')
}
