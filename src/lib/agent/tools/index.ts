import { READ_TOOLS } from './read'
import { WRITE_TOOLS } from './write'
import { ONBOARDING_TOOLS } from './onboarding'
import { COPILOT_TOOLS, postCommentary } from './copilot'
import type { AgentTool } from '../types'

export type AgentMode = 'ops' | 'onboarding' | 'copilot'

export const ALL_TOOLS: AgentTool[] = [...READ_TOOLS, ...WRITE_TOOLS]

export const TOOL_MAP: Record<string, AgentTool> = Object.fromEntries(
  [...ALL_TOOLS, ...ONBOARDING_TOOLS, postCommentary].map(t => [t.name, t])
)

function toOpenAI(tools: AgentTool[]) {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }))
}

// Default ops tool set (unchanged for the existing agent)
export const OPENAI_TOOLS = toOpenAI(ALL_TOOLS)

export function toolsForMode(mode: AgentMode): AgentTool[] {
  if (mode === 'onboarding') return ONBOARDING_TOOLS
  if (mode === 'copilot') return COPILOT_TOOLS
  return ALL_TOOLS
}

export function openAiToolsForMode(mode: AgentMode) {
  return toOpenAI(toolsForMode(mode))
}

export { READ_TOOLS, WRITE_TOOLS, ONBOARDING_TOOLS, COPILOT_TOOLS }
