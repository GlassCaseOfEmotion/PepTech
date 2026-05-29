export interface CopilotToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output: unknown
  status: string
}

export interface CopilotMsg {
  id: string
  role: string
  content: string | null
  toolCalls: CopilotToolCall[]
  createdAt: string
}

interface RawAgentRow {
  id: string
  role: string
  content: string | null
  tool_calls: CopilotToolCall[] | null
  created_at: string
}

export function mapAgentRow(row: RawAgentRow): CopilotMsg {
  return {
    id: row.id,
    role: row.role,
    content: row.content ?? null,
    toolCalls: row.tool_calls ?? [],
    createdAt: row.created_at,
  }
}

/** Append or replace-by-id, keeping chronological order. */
export function upsertMessage(list: CopilotMsg[], msg: CopilotMsg): CopilotMsg[] {
  const idx = list.findIndex(m => m.id === msg.id)
  if (idx === -1) return [...list, msg]
  const next = list.slice()
  next[idx] = msg
  return next
}
