import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { OPENAI_TOOLS, TOOL_MAP } from './tools/index'
import type { AgentSupabase, SseEvent, ToolCall, AgentMessage } from './types'

const MODEL = process.env.OPENROUTER_MODEL ?? 'google/gemini-flash-2.5'

function buildSystem() {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
  return `You are the Peptech business assistant — a knowledgeable and proactive agent for a peptide supplier's CRM.
You help the operator run their business: querying data, creating orders, tracking customers, and surfacing insights.
Be helpful and conversational, but keep responses focused. Use numbers and specifics when summarising data — don't pad with filler.
Proactively add useful context to your answers: if asked about orders this week, also note anything interesting like a new customer or an unusually large order.
Always confirm the customer's name before creating orders.
Never make up data — if you don't have it, use the query tools to fetch it.
For write actions (create order, update status, generate invoice), call the tool directly — do NOT ask the user to verbally confirm first. The UI will show a confirmation card for them to approve or cancel.
Always hyperlink platform artifacts using markdown when you reference them:
- Orders: [A-1012](/orders/{id}) — use the order UUID as the id, ref_number as the label
- Customers: [Customer Name](/customers/{id}) — use the customer UUID as the id
- Conversations: [Customer Name](/inbox?conversation={id})
Apply these links consistently — in tables, lists, and prose. Never show a bare ref number or customer name when you have the ID to link it.
Current date and time: ${dateStr}, ${timeStr}.`
}

function createClient() {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY!,
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://peptech.vercel.app',
      'X-Title': 'Peptech',
    },
  })
}

function encodeEvent(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

// Convert stored messages to OpenAI chat format
async function loadHistory(sessionId: string, supabase: AgentSupabase): Promise<ChatCompletionMessageParam[]> {
  const { data } = await supabase
    .from('agent_messages')
    .select('role, content, tool_calls')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  const msgs: ChatCompletionMessageParam[] = []
  for (const m of data ?? []) {
    if (m.role === 'user') {
      msgs.push({ role: 'user', content: m.content ?? '' })
    } else {
      const toolCalls = (m.tool_calls as unknown as ToolCall[]) ?? []
      const hasToolCalls = toolCalls.some(tc => tc.status === 'complete' || tc.status === 'rejected')

      // Assistant message
      const assistantMsg: ChatCompletionMessageParam = {
        role: 'assistant',
        content: m.content ?? null,
        ...(hasToolCalls ? {
          tool_calls: toolCalls
            .filter(tc => tc.status === 'complete' || tc.status === 'rejected')
            .map(tc => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            })),
        } : {}),
      }
      msgs.push(assistantMsg)

      // Tool results as individual tool messages
      for (const tc of toolCalls) {
        if (tc.status === 'complete') {
          msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(tc.output) })
        } else if (tc.status === 'rejected') {
          msgs.push({ role: 'tool', tool_call_id: tc.id, content: 'User declined this action.' })
        }
      }
    }
  }
  return msgs
}

async function saveUserMessage(sessionId: string, tenantId: string, content: string, supabase: AgentSupabase) {
  const { data } = await supabase.from('agent_messages').insert({
    session_id: sessionId, tenant_id: tenantId, role: 'user', content,
  }).select('id').single()
  return data?.id
}

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

// Stream a chat completion, accumulating text and tool calls
async function streamCompletion(
  client: OpenAI,
  history: ChatCompletionMessageParam[],
  send: (e: SseEvent) => void,
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: buildSystem() }, ...history],
    tools: OPENAI_TOOLS,
    stream: true,
  })

  let textAccum = ''
  // Accumulate streamed tool call fragments by index
  const tcFragments = new Map<number, { id: string; name: string; args: string }>()

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta
    if (!delta) continue

    if (delta.content) {
      textAccum += delta.content
      // Don't stream text to client — Option J: show dots, reveal on done
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const existing = tcFragments.get(tc.index) ?? { id: '', name: '', args: '' }
        if (tc.id) existing.id = tc.id
        if (tc.function?.name) existing.name = tc.function.name
        if (tc.function?.arguments) existing.args += tc.function.arguments
        tcFragments.set(tc.index, existing)
      }
    }
  }

  // Parse accumulated tool calls
  const toolCalls: ToolCall[] = []
  for (const [, frag] of tcFragments) {
    let input: Record<string, unknown> = {}
    try { input = JSON.parse(frag.args) } catch { /* malformed args */ }
    toolCalls.push({ id: frag.id, name: frag.name, input, output: null, status: 'pending' })
  }

  // Send the complete text as a single event
  if (textAccum) send({ type: 'text', delta: textAccum })

  return { text: textAccum, toolCalls }
}

export async function executeAgentTurn(
  sessionId: string,
  userMessage: string,
  tenantId: string,
  supabase: AgentSupabase,
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  const encoder = new TextEncoder()
  const send = (e: SseEvent) => controller.enqueue(encoder.encode(encodeEvent(e)))
  const client = createClient()

  await saveUserMessage(sessionId, tenantId, userMessage, supabase)
  let history = await loadHistory(sessionId, supabase)
  if (history.length === 0) {
    history = [{ role: 'user', content: userMessage }]
  }

  const { text, toolCalls } = await streamCompletion(client, history, send)

  // Execute read tools silently
  for (const tc of toolCalls) {
    const tool = TOOL_MAP[tc.name]
    if (!tool) continue
    if (!tool.requiresConfirmation) {
      try {
        tc.output = await tool.execute(tc.input, supabase, tenantId)
        tc.status = 'complete'
      } catch (e) {
        tc.output = { error: e instanceof Error ? e.message : 'Tool error' }
        tc.status = 'complete'
      }
    }
  }

  const pendingWrites = toolCalls.filter(tc => tc.status === 'pending')

  if (pendingWrites.length === 0 && toolCalls.some(tc => tc.status === 'complete')) {
    await saveAssistantMessage(sessionId, tenantId, text || null, toolCalls, supabase)
    send({ type: 'tool_use', toolCalls })

    // Build next history in memory
    const assistantMsg: ChatCompletionMessageParam = {
      role: 'assistant',
      content: text || null,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id, type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.input) },
      })),
    }
    const toolResultMsgs: ChatCompletionMessageParam[] = toolCalls.map(tc => ({
      role: 'tool' as const,
      tool_call_id: tc.id,
      content: JSON.stringify(tc.output),
    }))
    const nextHistory = [...history, assistantMsg, ...toolResultMsgs]

    send({ type: 'new_turn' })
    await continueTurn(nextHistory, sessionId, tenantId, supabase, client, send)
    send({ type: 'done', sessionId })
    return
  }

  if (pendingWrites.length > 0) {
    const messageId = await saveAssistantMessage(sessionId, tenantId, text || null, toolCalls, supabase)
    send({ type: 'confirm', toolCalls: pendingWrites, messageId: messageId ?? '' })
    send({ type: 'done', sessionId })
    return
  }

  await saveAssistantMessage(sessionId, tenantId, text || null, [], supabase)
  send({ type: 'done', sessionId })
}

async function continueTurn(
  history: ChatCompletionMessageParam[],
  sessionId: string,
  tenantId: string,
  supabase: AgentSupabase,
  client: OpenAI,
  send: (e: SseEvent) => void,
) {
  const { text } = await streamCompletion(client, history, send)
  await saveAssistantMessage(sessionId, tenantId, text || null, [], supabase)
}

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

  await supabase.from('agent_messages')
    .update({ tool_calls: toolCalls as unknown as import('@/types/database').Json })
    .eq('id', messageId)

  const history = await loadHistory(sessionId, supabase)
  const client = createClient()
  send({ type: 'new_turn' })
  await continueTurn(history, sessionId, tenantId, supabase, client, send)
  send({ type: 'done', sessionId })
}
