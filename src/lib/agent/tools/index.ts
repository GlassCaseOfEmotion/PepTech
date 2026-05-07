import { READ_TOOLS } from './read'
import { WRITE_TOOLS } from './write'
import type { AgentTool } from '../types'

export const ALL_TOOLS: AgentTool[] = [...READ_TOOLS, ...WRITE_TOOLS]

export const TOOL_MAP: Record<string, AgentTool> = Object.fromEntries(
  ALL_TOOLS.map(t => [t.name, t])
)

// Claude-compatible tool definitions
export const CLAUDE_TOOLS = ALL_TOOLS.map(t => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema,
}))

export { READ_TOOLS, WRITE_TOOLS }
