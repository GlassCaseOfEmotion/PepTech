import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_TOOLS, TOOL_MAP } from './tools/index'
import type { AgentSupabase, SseEvent, ToolCall, AgentMessage } from './types'

const MODEL = 'claude-sonnet-4-6'

function buildSystem() {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
  return `You are the Peptech business assistant — a helpful agent for a peptide supplier's CRM.
You help the operator query their business data and take internal actions.
Be concise and direct. When summarising data, use numbers and specifics.
Always confirm the customer's name before creating orders.
Never make up data — if you don't have it, use the query tools to fetch it.
Do not use markdown formatting in your responses — no **bold**, *italic*, bullet lists with -, or headings. Write in plain prose only.
Current date and time: ${dateStr}, ${timeStr}.`
}

function encodeEvent(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

// Load session history as Anthropic message format
async function loadHistory(sessionId: string, supabase: AgentSupabase): Promise<Anthropic.MessageParam[]> {
  const { data } = await supabase
    .from('agent_messages')
    .select('role, content, tool_calls')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  const msgs: Anthropic.MessageParam[] = []
  for (const m of data ?? []) {
    if (m.role === 'user') {
      msgs.push({ role: 'user', content: m.content ?? '' })
    } else {
      const content: Anthropic.ContentBlock[] = []
      if (m.content) content.push({ type: 'text', text: m.content, citations: [] } as Anthropic.ContentBlock)
      for (const tc of (m.tool_calls as unknown as ToolCall[] ?? [])) {
        if (tc.status === 'complete' || tc.status === 'rejected') {
          content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input } as Anthropic.ContentBlock)
        }
      }
      if (content.length) msgs.push({ role: 'assistant', content })

      // Append tool results as user turn
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const tc of (m.tool_calls as unknown as ToolCall[] ?? [])) {
        if (tc.status === 'complete') {
          results.push({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify(tc.output) })
        } else if (tc.status === 'rejected') {
          results.push({ type: 'tool_result', tool_use_id: tc.id, content: 'User declined this action.', is_error: true })
        }
      }
      if (results.length) msgs.push({ role: 'user', content: results })
    }
  }
  return msgs
}

// Save a user message and return its DB id
async function saveUserMessage(sessionId: string, tenantId: string, content: string, supabase: AgentSupabase) {
  const { data } = await supabase.from('agent_messages').insert({
    session_id: sessionId, tenant_id: tenantId, role: 'user', content,
  }).select('id').single()
  return data?.id
}

// Save assistant message with optional tool_calls
async function saveAssistantMessage(
  sessionId: string, tenantId: string, content: string | null, toolCalls: ToolCall[], supabase: AgentSupabase
) {
  const { data } = await supabase.from('agent_messages').insert({
    session_id: sessionId, tenant_id: tenantId, role: 'assistant',
    content: content || null,
    tool_calls: toolCalls.length ? (toolCalls as unknown as import('@/types/database').Json) : null,
  }).select('id').single()
  return data?.id
}

// Run a full Claude turn with tool loop, streaming SSE events to controller
export async function executeAgentTurn(
  sessionId: string,
  userMessage: string,
  tenantId: string,
  supabase: AgentSupabase,
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  const encoder = new TextEncoder()
  const send = (e: SseEvent) => controller.enqueue(encoder.encode(encodeEvent(e)))

  await saveUserMessage(sessionId, tenantId, userMessage, supabase)
  const history = await loadHistory(sessionId, tenantId.length ? supabase : supabase)

  const client = new Anthropic()
  let textAccum = ''
  const toolCalls: ToolCall[] = []

  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystem(),
    tools: CLAUDE_TOOLS as Anthropic.Tool[],
    messages: history,
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      textAccum += event.delta.text
      send({ type: 'text', delta: event.delta.text })
    }
    if (event.type === 'content_block_stop') {
      // Tool use block completed — check accumulated input
    }
  }

  const finalMessage = await stream.finalMessage()

  // Process tool calls from the final message
  for (const block of finalMessage.content) {
    if (block.type !== 'tool_use') continue
    const tool = TOOL_MAP[block.name]
    if (!tool) continue

    const tc: ToolCall = {
      id: block.id, name: block.name,
      input: block.input as Record<string, unknown>,
      output: null, status: 'pending',
    }

    if (!tool.requiresConfirmation) {
      // Execute silently
      try {
        tc.output = await tool.execute(tc.input, supabase, tenantId)
        tc.status = 'complete'
      } catch (e) {
        tc.output = { error: e instanceof Error ? e.message : 'Tool error' }
        tc.status = 'complete'
      }
    }
    toolCalls.push(tc)
  }

  const pendingWrites = toolCalls.filter(tc => tc.status === 'pending')

  if (pendingWrites.length === 0 && toolCalls.some(tc => tc.status === 'complete')) {
    // All tools were read tools — run a follow-up turn with results
    await saveAssistantMessage(sessionId, tenantId, textAccum || null, toolCalls, supabase)
    await continueTurn(sessionId, tenantId, supabase, client, controller, send, encoder)
    send({ type: 'done', sessionId })
    return
  }

  if (pendingWrites.length > 0) {
    // Surface write actions for confirmation
    await saveAssistantMessage(sessionId, tenantId, textAccum || null, toolCalls, supabase)
    send({ type: 'confirm', toolCalls: pendingWrites })
    send({ type: 'done', sessionId })
    return
  }

  // Pure text response
  await saveAssistantMessage(sessionId, tenantId, textAccum || null, [], supabase)
  send({ type: 'done', sessionId })
}

// Run a follow-up turn after silent tool execution, appending tool results
async function continueTurn(
  sessionId: string,
  tenantId: string,
  supabase: AgentSupabase,
  client: Anthropic,
  controller: ReadableStreamDefaultController<Uint8Array>,
  send: (e: SseEvent) => void,
  encoder: TextEncoder
) {
  void encoder
  void controller
  const history = await loadHistory(sessionId, supabase)
  const stream = await client.messages.stream({
    model: MODEL, max_tokens: 1024, system: buildSystem(),
    tools: CLAUDE_TOOLS as Anthropic.Tool[],
    messages: history,
  })

  let textAccum = ''
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      textAccum += event.delta.text
      send({ type: 'text', delta: event.delta.text })
    }
  }
  await saveAssistantMessage(sessionId, tenantId, textAccum || null, [], supabase)
}

// Confirm or reject a pending tool call, then stream Claude's follow-up
export async function confirmToolCall(
  sessionId: string,
  messageId: string,
  toolCallId: string,
  confirmed: boolean,
  tenantId: string,
  supabase: AgentSupabase,
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  const encoder = new TextEncoder()
  const send = (e: SseEvent) => controller.enqueue(encoder.encode(encodeEvent(e)))

  // Load the message containing the pending tool call
  const { data: msg } = await supabase
    .from('agent_messages')
    .select('tool_calls')
    .eq('id', messageId)
    .eq('session_id', sessionId)
    .single() as { data: Pick<AgentMessage, 'tool_calls'> | null }

  if (!msg) { send({ type: 'error', message: 'Message not found' }); return }

  const toolCalls = (msg.tool_calls as unknown as ToolCall[]) ?? []
  const tc = toolCalls.find(t => t.id === toolCallId)
  if (!tc) { send({ type: 'error', message: 'Tool call not found' }); return }

  if (confirmed) {
    const tool = TOOL_MAP[tc.name]
    try {
      tc.output = await tool.execute(tc.input, supabase, tenantId)
      tc.status = 'complete'
    } catch (e) {
      tc.output = { error: e instanceof Error ? e.message : 'Tool error' }
      tc.status = 'complete'
    }
  } else {
    tc.status = 'rejected'
  }

  // Update the message in DB
  await supabase.from('agent_messages')
    .update({ tool_calls: toolCalls as unknown as import('@/types/database').Json })
    .eq('id', messageId)

  // Run follow-up Claude turn
  const client = new Anthropic()
  await continueTurn(sessionId, tenantId, supabase, client, controller, send, encoder)
  send({ type: 'done', sessionId })
}
