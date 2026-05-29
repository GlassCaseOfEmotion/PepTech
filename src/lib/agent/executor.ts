import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { TOOL_MAP, toolsForMode, openAiToolsForMode, type AgentMode } from './tools/index'
import { fetchOnboardingStateSnapshot, type OnboardingStateSnapshot } from './tools/onboarding'
import type { AgentSupabase, ToolCall, AgentMessage } from './types'
import type { AgentSink } from './sink'
import { buildCopilotSystem } from './copilot/system'

/**
 * Chat model selection — onboarding turns prefer a fast, cheap model since
 * the conversation is short and structured; ops/dashboard turns can use the
 * heavier default. Cascade:
 *   onboarding → OPENROUTER_ONBOARDING_MODEL → OPENROUTER_MODEL → gemini-flash-2.5
 *   ops        → OPENROUTER_MODEL          → gemini-flash-2.5
 */
const FALLBACK_MODEL = 'google/gemini-flash-2.5'

/**
 * Tools that represent a "ball in the user's court" interaction — after they
 * resolve, the model has nothing more to say until the user responds. We
 * persist the assistant turn and stop; no recursive streamCompletion call.
 * Otherwise we'd hit the model with a tool result it can't usefully follow
 * up on, which manifests as empty completions / spurious error states.
 */
const TERMINAL_TOOLS = new Set(['present_choices', 'propose_payment_methods'])
function modelForMode(mode: AgentMode): string {
  if (mode === 'onboarding') {
    return process.env.OPENROUTER_ONBOARDING_MODEL ?? process.env.OPENROUTER_MODEL ?? FALLBACK_MODEL
  }
  return process.env.OPENROUTER_MODEL ?? FALLBACK_MODEL
}

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

function renderStateBlock(state: OnboardingStateSnapshot): string {
  return [
    '<current_onboarding_state>',
    `display_name:      ${state.display_name ?? '(not set)'}`,
    `timezone:          ${state.timezone ?? '(not set)'}  (asked: ${state.steps.timezone_asked})`,
    `business_type:     ${state.business_type ?? '(not set)'}`,
    `base_currency:     ${state.base_currency ?? '(not set)'}  (asked: ${state.steps.currency_asked})`,
    `intended_channels: ${state.intended_channels.length ? state.intended_channels.join(', ') : '(none)'}`,
    `product_count:     ${state.product_count}`,
    `business_name:     ${state.business_name ?? '(not set)'}`,
    `steps_done:        ${Object.entries(state.steps).filter(([, v]) => v).map(([k]) => k).join(', ') || '(none)'}`,
    `complete:          ${state.complete}`,
    '</current_onboarding_state>',
  ].join('\n')
}

function buildOnboardingSystem(state?: OnboardingStateSnapshot) {
  const stateBlock = state ? `\n\n${renderStateBlock(state)}\n\nUse the state above as the source of truth for what's done. Do NOT re-ask anything already populated. Pick up at the first incomplete step.` : ''
  return `You are the Peptech onboarding assistant — a high-end hotel concierge welcoming a brand-new tenant. Warm, gracious, attentive. Use hospitable touches naturally ("Wonderful, thank you", "Lovely", "Of course", "Perfect choice", "Happy to set that up") — never robotic or saccharine, never emoji.

Steps: profile (name + timezone), business_type, currency, catalog, channels, payments. They can answer in any order, but payments is the final step before completion.

The current onboarding state is injected into your system prompt at the start of every turn (see <current_onboarding_state> block below). Treat it as the source of truth — never re-ask anything already populated. Important: timezone and currency columns have non-null defaults ("UTC" / "USD") that DO NOT mean the user has answered — only the (asked: true) markers confirm that. If asked is false, ask the question even though the column is populated. The read_onboarding_state tool exists for refreshing the state mid-turn after a save runs, but you do not need to call it at the start of a conversation — the state is already here.

Conversational rules:
- When you don't yet have a name on file (steps.profile is false), ask open-endedly — "How should I address you?" or "What should I call you?" — NOT "What's your first name?". Some users prefer a handle, a title (Dr. Peptide), or just initials; let them choose. Whatever they answer, pass it through to save_profile.display_name verbatim.
- When you DO have a name (resuming a session), greet warmly by that name; if it looks like an auto-fill (email prefix) confirm gently ("Welcome back — is Alan still the right form, or would you prefer something else?").
- Acknowledge what the user just told you with a short warm beat before moving on ("Bali — wonderful. Setting your timezone now.").
- One to three short sentences per turn. Hospitality, not waffle.
- For ANY closed-enum question (currency, business type, channels, payment methods), you MUST call present_choices in the SAME turn as you ask the question. Do not ask the question in text alone and wait for a free-text reply — the user expects chips. The rule applies even if you don't list the options as text; the test is "is there a finite set of valid answers?". If yes → present_choices is mandatory.
  Examples (call these exact tools, in the same assistant turn as your warm acknowledgement):
    * Currency      → present_choices(prompt: "And the currency for orders?", options: ["USD","EUR","GBP","AUD","SGD","IDR","MYR","THB"], multi: false)
    * Business type → present_choices(prompt: "What do you sell?", options: ["Peptides","Nootropics","SARMs","General"], multi: false)
    * Channels      → present_choices(prompt: "Which channels will you use?", options: ["WhatsApp","Telegram","Email"], multi: true)
  The user's selection comes back as a typed-style message — handle it normally and call the appropriate save_* tool. If the user ever asks "what are the options?" you forgot to call present_choices — call it now.
- Before a tool that writes data, narrate it warmly in one short sentence ("Setting your currency to IDR now"). The UI handles confirmation cards — never ask the user to verbally confirm.
- If they give a city/country for timezone, map to the IANA zone yourself ("Bali" → "Asia/Makassar"). Don't make them look it up.
- NEVER invent values. Pass only what the user has actually told you to optional fields.
- Channel intent just records which channels they plan to use later — don't try to connect them now.
- Payments: once the catalog is in, capture how the tenant wants to get paid. Open with a multi-select via present_choices(prompt: "And how would you like to get paid?", options: ["Managed crypto wallet (we provision)","Bring my own crypto wallets","Bank transfer","Cash","Zelle","Venmo","Cash App","Wise"], multi: true).
    Decoding the two crypto options — these are NOT interchangeable:
      * "Managed crypto wallet (we provision)" → we run the wallet for them. Maps to propose_payment_methods.managed_crypto: true. It auto-accepts every supported asset (USDT, BTC, ETH, USDC, LTC, XMR, SOL) and routes them all to USDC, so there is NOTHING for the tenant to choose — do NOT ask "which assets?" for this option.
      * "Bring my own crypto wallets" → the tenant pastes their own per-chain wallet addresses. Maps to propose_payment_methods.byo_crypto_assets. ONLY this option triggers the per-asset follow-up.
    Follow-up logic (apply strictly):
      - If the selection contains "Bring my own crypto wallets" → next turn, call present_choices(prompt: "Which crypto assets do you accept?", options: ["BTC","ETH","USDT (TRC20)","USDT (ERC20)","USDC (ERC20)","SOL","LTC","XMR"], multi: true). Pass those exact labels through to byo_crypto_assets (lowercased + chain-suffixed, e.g. "USDT (TRC20)" → "usdt_trc20").
      - If the selection does NOT contain "Bring my own crypto wallets" → SKIP the assets follow-up entirely. byo_crypto_assets MUST be [] in the propose_payment_methods call. Both options can coexist (the tenant may pick both), in which case ask the follow-up; but managed alone never triggers it.
    Then call propose_payment_methods with the assembled selection — the UI will render an editable proposal card where they paste BYO addresses and write off-platform payment instructions. IMPORTANT: in the SAME turn as the propose_payment_methods call, write a one-sentence warm intro FIRST (e.g. "Excellent. I'm opening up a card now where you can fill in your bank details and payment instructions."). The text must come before the tool call so it appears above the card, not below it. Wait for the synthetic "I've saved N payment methods" message before continuing.
- After all steps are done (including payments), call complete_onboarding. Close with one short sentence setting the expectation that a short dashboard tour will start automatically.

Tool-specific guidance lives in each tool's description — read those carefully before calling.

${dateLine()}`
}

function buildSystem(mode: AgentMode, state?: OnboardingStateSnapshot) {
  return mode === 'onboarding' ? buildOnboardingSystem(state) : buildOpsSystem()
}

async function buildSystemForTurn(
  mode: AgentMode,
  supabase: AgentSupabase,
  tenantId: string,
): Promise<string> {
  if (mode === 'copilot') return buildCopilotSystem()
  if (mode !== 'onboarding') return buildSystem(mode)
  const state = await fetchOnboardingStateSnapshot(supabase, tenantId).catch((e) => {
    console.warn('[executor] failed to fetch onboarding state for system prompt', e)
    return undefined
  })
  return buildSystem(mode, state)
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
  system: string,
  history: ChatCompletionMessageParam[],
  sink: AgentSink,
  mode: AgentMode,
): Promise<{ text: string; toolCalls: ToolCall[]; finishReason: string | null }> {
  const stream = await client.chat.completions.create({
    model: modelForMode(mode),
    messages: [{ role: 'system', content: system }, ...history],
    tools: openAiToolsForMode(mode),
    stream: true,
  })

  let textAccum = ''
  let finishReason: string | null = null
  // Accumulate streamed tool call fragments by index
  const tcFragments = new Map<number, { id: string; name: string; args: string }>()

  for await (const chunk of stream) {
    const choice = chunk.choices[0]
    if (!choice) continue
    if (choice.finish_reason) finishReason = choice.finish_reason
    const delta = choice.delta
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
  if (textAccum) sink.emit({ type: 'text', delta: textAccum })

  return { text: textAccum, toolCalls, finishReason }
}

// Non-streaming completion for headless (background) turns — same return shape
// as streamCompletion, but a single request with no token streaming.
async function nonStreamCompletion(
  client: OpenAI,
  system: string,
  history: ChatCompletionMessageParam[],
  sink: AgentSink,
  mode: AgentMode,
): Promise<{ text: string; toolCalls: ToolCall[]; finishReason: string | null }> {
  const completion = await client.chat.completions.create({
    model: modelForMode(mode),
    messages: [{ role: 'system', content: system }, ...history],
    tools: openAiToolsForMode(mode),
  })
  const choice = completion.choices[0]
  const msg = choice?.message
  const text = msg?.content ?? ''
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map(tc => {
    let input: Record<string, unknown> = {}
    try { input = JSON.parse((tc as { function: { arguments: string } }).function.arguments) } catch { /* malformed */ }
    return { id: tc.id, name: (tc as { function: { name: string } }).function.name, input, output: null, status: 'pending' as const }
  })
  if (text) sink.emit({ type: 'text', delta: text })
  return { text, toolCalls, finishReason: choice?.finish_reason ?? null }
}

// Pick the completion strategy for this sink.
async function runCompletion(
  client: OpenAI,
  system: string,
  history: ChatCompletionMessageParam[],
  sink: AgentSink,
  mode: AgentMode,
) {
  return sink.streaming
    ? streamCompletion(client, system, history, sink, mode)
    : nonStreamCompletion(client, system, history, sink, mode)
}

async function modeForSession(sessionId: string, supabase: AgentSupabase): Promise<AgentMode> {
  const { data } = await supabase
    .from('agent_sessions')
    .select('trigger')
    .eq('id', sessionId)
    .single()
  if (data?.trigger === 'onboarding') return 'onboarding'
  if (data?.trigger === 'copilot') return 'copilot'
  return 'ops'
}

export async function executeAgentTurn(
  sessionId: string,
  userMessage: string,
  tenantId: string,
  supabase: AgentSupabase,
  sink: AgentSink,
  attachments: { file_ref: string; filename: string; mime_type: string }[] = [],
) {
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

  const system = await buildSystemForTurn(mode, supabase, tenantId)
  let { text, toolCalls, finishReason } = await runCompletion(client, system, history, sink, mode)

  // Empty response detection. A 200 OK with no text AND no tool calls + a
  // finishReason that ISN'T 'stop' almost always means the model errored
  // mid-stream — most commonly a MALFORMED_FUNCTION_CALL from a model that
  // can't reliably handle this schema (Gemini Flash Lite is the usual
  // suspect). Retry once before erroring — these failures are often transient.
  // finishReason === 'stop' with empty content is a LEGITIMATE end-of-turn
  // (the model had nothing to add) and should pass through silently.
  if (!text.trim() && toolCalls.length === 0 && finishReason !== 'stop') {
    const modelName = modelForMode(mode)
    console.warn('[executor] empty completion, retrying once', { sessionId, mode, model: modelName, finishReason })
    const retry = await runCompletion(client, system, history, sink, mode)
    text = retry.text
    toolCalls = retry.toolCalls
    finishReason = retry.finishReason
    if (!text.trim() && toolCalls.length === 0 && finishReason !== 'stop') {
      console.error('[executor] model returned empty completion (after retry)', { sessionId, mode, model: modelName, finishReason })
      sink.emit({
        type: 'error',
        message: `The model (${modelName}) returned an empty response twice in a row. This usually means it failed to format a tool call — try a different model via the OPENROUTER_${mode === 'onboarding' ? 'ONBOARDING_' : ''}MODEL env var (recommended: anthropic/claude-haiku-4.5 for reliable tool calls).`,
      })
      return
    }
  }

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
    sink.emit({ type: 'tool_use', toolCalls })

    // If every tool in this turn was a terminal/interactive tool (e.g.
    // present_choices), stop here — the model has already said its piece
    // and the conversation is now waiting on the user.
    if (toolCalls.every(tc => TERMINAL_TOOLS.has(tc.name))) {
      sink.emit({ type: 'done', sessionId })
      return
    }

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

    sink.emit({ type: 'new_turn' })
    await continueTurn(nextHistory, sessionId, tenantId, supabase, client, sink, mode)
    sink.emit({ type: 'done', sessionId })
    return
  }

  if (pendingWrites.length > 0) {
    const messageId = await saveAssistantMessage(sessionId, tenantId, text || null, toolCalls, supabase)
    sink.emit({ type: 'confirm', toolCalls: pendingWrites, messageId: messageId ?? '' })
    sink.emit({ type: 'done', sessionId })
    return
  }

  await saveAssistantMessage(sessionId, tenantId, text || null, [], supabase)
  sink.emit({ type: 'done', sessionId })
}

const MAX_CONTINUATION_DEPTH = 6

async function continueTurn(
  history: ChatCompletionMessageParam[],
  sessionId: string,
  tenantId: string,
  supabase: AgentSupabase,
  client: OpenAI,
  sink: AgentSink,
  mode: AgentMode,
  depth: number = 0,
) {
  if (depth >= MAX_CONTINUATION_DEPTH) {
    await saveAssistantMessage(sessionId, tenantId, '⚠ I got stuck after too many follow-up steps. Please try again.', [], supabase)
    return
  }

  // Re-fetch state each follow-up turn so save_* tools that just ran are
  // reflected in the system prompt. Cheap (one query) and keeps the prompt
  // honest as the conversation advances.
  const system = await buildSystemForTurn(mode, supabase, tenantId)
  let { text, toolCalls, finishReason } = await runCompletion(client, system, history, sink, mode)

  // Empty follow-up mid-turn. finishReason === 'stop' with empty content is
  // legitimate (the model already produced a complete turn before the tool
  // ran — e.g. greeted the user AND called read_onboarding_state; after the
  // tool returns there is nothing more to say until the user replies). Only
  // retry/error on the actual broken-stream case (Gemini MALFORMED_FUNCTION_CALL
  // and similar), which surfaces with a non-'stop' finishReason.
  if (!text.trim() && toolCalls.length === 0 && finishReason !== 'stop') {
    const modelName = modelForMode(mode)
    console.warn('[continueTurn] empty completion, retrying once', { sessionId, mode, model: modelName, depth, finishReason })
    const retry = await runCompletion(client, system, history, sink, mode)
    text = retry.text
    toolCalls = retry.toolCalls
    finishReason = retry.finishReason
    if (!text.trim() && toolCalls.length === 0 && finishReason !== 'stop') {
      console.error('[continueTurn] model returned empty completion (after retry)', { sessionId, mode, model: modelName, depth, finishReason })
      sink.emit({
        type: 'error',
        message: `The model (${modelName}) returned an empty follow-up twice in a row. This usually means a malformed tool call — try a different model via the OPENROUTER_${mode === 'onboarding' ? 'ONBOARDING_' : ''}MODEL env var (recommended: anthropic/claude-haiku-4.5 for reliable tool calls).`,
      })
      return
    }
  }

  // If the model produced text only, we're done with this turn.
  if (toolCalls.length === 0) {
    // Skip saving entirely if there's nothing to save — happens when the
    // model legitimately had nothing to add after a tool result (typically
    // because it already produced its full reply in the prior turn).
    if (!text.trim()) return
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
    sink.emit({ type: 'confirm', toolCalls: pendingWrites, messageId: messageId ?? '' })
    return
  }

  // All tools resolved — persist + notify. If every tool was terminal/
  // interactive (e.g. present_choices), stop here. Otherwise recurse so
  // the model can produce its follow-up text or chain another tool.
  await saveAssistantMessage(sessionId, tenantId, text || null, toolCalls, supabase)
  sink.emit({ type: 'tool_use', toolCalls })

  if (toolCalls.every(tc => TERMINAL_TOOLS.has(tc.name))) {
    return
  }

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

  sink.emit({ type: 'new_turn' })
  await continueTurn(nextHistory, sessionId, tenantId, supabase, client, sink, mode, depth + 1)
}

export async function confirmToolCall(
  sessionId: string,
  messageId: string,
  toolCallId: string,
  confirmed: boolean,
  tenantId: string,
  supabase: AgentSupabase,
  sink: AgentSink,
) {
  const mode = await modeForSession(sessionId, supabase)

  const { data: msg } = await supabase
    .from('agent_messages')
    .select('tool_calls')
    .eq('id', messageId)
    .eq('session_id', sessionId)
    .single() as { data: Pick<AgentMessage, 'tool_calls'> | null }

  if (!msg) { sink.emit({ type: 'error', message: 'Message not found' }); return }

  const toolCalls = (msg.tool_calls as unknown as ToolCall[]) ?? []
  const tc = toolCalls.find(t => t.id === toolCallId)
  if (!tc) { sink.emit({ type: 'error', message: 'Tool call not found' }); return }

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
  sink.emit({ type: 'tool_use', toolCalls })

  const history = await loadHistory(sessionId, supabase)
  const client = createClient()
  sink.emit({ type: 'new_turn' })
  await continueTurn(history, sessionId, tenantId, supabase, client, sink, mode)
  sink.emit({ type: 'done', sessionId })
}
