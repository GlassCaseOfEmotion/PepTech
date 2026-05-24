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
    businessType: params.businessType,
  })
}
