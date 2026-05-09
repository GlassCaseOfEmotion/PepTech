import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type AgentSupabase = SupabaseClient<Database>

export type ToolCallStatus = 'pending' | 'confirmed' | 'rejected' | 'complete'

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output: unknown | null
  status: ToolCallStatus
}

export interface AgentMessage {
  id: string
  session_id: string
  tenant_id: string
  role: 'user' | 'assistant'
  content: string | null
  tool_calls: ToolCall[] | null
  created_at: string
}

export interface AgentSession {
  id: string
  tenant_id: string
  trigger: 'user' | 'automation' | 'schedule'
  trigger_ref: string | null
  status: 'active' | 'complete'
  title: string | null
  created_at: string
  updated_at: string
  snippet?: string
}

export type SseEvent =
  | { type: 'text'; delta: string }
  | { type: 'confirm'; toolCalls: ToolCall[]; messageId: string }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; message: string }

export interface AgentTool<TInput = Record<string, unknown>> {
  name: string
  description: string
  inputSchema: Record<string, unknown>   // JSON Schema for Claude
  requiresConfirmation: boolean
  execute: (input: TInput, supabase: AgentSupabase, tenantId: string) => Promise<unknown>
  summarise?: (input: TInput) => string   // human-readable summary for confirm card
}
