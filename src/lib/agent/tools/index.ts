import { READ_TOOLS } from './read'
import { WRITE_TOOLS } from './write'
import type { AgentTool } from '../types'

export const ALL_TOOLS: AgentTool[] = [...READ_TOOLS, ...WRITE_TOOLS]

export const TOOL_MAP: Record<string, AgentTool> = Object.fromEntries(
  ALL_TOOLS.map(t => [t.name, t])
)

// OpenAI-compatible tool definitions (used by OpenRouter)
export const OPENAI_TOOLS = ALL_TOOLS.map(t => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  },
}))

export { READ_TOOLS, WRITE_TOOLS }
