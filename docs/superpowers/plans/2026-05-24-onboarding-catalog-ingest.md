# Onboarding Catalog Ingest (V0.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a brand-new tenant drop a price list (PDF, image, or pasted text) into the onboarding agent and have it extract products, present an editable proposal, and commit them to their catalog — replacing the V0.1 `seed_catalog_preset` placeholder.

**Architecture:** Extraction is a dedicated server-side step (Gemini 2.5 Pro structured output) wrapped as an agent tool (`extract_catalog`). The chat agent (Gemini Flash, default) narrates the conversation, calls the tool with a file reference, and renders the result as an inline editable table in the chat. User clicks **Import** → a server action writes `products` + starter `batches` + provenance metadata to `products.resources`. Uploads go to a new tenant-scoped Supabase Storage bucket `onboarding-uploads`. The reference-table-driven alias matching and web-search fallback are deferred to V0.3 — V0.2 ships raw extraction only.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase (Postgres + Storage + RLS) · OpenRouter (Gemini 2.5 Pro for extraction, Gemini Flash 2.5 for chat) · Vitest + React Testing Library · existing `pt-*` design system.

---

## File Structure

| File | Role |
|---|---|
| `supabase/migrations/20260524000005_onboarding_uploads_bucket.sql` | New Storage bucket with tenant-scoped RLS, 10 MB cap, allows pdf/png/jpg/webp |
| `src/lib/catalog/extraction/types.ts` | `ExtractedProduct`, `ExtractionResult`, `Provenance`, `CommitInput` |
| `src/lib/catalog/extraction/prompt.ts` | Pure function: builds the structured-output prompt + JSON schema for Gemini |
| `src/lib/catalog/extraction/validate.ts` | Normalises raw model JSON into `ExtractionResult` (SKU generation, dose parsing, dedup) |
| `src/lib/catalog/extraction/extract.ts` | Calls OpenRouter Gemini 2.5 Pro multimodal with the prompt; returns validated `ExtractionResult` |
| `src/lib/catalog/extraction/commit.ts` | Server-side commit: writes products + batches + provenance JSON |
| `src/lib/catalog/extraction/__tests__/validate.test.ts` | Vitest unit tests for the normaliser |
| `src/lib/catalog/extraction/__tests__/commit.test.ts` | Vitest unit tests for the commit action (mocked supabase) |
| `src/app/api/onboarding/upload/route.ts` | Multipart endpoint; uploads to `onboarding-uploads/<tenant_id>/<uuid>.ext`; returns `{ file_ref, filename, mime_type }` |
| `src/app/onboarding/actions.ts` | Add `commitExtractedCatalog(rows, sourceFileRef)` server action |
| `src/lib/agent/tools/onboarding.ts` | Real `extract_catalog` implementation; remove stub |
| `src/lib/agent/types.ts` | Add `Attachment` shape; allow on chat request |
| `src/lib/agent/executor.ts` | Format incoming user message with attachment hint so the agent knows a file is present |
| `src/app/api/agent/chat/route.ts` | Accept `attachments` in body, pass through to executor |
| `src/components/onboarding/CatalogProposalCard.tsx` | Editable inline table rendered as the `extract_catalog` tool output |
| `src/app/onboarding/OnboardingAgent.tsx` | Composer paperclip + drag-drop + paste; render proposal card; wire Import button to server action |

Migration to fix the V0.1 heuristic gaps and restore protocol seeding lives in:

| File | Role |
|---|---|
| `src/lib/agent/tools/onboarding.ts` | Fix `read_onboarding_state.steps` flags (currency/timezone heuristic); restore protocol seeding in `seed_catalog_preset` |

---

## Task 0: Pre-flight — verify dev tooling

- [ ] **Step 1: Verify Vitest works**

Run: `npm run test:run -- src/lib/__tests__/currency.test.ts`
Expected: tests pass, exit 0.

- [ ] **Step 2: Verify typecheck baseline is clean**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Verify Supabase CLI is wired**

Run: `npx supabase --version`
Expected: prints a version number (do not run db push yet).

---

## Task 1: Storage bucket migration

**Files:**
- Create: `supabase/migrations/20260524000005_onboarding_uploads_bucket.sql`

- [ ] **Step 1: Write the migration**

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-uploads',
  'onboarding-uploads',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tenant_onboarding_uploads_access" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'onboarding-uploads'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  )
  WITH CHECK (
    bucket_id = 'onboarding-uploads'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );
```

- [ ] **Step 2: Push the migration**

Run: `npx supabase db push --include-all`
Expected: applies `20260524000005_onboarding_uploads_bucket.sql` without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260524000005_onboarding_uploads_bucket.sql
git commit -m "feat(storage): add onboarding-uploads bucket with tenant RLS"
```

---

## Task 2: Extraction types

**Files:**
- Create: `src/lib/catalog/extraction/types.ts`

- [ ] **Step 1: Create the types module**

```ts
// src/lib/catalog/extraction/types.ts

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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/catalog/extraction/types.ts
git commit -m "feat(catalog): extraction types"
```

---

## Task 3: Prompt builder (pure, snapshot-tested)

**Files:**
- Create: `src/lib/catalog/extraction/prompt.ts`
- Test: `src/lib/catalog/extraction/__tests__/prompt.test.ts`

- [ ] **Step 1: Write the failing snapshot test**

```ts
// src/lib/catalog/extraction/__tests__/prompt.test.ts
import { describe, it, expect } from 'vitest'
import { buildExtractionPrompt, EXTRACTION_JSON_SCHEMA } from '../prompt'

describe('buildExtractionPrompt', () => {
  it('produces a deterministic prompt referencing tenant context', () => {
    const out = buildExtractionPrompt({ businessType: 'peptides', baseCurrency: 'IDR' })
    expect(out).toContain('peptide')
    expect(out).toContain('IDR')
    expect(out).toMatchSnapshot()
  })

  it('exposes a JSON schema with the expected top-level fields', () => {
    expect(EXTRACTION_JSON_SCHEMA.name).toBe('catalog_extraction')
    const schema = EXTRACTION_JSON_SCHEMA.schema as Record<string, unknown>
    const props = (schema.properties as Record<string, unknown>) ?? {}
    expect(Object.keys(props).sort()).toEqual(['detected_currency', 'products', 'tenant_notes'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/catalog/extraction/__tests__/prompt.test.ts`
Expected: FAIL — `prompt.ts` does not exist.

- [ ] **Step 3: Implement the prompt builder**

```ts
// src/lib/catalog/extraction/prompt.ts

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/catalog/extraction/__tests__/prompt.test.ts`
Expected: PASS (snapshot will be created on first run).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/extraction/prompt.ts src/lib/catalog/extraction/__tests__/prompt.test.ts
git commit -m "feat(catalog): extraction prompt builder + JSON schema"
```

---

## Task 4: Validator/normaliser (TDD)

**Files:**
- Create: `src/lib/catalog/extraction/validate.ts`
- Test: `src/lib/catalog/extraction/__tests__/validate.test.ts`

- [ ] **Step 1: Write failing tests covering happy + edge cases**

```ts
// src/lib/catalog/extraction/__tests__/validate.test.ts
import { describe, it, expect } from 'vitest'
import { validateAndNormalise, generateSku } from '../validate'

describe('generateSku', () => {
  it('slugifies a product name', () => {
    expect(generateSku('BPC-157 5mg', new Set())).toBe('bpc-157-5mg')
  })
  it('dedupes against an existing set with -2, -3 suffixes', () => {
    const taken = new Set(['bpc-157-5mg'])
    expect(generateSku('BPC-157 5mg', taken)).toBe('bpc-157-5mg-2')
    taken.add('bpc-157-5mg-2')
    expect(generateSku('BPC-157 5mg', taken)).toBe('bpc-157-5mg-3')
  })
  it('handles characters outside [a-z0-9-]', () => {
    expect(generateSku('5-Amino-1MQ Capsule 50mg × 60caps', new Set())).toBe('5-amino-1mq-capsule-50mg-60caps')
  })
})

describe('validateAndNormalise', () => {
  const baseCtx = {
    source_file_ref: 'abc123',
    source_filename: 'list.pdf',
    model: 'google/gemini-2.5-pro',
  }

  it('passes through a clean response', () => {
    const out = validateAndNormalise({
      detected_currency: 'IDR',
      products: [
        { name: 'BPC-157 5mg', raw_name: 'BPC-157 5mg', category: 'RECOVERY', unit_price: 900000, confidence: 0.97 },
      ],
      tenant_notes: [],
    }, baseCtx)
    expect(out.products).toHaveLength(1)
    expect(out.products[0].name).toBe('BPC-157 5mg')
    expect(out.detected_currency).toBe('IDR')
    expect(out.source_file_ref).toBe('abc123')
  })

  it('drops rows with non-positive prices', () => {
    const out = validateAndNormalise({
      detected_currency: null,
      products: [
        { name: 'A', raw_name: 'A', category: null, unit_price: 0, confidence: 0.9 },
        { name: 'B', raw_name: 'B', category: null, unit_price: -10, confidence: 0.9 },
        { name: 'C', raw_name: 'C', category: null, unit_price: 5, confidence: 0.9 },
      ],
      tenant_notes: [],
    }, baseCtx)
    expect(out.products.map(p => p.name)).toEqual(['C'])
  })

  it('clamps confidence to [0,1] and trims long names', () => {
    const longName = 'X'.repeat(300)
    const out = validateAndNormalise({
      detected_currency: null,
      products: [
        { name: longName, raw_name: 'orig', category: null, unit_price: 1, confidence: 1.5 },
      ],
      tenant_notes: [],
    }, baseCtx)
    expect(out.products[0].confidence).toBe(1)
    expect(out.products[0].name.length).toBeLessThanOrEqual(200)
  })

  it('defaults missing tenant_notes to []', () => {
    const out = validateAndNormalise(
      { detected_currency: null, products: [] } as unknown as Parameters<typeof validateAndNormalise>[0],
      baseCtx,
    )
    expect(out.tenant_notes).toEqual([])
  })

  it('throws if products is not an array', () => {
    expect(() =>
      validateAndNormalise(
        { detected_currency: null, products: 'oops', tenant_notes: [] } as unknown as Parameters<typeof validateAndNormalise>[0],
        baseCtx,
      ),
    ).toThrow(/products/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/catalog/extraction/__tests__/validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the validator**

```ts
// src/lib/catalog/extraction/validate.ts
import type { ExtractedProduct, ExtractionResult } from './types'

interface RawProduct {
  name: unknown
  raw_name: unknown
  category: unknown
  unit_price: unknown
  confidence: unknown
}

interface RawResult {
  detected_currency: unknown
  products: unknown
  tenant_notes: unknown
}

interface NormaliseCtx {
  source_file_ref: string
  source_filename: string
  model: string
}

const MAX_NAME = 200

function clean(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim().slice(0, MAX_NAME) : fallback
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function clamp01(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

export function generateSku(name: string, taken: Set<string>): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'product'
  if (!taken.has(base)) { taken.add(base); return base }
  let i = 2
  while (taken.has(`${base}-${i}`)) i++
  const sku = `${base}-${i}`
  taken.add(sku)
  return sku
}

export function validateAndNormalise(raw: RawResult, ctx: NormaliseCtx): ExtractionResult {
  if (!Array.isArray(raw.products)) {
    throw new Error('Extraction response: products is not an array')
  }
  const products: ExtractedProduct[] = []
  for (const r of raw.products as RawProduct[]) {
    const price = num(r.unit_price)
    if (price === null || price <= 0) continue
    const name = clean(r.name)
    if (!name) continue
    products.push({
      name,
      raw_name: clean(r.raw_name, name),
      category:  typeof r.category === 'string' && r.category.trim() ? r.category.trim().slice(0, 100) : null,
      unit_price: price,
      confidence: clamp01(r.confidence),
    })
  }
  const tenant_notes = Array.isArray(raw.tenant_notes)
    ? (raw.tenant_notes as unknown[]).filter((x): x is string => typeof x === 'string').map(s => s.trim()).filter(Boolean)
    : []
  return {
    detected_currency: typeof raw.detected_currency === 'string' ? raw.detected_currency.toUpperCase().slice(0, 6) : null,
    products,
    tenant_notes,
    source_file_ref: ctx.source_file_ref,
    source_filename: ctx.source_filename,
    model: ctx.model,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/lib/catalog/extraction/__tests__/validate.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/extraction/validate.ts src/lib/catalog/extraction/__tests__/validate.test.ts
git commit -m "feat(catalog): extraction validator with SKU generation and bad-row filtering"
```

---

## Task 5: Extraction runner (no unit test; integration tested manually)

**Files:**
- Create: `src/lib/catalog/extraction/extract.ts`

- [ ] **Step 1: Write the runner**

```ts
// src/lib/catalog/extraction/extract.ts
import OpenAI from 'openai'
import { buildExtractionPrompt, EXTRACTION_JSON_SCHEMA, type PromptContext } from './prompt'
import { validateAndNormalise } from './validate'
import type { ExtractionResult } from './types'

const EXTRACTION_MODEL = process.env.OPENROUTER_EXTRACTION_MODEL ?? 'google/gemini-2.5-pro'

interface ExtractParams extends PromptContext {
  /** Public-friendly content part already prepared by the caller — either a data URL or an HTTPS signed URL. */
  fileUrl: string
  mimeType: string
  source_file_ref: string
  source_filename: string
}

function client(): OpenAI {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY!,
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://peptech.vercel.app',
      'X-Title': 'Peptech (extraction)',
    },
  })
}

export async function extractCatalog(params: ExtractParams): Promise<ExtractionResult> {
  const prompt = buildExtractionPrompt({ businessType: params.businessType, baseCurrency: params.baseCurrency })

  // For PDFs we use OpenRouter's `file` content part; for images, `image_url`.
  const isPdf = params.mimeType === 'application/pdf'
  const fileContent = isPdf
    ? { type: 'file' as const, file: { filename: params.source_filename, file_data: params.fileUrl } }
    : { type: 'image_url' as const, image_url: { url: params.fileUrl } }

  const completion = await client().chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [
      { role: 'system', content: prompt },
      {
        role: 'user',
        // OpenAI SDK types do not cover OpenRouter's `file` content part; cast through unknown.
        content: [
          { type: 'text', text: 'Extract the catalogue from the attached file.' },
          fileContent,
        ] as unknown as string,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: EXTRACTION_JSON_SCHEMA,
    } as unknown as { type: 'json_schema'; json_schema: typeof EXTRACTION_JSON_SCHEMA },
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw || typeof raw !== 'string') throw new Error('Extraction returned no content')
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('Extraction returned non-JSON content') }

  return validateAndNormalise(parsed as Parameters<typeof validateAndNormalise>[0], {
    source_file_ref: params.source_file_ref,
    source_filename: params.source_filename,
    model: EXTRACTION_MODEL,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/catalog/extraction/extract.ts
git commit -m "feat(catalog): OpenRouter Gemini 2.5 Pro extraction runner"
```

---

## Task 6: Commit action (TDD with mocked supabase)

**Files:**
- Create: `src/lib/catalog/extraction/commit.ts`
- Test: `src/lib/catalog/extraction/__tests__/commit.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/catalog/extraction/__tests__/commit.test.ts
import { describe, it, expect, vi } from 'vitest'
import { commitExtractedCatalog } from '../commit'
import type { CommitInput } from '../types'

function mockSupabase(opts: { existingSkus?: string[]; productsInsertResult?: { id: string; sku: string }[] } = {}) {
  const inserts: { table: string; rows: unknown[] }[] = []
  const supabase = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            // existing skus lookup
            // returns array of { sku }
            then: undefined,
            data: (opts.existingSkus ?? []).map(s => ({ sku: s })),
            error: null,
          }),
        }),
        insert: (rows: unknown[]) => ({
          select: () => ({
            data: opts.productsInsertResult ?? (rows as { sku: string }[]).map((r, i) => ({ id: `id-${i}`, sku: r.sku })),
            error: null,
          }),
          // for batches insert (no .select())
          data: null,
          error: null,
          then: (resolve: (v: { data: null; error: null }) => void) => resolve({ data: null, error: null }),
        }),
      }
    },
  }
  // Hijack the select-eq chain: tests below use a helper to drive it differently
  return { supabase, inserts }
}

describe('commitExtractedCatalog', () => {
  it('inserts products with provenance and seed batches', async () => {
    const captured: { table: string; rows: unknown[] }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          select() {
            return {
              eq: () => Promise.resolve({ data: [], error: null }),
            }
          },
          insert(rows: unknown[]) {
            captured.push({ table, rows })
            const out = table === 'products'
              ? (rows as { sku: string }[]).map((r, i) => ({ id: `pid-${i}`, sku: r.sku }))
              : null
            return {
              select: () => Promise.resolve({ data: out, error: null }),
              then: (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null }),
            }
          },
        }
      },
    } as unknown as Parameters<typeof commitExtractedCatalog>[0]['supabase']

    const input: CommitInput = {
      rows: [
        { name: 'BPC-157 5mg', raw_name: 'BPC-157 5mg', category: 'RECOVERY', unit_price: 900000, confidence: 0.97, user_edited: false },
      ],
      source_file_ref: 'abc',
      source_filename: 'list.pdf',
      model: 'google/gemini-2.5-pro',
    }

    const result = await commitExtractedCatalog({ supabase: fakeSupabase, tenantId: 'tenant-1', input })
    expect(result.count).toBe(1)

    const productsCall = captured.find(c => c.table === 'products')!
    expect((productsCall.rows[0] as { sku: string }).sku).toBe('bpc-157-5mg')
    expect((productsCall.rows[0] as { tenant_id: string }).tenant_id).toBe('tenant-1')
    expect((productsCall.rows[0] as { product_family: string }).product_family).toBe('RECOVERY')
    const prov = (productsCall.rows[0] as { resources: { provenance: { source: string; user_edited: boolean } } }).resources.provenance
    expect(prov.source).toBe('extraction')
    expect(prov.user_edited).toBe(false)

    const batchesCall = captured.find(c => c.table === 'batches')!
    expect(batchesCall.rows).toHaveLength(1)
    expect((batchesCall.rows[0] as { product_id: string }).product_id).toBe('pid-0')
  })

  it('falls back to "UNCATEGORISED" when category is null', async () => {
    const captured: { table: string; rows: unknown[] }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          select() { return { eq: () => Promise.resolve({ data: [], error: null }) } },
          insert(rows: unknown[]) {
            captured.push({ table, rows })
            return {
              select: () => Promise.resolve({ data: table === 'products' ? [{ id: 'pid-0', sku: 'x' }] : null, error: null }),
              then: (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null }),
            }
          },
        }
      },
    } as unknown as Parameters<typeof commitExtractedCatalog>[0]['supabase']

    await commitExtractedCatalog({
      supabase: fakeSupabase,
      tenantId: 't',
      input: {
        rows: [{ name: 'X', raw_name: 'X', category: null, unit_price: 1, confidence: 1, user_edited: true }],
        source_file_ref: 'f', source_filename: 'f.pdf', model: 'm',
      },
    })

    const productsCall = captured.find(c => c.table === 'products')!
    expect((productsCall.rows[0] as { product_family: string }).product_family).toBe('UNCATEGORISED')
  })

  it('dedupes SKUs against existing tenant skus', async () => {
    const captured: { table: string; rows: unknown[] }[] = []
    const fakeSupabase = {
      from(table: string) {
        return {
          select() {
            return {
              eq: () => Promise.resolve({ data: [{ sku: 'bpc-157-5mg' }], error: null }),
            }
          },
          insert(rows: unknown[]) {
            captured.push({ table, rows })
            return {
              select: () => Promise.resolve({ data: table === 'products' ? [{ id: 'pid-0', sku: 'bpc-157-5mg-2' }] : null, error: null }),
              then: (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null }),
            }
          },
        }
      },
    } as unknown as Parameters<typeof commitExtractedCatalog>[0]['supabase']

    await commitExtractedCatalog({
      supabase: fakeSupabase,
      tenantId: 't',
      input: {
        rows: [{ name: 'BPC-157 5mg', raw_name: 'x', category: null, unit_price: 1, confidence: 1, user_edited: false }],
        source_file_ref: 'f', source_filename: 'f.pdf', model: 'm',
      },
    })

    const productsCall = captured.find(c => c.table === 'products')!
    expect((productsCall.rows[0] as { sku: string }).sku).toBe('bpc-157-5mg-2')
  })

  it('throws if rows is empty', async () => {
    const fakeSupabase = {} as Parameters<typeof commitExtractedCatalog>[0]['supabase']
    await expect(commitExtractedCatalog({
      supabase: fakeSupabase,
      tenantId: 't',
      input: { rows: [], source_file_ref: 'f', source_filename: 'f.pdf', model: 'm' },
    })).rejects.toThrow(/no rows/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/catalog/extraction/__tests__/commit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the commit action**

```ts
// src/lib/catalog/extraction/commit.ts
import type { AgentSupabase } from '@/lib/agent/types'
import type { CommitInput, Provenance } from './types'
import { generateSku } from './validate'

interface CommitParams {
  supabase: AgentSupabase
  tenantId: string
  input: CommitInput
}

export async function commitExtractedCatalog(params: CommitParams): Promise<{ count: number; productIds: string[] }> {
  const { supabase, tenantId, input } = params
  if (input.rows.length === 0) throw new Error('Commit failed: no rows to insert')

  // Load existing tenant SKUs so generated SKUs do not collide.
  const { data: existing, error: existErr } = await supabase
    .from('products').select('sku').eq('tenant_id', tenantId) as unknown as { data: { sku: string }[] | null; error: { message: string } | null }
  if (existErr) throw new Error(existErr.message)
  const taken = new Set((existing ?? []).map(r => r.sku))

  const extractedAt = new Date().toISOString()
  const rows = input.rows.map(r => {
    const provenance: Provenance = {
      source: 'extraction',
      model: input.model,
      extracted_at: extractedAt,
      source_file_ref: input.source_file_ref,
      source_filename: input.source_filename,
      raw_name: r.raw_name,
      confidence: r.confidence,
      user_edited: r.user_edited,
    }
    return {
      tenant_id:      tenantId,
      name:           r.name,
      sku:            generateSku(r.name, taken),
      product_family: r.category ?? 'UNCATEGORISED',
      unit_price:     r.unit_price,
      description:    null,
      resources:      { provenance } as unknown as import('@/types/database').Json,
    }
  })

  const { data: inserted, error: insertErr } = await supabase
    .from('products').insert(rows).select('id, sku') as unknown as { data: { id: string; sku: string }[] | null; error: { message: string } | null }
  if (insertErr || !inserted) throw new Error(insertErr?.message ?? 'Failed to insert products')

  // Seed a starter batch (10 units, SEED-001) for every product. Non-fatal if it fails.
  const batchRows = inserted.map(p => ({
    tenant_id:    tenantId,
    product_id:   p.id,
    batch_number: 'SEED-001',
    stock:        10,
  }))
  if (batchRows.length > 0) {
    await supabase.from('batches').insert(batchRows).then(() => {})
  }

  return { count: inserted.length, productIds: inserted.map(p => p.id) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/lib/catalog/extraction/__tests__/commit.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/extraction/commit.ts src/lib/catalog/extraction/__tests__/commit.test.ts
git commit -m "feat(catalog): server-side commit with provenance + tenant SKU dedup"
```

---

## Task 7: Upload API route

**Files:**
- Create: `src/app/api/onboarding/upload/route.ts`

- [ ] **Step 1: Write the upload route**

```ts
// src/app/api/onboarding/upload/route.ts
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient, getServerUser } from '@/lib/supabase/server'

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = userRow.tenant_id

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: `Unsupported type: ${file.type}` }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })

  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin'
  const objectName = `${tenantId}/${randomUUID()}.${ext}`

  const { error: upErr } = await supabase.storage.from('onboarding-uploads').upload(objectName, file, {
    contentType: file.type, upsert: false,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({
    file_ref:   objectName,
    filename:   file.name,
    mime_type:  file.type,
    size:       file.size,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/onboarding/upload/route.ts
git commit -m "feat(onboarding): upload endpoint for catalog source files"
```

---

## Task 8: Wire `extract_catalog` to the real runner

**Files:**
- Modify: `src/lib/agent/tools/onboarding.ts`

- [ ] **Step 1: Replace the stub `extractCatalog` tool**

Find the existing `extractCatalog` export and replace its body. New implementation:

```ts
// src/lib/agent/tools/onboarding.ts (replace the existing extractCatalog export)
import { extractCatalog as runExtraction } from '@/lib/catalog/extraction/extract'

export const extractCatalog: AgentTool = {
  name: 'extract_catalog',
  description: 'Extract products from a price list the user has uploaded. Pass the file_ref returned by the upload step. The result is rendered as an editable proposal card the user can review before importing — do NOT verbalise the full list back to the user; the UI shows it.',
  requiresConfirmation: false,
  inputSchema: {
    type: 'object',
    required: ['file_ref'],
    properties: {
      file_ref: { type: 'string', description: 'Storage object name returned by the upload endpoint, e.g. "<tenant_id>/<uuid>.pdf"' },
    },
  },
  async execute(raw, supabase, tenantId) {
    const input = raw as { file_ref: string }

    // Find the most recent attachment metadata stored on the latest user message in this session
    // so we know the filename + mime type. The file_ref alone is enough to fetch, but the
    // model and provenance want the original filename.
    const { data: msgs } = await supabase
      .from('agent_messages')
      .select('content')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20)
    let filename = input.file_ref.split('/').pop() ?? 'upload'
    let mimeFromExt = 'application/octet-stream'
    const m = filename.match(/\.([a-z0-9]+)$/i)
    if (m) {
      const ext = m[1].toLowerCase()
      if (ext === 'pdf')                 mimeFromExt = 'application/pdf'
      else if (ext === 'png')            mimeFromExt = 'image/png'
      else if (ext === 'jpg' || ext === 'jpeg') mimeFromExt = 'image/jpeg'
      else if (ext === 'webp')           mimeFromExt = 'image/webp'
    }
    // Recover the original display filename if it was logged in the user message
    for (const row of msgs ?? []) {
      const txt = (row.content as string | null) ?? ''
      const match = txt.match(/\[uploaded: ([^\]]+) \(file_ref=([^)]+)\)\]/)
      if (match && match[2] === input.file_ref) { filename = match[1]; break }
    }

    // Read tenant context for the prompt
    const { data: tenant } = await supabase.from('tenants').select('business_type, base_currency').eq('id', tenantId).single()

    // Sign a short-lived URL for the file so the extraction call can fetch it
    const { data: signed, error: signErr } = await supabase.storage
      .from('onboarding-uploads').createSignedUrl(input.file_ref, 60 * 10)
    if (signErr || !signed?.signedUrl) throw new Error('Could not sign uploaded file URL')

    const result = await runExtraction({
      businessType:    (tenant?.business_type ?? null) as 'peptides' | 'nootropics' | 'sarms' | 'general' | null,
      baseCurrency:    tenant?.base_currency ?? 'USD',
      fileUrl:         signed.signedUrl,
      mimeType:        mimeFromExt,
      source_file_ref: input.file_ref,
      source_filename: filename,
    })
    return result
  },
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/tools/onboarding.ts
git commit -m "feat(catalog): wire extract_catalog agent tool to Gemini extraction runner"
```

---

## Task 9: Server action for client-driven commit

**Files:**
- Modify: `src/app/onboarding/actions.ts`

- [ ] **Step 1: Add the commit server action**

Append to `src/app/onboarding/actions.ts`:

```ts
import { commitExtractedCatalog } from '@/lib/catalog/extraction/commit'
import type { CommitInput } from '@/lib/catalog/extraction/types'

export async function commitExtractedCatalogAction(
  input: CommitInput,
): Promise<{ count?: number; error?: string }> {
  const c = await ctx()
  if (!c) return { error: 'Unauthorized' }
  if (!Array.isArray(input.rows) || input.rows.length === 0) return { error: 'No rows to import' }
  try {
    const out = await commitExtractedCatalog({ supabase: c.supabase, tenantId: c.tenantId, input })
    revalidatePath('/onboarding')
    return { count: out.count }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Commit failed' }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/actions.ts
git commit -m "feat(onboarding): server action for committing extracted catalog rows"
```

---

## Task 10: Attachments through the chat request and executor

**Files:**
- Modify: `src/lib/agent/types.ts`
- Modify: `src/app/api/agent/chat/route.ts`
- Modify: `src/lib/agent/executor.ts`

- [ ] **Step 1: Add Attachment type**

In `src/lib/agent/types.ts`, append:

```ts
export interface Attachment {
  file_ref:  string
  filename:  string
  mime_type: string
}
```

- [ ] **Step 2: Accept attachments in the chat API route**

In `src/app/api/agent/chat/route.ts`, replace the body parsing block and the executor invocation:

Find:
```ts
const { sessionId, message, mode } = await request.json() as {
  sessionId?: string; message?: string; mode?: 'ops' | 'onboarding'
}
```

Replace with:
```ts
const { sessionId, message, mode, attachments } = await request.json() as {
  sessionId?: string; message?: string; mode?: 'ops' | 'onboarding';
  attachments?: { file_ref: string; filename: string; mime_type: string }[]
}
```

Find the `executeAgentTurn` call and update it to pass `attachments`:
```ts
await executeAgentTurn(sid!, message, tenantId, supabase, controller, attachments ?? [])
```

- [ ] **Step 3: Format attachment hint in executor**

In `src/lib/agent/executor.ts`, update `executeAgentTurn` to accept an attachments parameter and prepend a one-line hint to the persisted user message so the agent (and a future replay) can see it.

Find the signature:
```ts
export async function executeAgentTurn(
  sessionId: string,
  userMessage: string,
  tenantId: string,
  supabase: AgentSupabase,
  controller: ReadableStreamDefaultController<Uint8Array>
)
```

Change to:
```ts
export async function executeAgentTurn(
  sessionId: string,
  userMessage: string,
  tenantId: string,
  supabase: AgentSupabase,
  controller: ReadableStreamDefaultController<Uint8Array>,
  attachments: { file_ref: string; filename: string; mime_type: string }[] = [],
)
```

Immediately after the function opens (before `saveUserMessage` is called), add:

```ts
let messageForAgent = userMessage
if (attachments.length > 0) {
  const lines = attachments.map(a => `[uploaded: ${a.filename} (file_ref=${a.file_ref})]`)
  messageForAgent = `${lines.join('\n')}\n${userMessage}`.trim()
}
```

Then replace the existing `await saveUserMessage(sessionId, tenantId, userMessage, supabase)` with:
```ts
await saveUserMessage(sessionId, tenantId, messageForAgent, supabase)
```

And replace the `history = [{ role: 'user', content: userMessage }]` fallback with `messageForAgent`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/types.ts src/app/api/agent/chat/route.ts src/lib/agent/executor.ts
git commit -m "feat(agent): pass attachment refs through chat API into the user turn"
```

---

## Task 11: Composer file input (paperclip + drag-drop + paste)

**Files:**
- Modify: `src/app/onboarding/OnboardingAgent.tsx`

- [ ] **Step 1: Add upload state and helper**

In `OnboardingAgent.tsx`, just after the existing state declarations, add:

```ts
const [stagedFile, setStagedFile] = useState<{
  file_ref: string; filename: string; mime_type: string
} | null>(null)
const [uploading, setUploading] = useState(false)
const fileInputRef = useRef<HTMLInputElement>(null)

const uploadFile = useCallback(async (file: File) => {
  setUploading(true)
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/onboarding/upload', { method: 'POST', body: form })
    if (!res.ok) {
      const { error } = await res.json() as { error?: string }
      throw new Error(error ?? 'Upload failed')
    }
    const data = await res.json() as { file_ref: string; filename: string; mime_type: string }
    setStagedFile(data)
  } catch (e) {
    setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${e instanceof Error ? e.message : 'Upload error'}` }])
  } finally {
    setUploading(false)
  }
}, [])
```

- [ ] **Step 2: Update the `send` callback to include the staged attachment**

In the `send` callback, replace the `fetch('/api/agent/chat', ...)` body construction:

Find:
```ts
body: JSON.stringify({ sessionId, message: text, mode: 'onboarding' }),
```

Replace with:
```ts
body: JSON.stringify({
  sessionId,
  message: text,
  mode: 'onboarding',
  attachments: stagedFile ? [stagedFile] : [],
}),
```

Immediately before the fetch, capture the staged file so we can clear it after the request resolves:
```ts
const sendingAttachment = stagedFile
```

And inside `onDone` (the existing handler), after `setStreaming(false)`, add:
```ts
if (sendingAttachment) setStagedFile(null)
```

Add `stagedFile` to the dependency array of the `send` useCallback at the bottom.

- [ ] **Step 3: Render paperclip + staged file chip + drag-drop in the composer**

Replace the existing input row JSX:

```jsx
<div className="pt-agent-chat-input-row" style={{ marginTop: 12 }}>
  <textarea ... />
  <button ... ><Icons.send size={13} /></button>
</div>
```

with:

```jsx
<div
  onDragOver={e => { e.preventDefault() }}
  onDrop={e => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) void uploadFile(file)
  }}
>
  {stagedFile && (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', marginBottom: 8,
      background: 'var(--pt-bg-2)', borderRadius: 999, fontSize: 12,
    }}>
      <span>📎 {stagedFile.filename}</span>
      <button
        onClick={() => setStagedFile(null)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6 }}
        aria-label="Remove attachment"
      >×</button>
    </div>
  )}
  <div className="pt-agent-chat-input-row" style={{ marginTop: 0 }}>
    <button
      type="button"
      className="pt-btn pt-btn-ghost"
      onClick={() => fileInputRef.current?.click()}
      disabled={uploading || streaming || confirming}
      title="Attach a price list"
      style={{ height: 36, width: 36, padding: 0 }}
    >
      <Icons.paperclip size={14} />
    </button>
    <input
      ref={fileInputRef}
      type="file"
      accept="application/pdf,image/png,image/jpeg,image/webp"
      hidden
      onChange={e => {
        const f = e.target.files?.[0]
        if (f) void uploadFile(f)
        e.target.value = ''
      }}
    />
    <textarea
      className="pt-agent-chat-textarea"
      placeholder={uploading ? 'Uploading…' : stagedFile ? 'Add a message (optional)…' : 'Type your reply…'}
      rows={1}
      value={input}
      onChange={e => setInput(e.target.value)}
      onPaste={e => {
        const file = e.clipboardData.files?.[0]
        if (file) { e.preventDefault(); void uploadFile(file) }
      }}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
      disabled={streaming || confirming}
    />
    <button
      className="pt-btn pt-btn-primary pt-agent-send-btn"
      onClick={() => void send()}
      disabled={(!input.trim() && !stagedFile) || streaming || confirming || uploading}
    >
      <Icons.send size={13} />
    </button>
  </div>
</div>
```

- [ ] **Step 4: Verify the `paperclip` icon exists in the Icons set**

Run: `grep -n "paperclip" src/lib/icons.tsx`
Expected: at least one match. If none, open `src/lib/icons.tsx` and add a `paperclip` icon following the existing pattern (any clip-shaped SVG). Then re-run the grep.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/onboarding/OnboardingAgent.tsx src/lib/icons.tsx
git commit -m "feat(onboarding-agent): file upload via paperclip, drag-drop, and paste"
```

---

## Task 12: CatalogProposalCard — editable inline table

**Files:**
- Create: `src/components/onboarding/CatalogProposalCard.tsx`

- [ ] **Step 1: Build the component**

```tsx
// src/components/onboarding/CatalogProposalCard.tsx
'use client'

import { useMemo, useState } from 'react'
import type { ExtractedProduct, ExtractionResult } from '@/lib/catalog/extraction/types'

interface EditableRow extends ExtractedProduct {
  user_edited: boolean
  removed: boolean
}

export function CatalogProposalCard({
  initial,
  onImport,
  onCancel,
  status,
}: {
  initial: ExtractionResult
  onImport: (rows: Array<ExtractedProduct & { user_edited: boolean }>) => void
  onCancel: () => void
  status: 'idle' | 'importing' | 'done' | 'cancelled'
}) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    initial.products.map(p => ({ ...p, user_edited: false, removed: false }))
  )

  const grouped = useMemo(() => {
    const m = new Map<string, EditableRow[]>()
    for (const r of rows) {
      if (r.removed) continue
      const key = r.category ?? 'Uncategorised'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(r)
    }
    return [...m.entries()]
  }, [rows])

  const visibleCount = rows.filter(r => !r.removed).length

  function updateRow(index: number, patch: Partial<EditableRow>) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch, user_edited: true } : r))
  }
  function removeRow(index: number) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, removed: true } : r))
  }

  function commit() {
    const payload = rows
      .filter(r => !r.removed)
      .map(({ removed, user_edited, ...rest }) => ({ ...rest, user_edited }))
    void removed
    onImport(payload)
  }

  if (status === 'done') {
    return (
      <div className="pt-proposal pt-proposal-done">
        ✓ Imported {visibleCount} product{visibleCount === 1 ? '' : 's'}.
      </div>
    )
  }
  if (status === 'cancelled') {
    return <div className="pt-proposal pt-proposal-cancelled">Import cancelled.</div>
  }

  return (
    <div className="pt-proposal">
      <div className="pt-proposal-hd">
        <strong>{visibleCount} products extracted</strong>
        {initial.detected_currency && <span className="pt-proposal-cur">· {initial.detected_currency}</span>}
        <span className="pt-proposal-hint">Click any cell to edit. Remove rows you don&apos;t want.</span>
      </div>

      {grouped.map(([category, items]) => (
        <div key={category} className="pt-proposal-group">
          <div className="pt-proposal-group-hd">{category}</div>
          <table className="pt-proposal-table">
            <thead>
              <tr><th>Name</th><th style={{ width: 120 }}>Price</th><th style={{ width: 56 }}></th></tr>
            </thead>
            <tbody>
              {items.map(r => {
                const idx = rows.indexOf(r)
                return (
                  <tr key={idx}>
                    <td>
                      <input
                        className="pt-proposal-cell"
                        value={r.name}
                        onChange={e => updateRow(idx, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="pt-proposal-cell"
                        type="number"
                        value={r.unit_price}
                        onChange={e => updateRow(idx, { unit_price: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <button
                        className="pt-proposal-rm"
                        onClick={() => removeRow(idx)}
                        aria-label="Remove row"
                      >×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {initial.tenant_notes.length > 0 && (
        <div className="pt-proposal-notes">
          <strong>Notes from the supplier:</strong>
          <ul>{initial.tenant_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}

      <div className="pt-proposal-foot">
        <button className="pt-btn pt-btn-ghost"   onClick={onCancel} disabled={status === 'importing'}>Cancel</button>
        <button
          className="pt-btn pt-btn-primary"
          onClick={commit}
          disabled={visibleCount === 0 || status === 'importing'}
        >
          {status === 'importing' ? 'Importing…' : `Looks good — import ${visibleCount} →`}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add minimal styles**

Open `src/app/globals.css` (or wherever component-level styles live — search for `pt-agent-confirm` to find the right place). Append:

```css
.pt-proposal {
  margin-top: 8px;
  padding: 12px;
  border: 1px solid var(--pt-border, rgba(255,255,255,0.08));
  border-radius: 10px;
  background: var(--pt-bg-2, rgba(255,255,255,0.02));
  font-size: 13px;
}
.pt-proposal-hd { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; margin-bottom: 10px; }
.pt-proposal-cur { opacity: 0.7; }
.pt-proposal-hint { margin-left: auto; opacity: 0.5; font-size: 11px; }
.pt-proposal-group { margin-top: 10px; }
.pt-proposal-group-hd { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.6; padding: 6px 4px; }
.pt-proposal-table { width: 100%; border-collapse: collapse; }
.pt-proposal-table th { text-align: left; font-weight: 500; opacity: 0.55; padding: 4px 6px; font-size: 11px; }
.pt-proposal-table td { padding: 2px 6px; border-top: 1px solid var(--pt-border, rgba(255,255,255,0.05)); }
.pt-proposal-cell { width: 100%; background: transparent; border: 0; color: inherit; font-size: 13px; padding: 4px 0; }
.pt-proposal-cell:focus { outline: 1px solid var(--pt-accent, #6aa); border-radius: 4px; }
.pt-proposal-rm { background: none; border: 0; color: inherit; opacity: 0.4; cursor: pointer; font-size: 16px; }
.pt-proposal-rm:hover { opacity: 1; color: var(--pt-danger, #d66); }
.pt-proposal-notes { margin-top: 12px; font-size: 12px; opacity: 0.75; }
.pt-proposal-foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.pt-proposal-done, .pt-proposal-cancelled { margin-top: 8px; padding: 10px 12px; border-radius: 8px; background: var(--pt-bg-2, rgba(255,255,255,0.04)); font-size: 13px; }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/CatalogProposalCard.tsx src/app/globals.css
git commit -m "feat(onboarding-agent): editable catalog proposal card component"
```

---

## Task 13: Render proposal card + wire Import to commit action

**Files:**
- Modify: `src/app/onboarding/OnboardingAgent.tsx`

- [ ] **Step 1: Import the card and the server action**

Add to the imports at the top:

```ts
import { CatalogProposalCard } from '@/components/onboarding/CatalogProposalCard'
import { commitExtractedCatalogAction } from './actions'
import type { ExtractionResult, ExtractedProduct } from '@/lib/catalog/extraction/types'
```

- [ ] **Step 2: Add state for per-toolcall proposal status**

Just after the existing state, add:

```ts
const [proposalStatus, setProposalStatus] = useState<Record<string, 'idle' | 'importing' | 'done' | 'cancelled'>>({})
```

- [ ] **Step 3: Handler for committing a proposal**

Add a callback:

```ts
const handleProposalImport = useCallback(async (
  toolCallId: string,
  result: ExtractionResult,
  rows: Array<ExtractedProduct & { user_edited: boolean }>,
) => {
  setProposalStatus(s => ({ ...s, [toolCallId]: 'importing' }))
  const out = await commitExtractedCatalogAction({
    rows,
    source_file_ref: result.source_file_ref,
    source_filename: result.source_filename,
    model: result.model,
  })
  if (out.error) {
    setProposalStatus(s => ({ ...s, [toolCallId]: 'idle' }))
    setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${out.error}` }])
    return
  }
  setProposalStatus(s => ({ ...s, [toolCallId]: 'done' }))
  // Reflect catalog state immediately so the left rail ticks "Catalog" off
  setState(prev => ({ ...prev, product_count: (prev.product_count ?? 0) + (out.count ?? rows.length) }))
  // Tell the agent so it knows to congratulate / move on without re-prompting upload
  void send(`I imported ${out.count ?? rows.length} products from ${result.source_filename}.`, { hideUserMessage: true })
}, [send])
```

(The `send` reference above creates a cycle since `send` is defined later. Use `useRef` for `send` instead, or define `handleProposalImport` after `send`. See Step 5 for placement.)

- [ ] **Step 4: Handler for cancel**

```ts
const handleProposalCancel = useCallback((toolCallId: string) => {
  setProposalStatus(s => ({ ...s, [toolCallId]: 'cancelled' }))
}, [])
```

- [ ] **Step 5: Place `handleProposalImport` after `send` is defined**

Move the `handleProposalImport` declaration to immediately after the `send` useCallback so the dependency reference resolves.

- [ ] **Step 6: Render the proposal card in the tool-call bubble**

Find the existing tool-call rendering block:

```jsx
{m.toolCalls?.map(tc => (
  <div key={tc.id} className={`pt-agent-confirm ${tc.status !== 'pending' ? 'is-resolved' : ''}`}>
    ...
  </div>
))}
```

Replace it with a branched render — `extract_catalog` gets the proposal card, everything else stays as is:

```jsx
{m.toolCalls?.map(tc => {
  if (tc.name === 'extract_catalog' && tc.status === 'complete' && tc.output && typeof tc.output === 'object' && !('error' in tc.output)) {
    const result = tc.output as ExtractionResult
    const status = proposalStatus[tc.id] ?? 'idle'
    return (
      <CatalogProposalCard
        key={tc.id}
        initial={result}
        status={status}
        onImport={rows => handleProposalImport(tc.id, result, rows)}
        onCancel={() => handleProposalCancel(tc.id)}
      />
    )
  }
  return (
    <div key={tc.id} className={`pt-agent-confirm ${tc.status !== 'pending' ? 'is-resolved' : ''}`}>
      <div className="pt-agent-confirm-summary">{summariseToolCall(tc.name, tc.input)}</div>
      {tc.status === 'pending' && (
        <div className="pt-agent-confirm-btns">
          <button className="pt-btn pt-btn-primary" style={{ height: 30, fontSize: 12.5 }} onClick={() => confirm(tc.id, true)} disabled={confirming}>Confirm</button>
          <button className="pt-btn pt-btn-ghost"   style={{ height: 30, fontSize: 12.5 }} onClick={() => confirm(tc.id, false)} disabled={confirming}>Cancel</button>
        </div>
      )}
      {tc.status === 'complete' && <div className="pt-agent-confirm-done"><Icons.check size={11} /> Done</div>}
      {tc.status === 'rejected' && <div className="pt-agent-confirm-skip">Skipped</div>}
    </div>
  )
})}
```

- [ ] **Step 7: Update `summariseToolCall` for `extract_catalog` to a sensible fallback**

In `summariseToolCall`, replace:
```ts
case 'extract_catalog':        return 'Extract products from upload (coming soon)'
```
with:
```ts
case 'extract_catalog':        return 'Extracted products from upload'
```

- [ ] **Step 8: Update `applyToolOutputsToState` so a completed `extract_catalog` does NOT mark catalog as done**

The catalog step is only complete once a commit has succeeded (which we already handle by bumping `product_count`). Verify `applyToolOutputsToState` does not handle `extract_catalog` — and add an explicit `case 'extract_catalog': break` for clarity:

```ts
case 'extract_catalog':
  // No state change yet; the catalog step is completed by the commit server action,
  // which bumps product_count directly via handleProposalImport.
  break
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add src/app/onboarding/OnboardingAgent.tsx
git commit -m "feat(onboarding-agent): render catalog proposal card and wire Import to commit"
```

---

## Task 14: Update onboarding system prompt for the catalog flow

**Files:**
- Modify: `src/lib/agent/executor.ts`

- [ ] **Step 1: Update the catalog guidance in `buildOnboardingSystem`**

Find:
```
- The catalog step in this version (v0.1) is limited: you can offer seed_catalog_preset (a starter list for their business type) or let them skip and add products later. The full "upload your price list and I'll extract it" experience is coming in the next release — you can mention it's coming but don't promise it now.
```

Replace with:
```
- Catalog step: ask the user to drop in their price list — PDF, screenshot, or pasted text — using the paperclip in the composer. When they upload a file, the chat message will contain a "[uploaded: <filename> (file_ref=<ref>)]" hint; call extract_catalog with that file_ref. The UI will render the extracted products as an editable proposal — DO NOT recite the products back in chat; just confirm extraction started and let the user review the proposal. Once they click Import the client will send you a synthetic message confirming the import — react briefly and move on to the next step.
- If the user explicitly says they don't have a list or wants to skip the catalog, offer seed_catalog_preset (a starter list for their business type) as a fallback. They can always add or edit products in the dashboard later.
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/executor.ts
git commit -m "feat(onboarding-agent): system prompt guidance for catalog upload flow"
```

---

## Task 15: Polish — restore protocol seeding in seed_catalog_preset

**Files:**
- Modify: `src/lib/agent/tools/onboarding.ts`

- [ ] **Step 1: Add protocol seeding inside `seedCatalogPreset.execute`**

Find the `seedCatalogPreset` tool. After the existing `supabase.from('products').insert(rows).select('id, sku')` call and before the batches insert, add the same protocol-seeding logic the classic wizard uses. Reference: `src/app/onboarding/actions.ts:74-98` (the existing `seedCatalog` action).

Add:

```ts
// Seed protocols for peptide presets that ship with protocol metadata
if (tenant.business_type === 'peptides' && inserted) {
  const protocolRows = inserted
    .map(p => {
      const preset = presets.find(sp => sp.sku === p.sku)
      const proto = preset?.protocol
      if (!proto) return null
      return {
        tenant_id:          tenantId,
        product_id:         p.id,
        vial_strength:      proto.vial_strength,
        reconstitution_ml:  proto.reconstitution_ml,
        draw_volume_ml:     proto.draw_volume_ml,
        frequency:          proto.frequency,
        timing:             proto.timing ?? null,
        cycle_length_weeks: proto.cycle_length_weeks,
        notes:              proto.notes ?? null,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  if (protocolRows.length > 0) {
    await supabase.from('product_protocols').insert(protocolRows).then(() => {})
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/tools/onboarding.ts
git commit -m "fix(onboarding-agent): restore protocol seeding when using seed_catalog_preset"
```

---

## Task 16: Polish — fix read_onboarding_state heuristics

**Files:**
- Modify: `src/lib/agent/tools/onboarding.ts`

- [ ] **Step 1: Replace the heuristic flag derivation**

Find inside `readOnboardingState.execute`:

```ts
const profileDone = !!(user?.display_name && tenant?.timezone && tenant.timezone !== 'UTC')
const businessTypeDone = !!tenant?.business_type
const currencyDone = !!tenant?.base_currency && tenant.base_currency !== 'USD' // crude default-check; user can re-set
const catalogDone = (productCount ?? 0) > 0
const channelsDone = (tenant?.intended_channels?.length ?? 0) > 0
```

Replace with explicit-set tracking. The default values (`USD`/`UTC`) on `tenants` exist before the user has answered, so we cannot use them as a signal. Use `intended_channels` as the only post-default field with non-trivial defaults — for profile/timezone/currency, just confirm a value is present and, if the agent suspects the user has not seen the field yet, ask once anyway.

```ts
const profileDone = !!user?.display_name
const businessTypeDone = !!tenant?.business_type
const currencyDone = !!tenant?.base_currency
const timezoneAsked = !!tenant?.timezone && tenant.timezone !== 'UTC'
const catalogDone = (productCount ?? 0) > 0
const channelsDone = (tenant?.intended_channels?.length ?? 0) > 0
```

Add `timezone_asked: timezoneAsked` to the returned `steps` object so the agent can choose to confirm timezone explicitly even when the row has the default UTC value. Update the system prompt one line further down accordingly:

Find:
```
At the start of EVERY conversation — including the very first turn — call read_onboarding_state first to find out what is already done, then pick up from there. Never ask for information that is already saved.
```

Replace with:
```
At the start of EVERY conversation — including the very first turn — call read_onboarding_state first to find out what is already done, then pick up from there. Never ask for information that is already saved. Note: timezone defaults to UTC before the user answers, so if steps.timezone_asked is false you still need to ask for their timezone even though tenant.timezone is populated.
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/tools/onboarding.ts src/lib/agent/executor.ts
git commit -m "fix(onboarding-agent): clearer onboarding-state flags; no more USD/UTC heuristics"
```

---

## Task 17: Full smoke test on staging

- [ ] **Step 1: Push and wait for Vercel preview deploy to finish**

Run: `git push origin master`
Expected: Vercel deploys.

- [ ] **Step 2: Manual end-to-end check on the staging URL**

Create a fresh tenant (or wipe the test tenant's `tenants.onboarded_at`, `users.display_name`, `tenants.business_type/base_currency/intended_channels`, and DELETE FROM `products` WHERE tenant_id = '<tenant>').

Walk the onboarding flow in agent mode:
- profile (name + timezone via city) → ✓
- business type → ✓
- currency → ✓
- **catalog → upload one of the real PDFs you supplied earlier**
- review proposal card, edit one row, remove one row, import → ✓
- channels → ✓
- complete → tour autostarts on dashboard

Confirm in DB that the new `products` rows contain `resources.provenance` with the right shape.

- [ ] **Step 3: Stress: try a second supplier upload mid-flow**

After import succeeds, the agent should NOT re-prompt for a catalog. Move on to channels naturally.

- [ ] **Step 4: Bug-bash and capture any issues for a follow-up plan**

Note in `docs/superpowers/plans/2026-05-24-onboarding-catalog-ingest-followups.md` (or as GitHub issues) any rough edges discovered during testing.

---

## Self-Review

**Spec coverage:**
- ✅ File upload primitive (paperclip + drag-drop + paste) — Task 11
- ✅ Multimodal extraction call via OpenRouter Gemini 2.5 Pro — Tasks 3, 5
- ✅ Structured-output JSON schema — Task 3
- ✅ Normaliser / validator with SKU generation — Task 4
- ✅ Editable inline-table proposal — Task 12
- ✅ Single Import → server action commit with provenance — Tasks 6, 9, 13
- ✅ Storage bucket with tenant RLS — Task 1
- ✅ Agent tool `extract_catalog` wired to real runner — Task 8
- ✅ Attachments threaded through chat API + executor — Task 10
- ✅ System prompt guidance for new flow — Task 14
- ✅ Polish: protocol seeding restored, heuristics fixed — Tasks 15, 16
- ✅ End-to-end staging test — Task 17
- ❌ Reference table / alias matching — deliberately deferred to V0.3
- ❌ Web-search fallback for unknown compounds — deliberately deferred to V0.3
- ❌ Customer list ingest — deferred (will reuse the same pipeline)

**Placeholder scan:** No "TBD", "implement later", "add appropriate error handling", or hand-waving steps. Every code change has full code shown.

**Type consistency:**
- `ExtractedProduct`, `ExtractionResult`, `Provenance`, `CommitInput` defined in Task 2 and used unchanged across Tasks 4, 5, 6, 8, 9, 12, 13.
- `generateSku` declared and exported in Task 4, imported by Task 6.
- `commitExtractedCatalog` signature `({ supabase, tenantId, input })` consistent between Task 6 implementation and Task 9 server-action usage.
- `extractCatalog` runner params in Task 5 match the call site in Task 8.
- `Attachment` shape `{ file_ref, filename, mime_type }` matches across upload route (Task 7), chat API (Task 10), executor (Task 10), and composer (Task 11).
