import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { TOOL_MAP, toolsForMode, openAiToolsForMode, type AgentMode } from './tools/index'
import type { AgentSupabase, SseEvent, ToolCall, AgentMessage } from './types'

const MODEL = process.env.OPENROUTER_MODEL ?? 'google/gemini-flash-2.5'

function dateLine() {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
  return `Current date and time: ${dateStr}, ${timeStr}.`
}

function buildOpsSystem() {
  return `You are the Peptech business assistant — a knowledgeable and proactive agent for a peptide supplier's CRM.
You help the operator run their business: querying data, creating orders, tracking customers, and surfacing insights.
Be helpful and conversational, but keep responses focused. Use numbers and specifics when summarising data — don't pad with filler.
Proactively add useful context to your answers: if asked about orders this week, also note anything interesting like a new customer or an unusually large order.
Always confirm the customer's name before creating orders.
Never make up data — if you don't have it, use the query tools to fetch it.
Before calling any tool, always write one short sentence telling the user what you are about to do (e.g. "Let me pull up this week's orders." or "I'll check the catalog for that product.").
For write actions (create order, update status, generate invoice), call the tool directly — do NOT ask the user to verbally confirm first. The UI will show a confirmation card for them to approve or cancel.
Always hyperlink platform artifacts using markdown when you reference them:
- Orders: [A-1012](/orders/{id}) — use the order UUID as the id, ref_number as the label
- Customers: [Customer Name](/contacts/{id}) — use the customer UUID as the id
- Conversations: [Customer Name](/inbox?conversation={id})
Apply these links consistently — in tables, lists, and prose. Never show a bare ref number or customer name when you have the ID to link it.
${dateLine()}`
}

function buildOnboardingSystem() {
  return `You are the Peptech onboarding assistant. Your job is to walk a brand-new tenant through setting up their account through natural conversation. You replace a five-step form wizard.

The five steps are: profile (display name + timezone), business_type, currency, catalog, channels. You can do them in any order the user prefers, but the natural order is the one listed.

At the start of EVERY conversation — including the very first turn — call read_onboarding_state first to find out what is already done, then pick up from there. Never ask for information that is already saved. Two important defaults to know about: timezone defaults to "UTC" and currency defaults to "USD" before the user has answered, so if steps.timezone_asked or steps.currency_asked is false you MUST still ask the user — don't assume the populated column means they answered. For profile, steps.profile is reliable: if it's false, introduce yourself and ask their name; if it's true, greet them by name.

Style:
- Warm but efficient. Don't over-explain. One or two short sentences per turn.
- Greet by first name once you have it. Their email or business name may give you a hint to suggest.
- Before calling a tool that writes data, write one short sentence telling the user what you're about to do (e.g. "Saving that now." or "Setting your currency to GBP.").
- Don't ask the user to verbally confirm write actions — the UI handles confirmation cards. Just call the tool.
- If the user gives a city or country instead of a timezone, infer the IANA zone yourself (e.g. "Bangkok" → "Asia/Bangkok", "London" → "Europe/London", "Bali" → "Asia/Makassar"). Don't ask them to look it up.
- NEVER invent values you weren't told. If you only know the user's name and not their timezone, call save_profile with ONLY display_name — do not pass a default timezone. Same for any other tool with optional fields: pass only what the user has told you.
- Channel intent is just a selection of which channels they plan to use later. Don't try to actually connect them in this conversation — connection happens in Settings.
- Catalog step: invite the user to share their price list — PDF, screenshot, or pasted text. They can drag the file directly into the composer, click the paperclip, or paste it; phrase your invitation broadly (e.g. "Drag in your price list — PDF, screenshot, or pasted text all work.").
- When they upload, the chat message will contain a "[uploaded: <filename> (file_ref=<ref>)]" hint. IMPORTANT: extraction takes ~10 seconds — BEFORE calling extract_catalog, write one short reassuring sentence in plain text so the user isn't left staring at a spinner (e.g. "Got it — reading through your price list now…" or "Nice — let me parse that and I'll pull the products out for you."). Then immediately call extract_catalog with the file_ref in the same response.
- The UI renders the extracted products as an editable proposal card that appears BELOW your follow-up message — so once extract_catalog returns, write a brief, confident follow-up like "Done — 24 products extracted. Review them below and hit Import when they look right." DO NOT list the products in chat; the proposal card shows them.
- Once the user clicks Import the client will send you a synthetic message confirming the import — react briefly (one short sentence) and move on to the next step.
- If the user explicitly says they don't have a list or wants to skip the catalog, offer seed_catalog_preset (a starter list for their business type) as a fallback. They can always add or edit products in the dashboard later.
- After all required steps are done, call complete_onboarding to send them to the dashboard. When you do, your closing message should briefly set the expectation that a short tour of the dashboard will start automatically once they land (one short sentence — they can dismiss the tour from inside if they want to skip).

Valid values:
- business_type: peptides, nootropics, sarms, general
- currency: USD, EUR, GBP, AUD, SGD, IDR, MYR, THB
- channels: whatsapp, telegram, email

${dateLine()}`
}

function buildSystem(mode: AgentMode) {
  return mode === 'onboarding' ? buildOnboardingSystem() : buildOpsSystem()
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
  mode: AgentMode,
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: buildSystem(mode) }, ...history],
    tools: openAiToolsForMode(mode),
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

async function modeForSession(sessionId: string, supabase: AgentSupabase): Promise<AgentMode> {
  const { data } = await supabase
    .from('agent_sessions')
    .select('trigger')
    .eq('id', sessionId)
    .single()
  return data?.trigger === 'onboarding' ? 'onboarding' : 'ops'
}

export async function executeAgentTurn(
  sessionId: string,
  userMessage: string,
  tenantId: string,
  supabase: AgentSupabase,
  controller: ReadableStreamDefaultController<Uint8Array>,
  attachments: { file_ref: string; filename: string; mime_type: string }[] = [],
) {
  const encoder = new TextEncoder()
  const send = (e: SseEvent) => controller.enqueue(encoder.encode(encodeEvent(e)))
  const client = createClient()
  const mode = await modeForSession(sessionId, supabase)

  let messageForAgent = userMessage
  if (attachments.length > 0) {
    const lines = attachments.map(a => `[uploaded: ${a.filename} (file_ref=${a.file_ref})]`)
    messageForAgent = `${lines.join('\n')}\n${userMessage}`.trim()
  }

  await saveUserMessage(sessionId, tenantId, messageForAgent, supabase)
  let history = await loadHistory(sessionId, supabase)
  if (history.length === 0) {
    history = [{ role: 'user', content: messageForAgent }]
  }

  const { text, toolCalls } = await streamCompletion(client, history, send, mode)

  // Restrict tool calls to those available in this mode (defensive — model shouldn't call others)
  const allowedNames = new Set(toolsForMode(mode).map(t => t.name))

  for (const tc of toolCalls) {
    if (!allowedNames.has(tc.name)) {
      tc.output = { error: `Tool ${tc.name} is not available in this mode` }
      tc.status = 'complete'
      continue
    }
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
    await continueTurn(nextHistory, sessionId, tenantId, supabase, client, send, mode)
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

const MAX_CONTINUATION_DEPTH = 6

async function continueTurn(
  history: ChatCompletionMessageParam[],
  sessionId: string,
  tenantId: string,
  supabase: AgentSupabase,
  client: OpenAI,
  send: (e: SseEvent) => void,
  mode: AgentMode,
  depth: number = 0,
) {
  if (depth >= MAX_CONTINUATION_DEPTH) {
    await saveAssistantMessage(sessionId, tenantId, '⚠ I got stuck after too many follow-up steps. Please try again.', [], supabase)
    return
  }

  const { text, toolCalls } = await streamCompletion(client, history, send, mode)

  // If the model produced text only, we're done with this turn.
  if (toolCalls.length === 0) {
    await saveAssistantMessage(sessionId, tenantId, text || null, [], supabase)
    return
  }

  // Execute non-confirm tools; surface mode-restricted/unknown calls as tool errors.
  const allowedNames = new Set(toolsForMode(mode).map(t => t.name))
  for (const tc of toolCalls) {
    if (!allowedNames.has(tc.name)) {
      tc.output = { error: `Tool ${tc.name} is not available in this mode` }
      tc.status = 'complete'
      continue
    }
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

  if (pendingWrites.length > 0) {
    // A confirm-required tool was requested mid-continuation — surface the card and stop.
    const messageId = await saveAssistantMessage(sessionId, tenantId, text || null, toolCalls, supabase)
    send({ type: 'confirm', toolCalls: pendingWrites, messageId: messageId ?? '' })
    return
  }

  // All tools resolved — persist, notify, and recurse so the model can produce
  // its follow-up text or chain another tool.
  await saveAssistantMessage(sessionId, tenantId, text || null, toolCalls, supabase)
  send({ type: 'tool_use', toolCalls })

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
  await continueTurn(nextHistory, sessionId, tenantId, supabase, client, send, mode, depth + 1)
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
  const mode = await modeForSession(sessionId, supabase)

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

  // Let the client see the resolved tool call (status: complete | rejected) so it
  // can react to terminal tools like complete_onboarding before the follow-up message.
  send({ type: 'tool_use', toolCalls })

  const history = await loadHistory(sessionId, supabase)
  const client = createClient()
  send({ type: 'new_turn' })
  await continueTurn(history, sessionId, tenantId, supabase, client, send, mode)
  send({ type: 'done', sessionId })
}
