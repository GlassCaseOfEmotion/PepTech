import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

function createClient(): OpenAI {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY!,
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://peptech.vercel.app',
      'X-Title': 'Peptech Copilot',
    },
  })
}

export function parseJsonContent(content: string | null | undefined): unknown {
  const raw = (content ?? '').trim()
  if (!raw) throw new Error('copilot: empty completion')
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    return JSON.parse(stripped)
  } catch {
    throw new Error(`copilot: could not parse JSON from completion: ${stripped.slice(0, 200)}`)
  }
}

/** A single non-streaming chat completion that returns parsed JSON.
 * The drafting/prefilter passes call this; tests inject a fake `complete`. */
export type CompleteFn = (args: {
  model: string
  messages: ChatCompletionMessageParam[]
}) => Promise<string>

export const defaultComplete: CompleteFn = async ({ model, messages }) => {
  const completion = await createClient().chat.completions.create({
    model,
    messages,
    response_format: { type: 'json_object' } as { type: 'json_object' },
  })
  return completion.choices[0]?.message?.content ?? ''
}
