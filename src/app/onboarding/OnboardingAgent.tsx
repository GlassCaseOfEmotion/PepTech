'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icons } from '@/lib/icons'
import type { SseEvent, ToolCall } from '@/lib/agent/types'
import { CatalogProposalCard } from '@/components/onboarding/CatalogProposalCard'
import { commitExtractedCatalogAction } from './actions'
import type { ExtractionResult, ExtractedProduct } from '@/lib/catalog/extraction/types'

interface OnboardingState {
  display_name: string | null
  timezone: string | null
  business_type: string | null
  base_currency: string | null
  intended_channels: string[]
  product_count: number
  complete: boolean
}

interface DisplayMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  toolCalls?: ToolCall[]
}

const STEP_LABELS = ['Profile', 'Business', 'Currency', 'Catalog', 'Channels']

// Tools whose state changes silently — never render a tool card for these
const SILENT_TOOLS = new Set(['read_onboarding_state'])

function summariseToolCall(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'read_onboarding_state':  return 'Checked your progress'
    case 'save_profile': {
      const parts: string[] = []
      if (typeof input.display_name === 'string' && input.display_name.trim()) parts.push(`name "${input.display_name}"`)
      if (typeof input.timezone === 'string' && input.timezone.trim())         parts.push(`timezone ${input.timezone}`)
      return parts.length ? `Saved ${parts.join(' · ')}` : 'Saved profile'
    }
    case 'save_business_type':     return `Set business type — ${input.business_type ?? ''}`
    case 'save_currency':          return `Set currency — ${input.currency ?? ''}`
    case 'save_channel_intent': {
      const ch = Array.isArray(input.channels) ? (input.channels as string[]).join(', ') : ''
      return `Saved channels — ${ch}`
    }
    case 'seed_catalog_preset':    return 'Seed starter catalog from preset list'
    case 'extract_catalog':        return 'Extracted products from upload'
    case 'complete_onboarding':    return 'Finish onboarding and go to dashboard'
    default: return name.replace(/_/g, ' ')
  }
}

function deriveSteps(state: OnboardingState) {
  return {
    profile:       !!state.display_name,
    business_type: !!state.business_type,
    // Currency and timezone columns have non-null defaults (USD / UTC); treat
    // those default values as "not answered yet" to match the agent's flags.
    currency:      !!state.base_currency && state.base_currency !== 'USD',
    catalog:       (state.product_count ?? 0) > 0,
    channels:      (state.intended_channels?.length ?? 0) > 0,
  }
}

function readSseStream(
  response: Response,
  handlers: {
    onDelta: (delta: string) => void
    onNewTurn: () => void
    onToolUse: (toolCalls: ToolCall[]) => void
    onConfirm: (toolCalls: ToolCall[], messageId: string) => void
    onDone: (sessionId: string) => void
    onError: (msg: string) => void
  },
) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const pump = async () => {
    const { done, value } = await reader.read()
    if (done) return
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const event = JSON.parse(line.slice(6)) as SseEvent
        if (event.type === 'text')     handlers.onDelta(event.delta)
        if (event.type === 'new_turn') handlers.onNewTurn()
        if (event.type === 'tool_use') handlers.onToolUse(event.toolCalls)
        if (event.type === 'confirm')  handlers.onConfirm(event.toolCalls, event.messageId)
        if (event.type === 'done')     handlers.onDone(event.sessionId)
        if (event.type === 'error')    handlers.onError(event.message)
      } catch { /* ignore */ }
    }
    await pump()
  }
  pump().catch(e => handlers.onError(e.message))
}

function applyToolOutputsToState(
  prev: OnboardingState,
  toolCalls: ToolCall[],
): OnboardingState {
  let next = { ...prev }
  for (const tc of toolCalls) {
    if (tc.status !== 'complete') continue
    const out = tc.output as Record<string, unknown> | null
    if (!out || typeof out !== 'object') continue
    switch (tc.name) {
      case 'save_profile':
        if (typeof out.display_name === 'string') next.display_name = out.display_name
        if (typeof out.timezone === 'string')     next.timezone = out.timezone
        break
      case 'save_business_type':
        if (typeof out.business_type === 'string') next.business_type = out.business_type
        break
      case 'save_currency':
        if (typeof out.currency === 'string') next.base_currency = out.currency
        break
      case 'save_channel_intent':
        if (Array.isArray(out.channels)) next.intended_channels = out.channels as string[]
        break
      case 'seed_catalog_preset':
        if (typeof out.count === 'number') next.product_count = out.count
        break
      case 'complete_onboarding':
        next.complete = !!out.complete
        break
      case 'extract_catalog':
        // No state change yet; the catalog step is completed by the commit server action,
        // which bumps product_count directly via handleProposalImport.
        break
      case 'read_onboarding_state': {
        // Authoritative refresh
        const dn = out.display_name
        const tz = out.timezone
        const bt = out.business_type
        const bc = out.base_currency
        const ic = out.intended_channels
        const pc = out.product_count
        next = {
          display_name:      typeof dn === 'string' ? dn : null,
          timezone:          typeof tz === 'string' ? tz : null,
          business_type:     typeof bt === 'string' ? bt : null,
          base_currency:     typeof bc === 'string' ? bc : null,
          intended_channels: Array.isArray(ic) ? (ic as string[]) : [],
          product_count:     typeof pc === 'number' ? pc : 0,
          complete:          !!out.complete,
        }
        break
      }
    }
  }
  return next
}

function Check() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function OnboardingAgent({
  initialState,
  businessName,
  onSwitchToClassic,
}: {
  initialState: OnboardingState
  businessName: string
  onSwitchToClassic: () => void
}) {
  const router = useRouter()
  const [state, setState] = useState<OnboardingState>(initialState)
  const [messages, setMessages] = useState<DisplayMsg[]>([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{ messageId: string; toolCalls: ToolCall[] } | null>(null)
  const [completing, setCompleting] = useState(false)
  const [stagedFile, setStagedFile] = useState<{
    file_ref: string; filename: string; mime_type: string
  } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [proposalStatus, setProposalStatus] = useState<Record<string, 'idle' | 'importing' | 'done' | 'cancelled'>>({})
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const msgsRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sentOpenerRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, streaming, confirming, pendingConfirm])

  // Auto-grow the textarea so the composer container expands with the message,
  // up to the CSS max-height. Resetting to 'auto' first lets it shrink too.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [input])

  const finishIfComplete = useCallback((toolCalls: ToolCall[]) => {
    if (toolCalls.some(tc => tc.name === 'complete_onboarding' && tc.status === 'complete')) {
      setCompleting(true)
      setTimeout(() => router.push('/?tour=1'), 1500)
    }
  }, [router])

  const mergeResolvedToolCalls = useCallback((resolved: ToolCall[]) => {
    // Update existing bubbles that already contain these tool calls (by id) so
    // pending confirm cards flip to "Done"/"Skipped". For tool calls without an
    // existing bubble: attach to the FINAL message only if it's a current-turn
    // assistant bubble (otherwise the card would land above the user's reply
    // from the new turn).
    setMessages(prev => {
      const resolvedById = new Map(resolved.map(tc => [tc.id, tc]))
      const updated = prev.map(m => {
        if (!m.toolCalls?.length) return m
        let touched = false
        const next = m.toolCalls.map(tc => {
          const r = resolvedById.get(tc.id)
          if (r) { resolvedById.delete(tc.id); touched = true; return r }
          return tc
        })
        return touched ? { ...m, toolCalls: next } : m
      })
      const leftovers = Array.from(resolvedById.values()).filter(tc => !SILENT_TOOLS.has(tc.name))
      if (leftovers.length === 0) return updated

      const lastMsg = updated[updated.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        // Mid-turn: attach to the assistant bubble we're currently building.
        const merged = { ...lastMsg, toolCalls: [...(lastMsg.toolCalls ?? []), ...leftovers], streaming: false }
        return [...updated.slice(0, -1), merged]
      }
      // Last message is the user's — create a fresh assistant bubble AFTER it.
      return [...updated, { id: `a-${Date.now()}`, role: 'assistant', text: '', toolCalls: leftovers, streaming: false }]
    })
  }, [])

  const appendAssistantDelta = useCallback((delta: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && !last.toolCalls) {
        return [...prev.slice(0, -1), { ...last, text: last.text + delta, streaming: true }]
      }
      return [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: delta, streaming: true }]
    })
  }, [])

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/onboarding/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const { error } = await res.json() as { error?: string }
        throw new Error(error ?? 'Upload failed')
      }
      const data = await res.json() as { file_ref: string; filename: string; mime_type: string }
      setStagedFile(data)
    } catch (e) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${e instanceof Error ? e.message : 'Upload error'}` }])
    } finally {
      setUploading(false)
    }
  }, [])

  const send = useCallback(async (override?: string, opts: { hideUserMessage?: boolean } = {}) => {
    if (streaming) return
    const typed = (override ?? input).trim()
    const attachment = stagedFile
    if (!typed && !attachment) return
    if (!override) setInput('')
    setStreaming(true)
    setPendingConfirm(null)

    // What the user sees in their own bubble.
    const userBubbleText = typed
      ? (attachment ? `${typed}\n📎 ${attachment.filename}` : typed)
      : attachment ? `📎 ${attachment.filename}` : ''
    // What the agent receives. Synthesize a brief description when attachment-only
    // so the chat API's non-empty-message requirement is satisfied and the agent
    // has a clear cue to call extract_catalog.
    const apiMessage = typed || `Here's my price list — please process it.`

    if (!opts.hideUserMessage) {
      setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text: userBubbleText }])
    }

    try {
      const sendingAttachment = attachment
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: apiMessage,
          mode: 'onboarding',
          attachments: attachment ? [attachment] : [],
        }),
      })
      if (!res.ok) throw new Error('Request failed')

      readSseStream(res, {
        onDelta: appendAssistantDelta,
        onNewTurn: () => setMessages(prev => [
          ...prev.map(m => ({ ...m, streaming: false })),
          { id: `a-${Date.now()}`, role: 'assistant', text: '', streaming: true },
        ]),
        onToolUse: (toolCalls) => {
          setState(prev => applyToolOutputsToState(prev, toolCalls))
          mergeResolvedToolCalls(toolCalls)
          finishIfComplete(toolCalls)
        },
        onConfirm: (toolCalls, messageId) => {
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant') return [...prev.slice(0, -1), { ...last, toolCalls, streaming: false }]
            return [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: '', toolCalls, streaming: false }]
          })
          setPendingConfirm({ messageId, toolCalls })
        },
        onDone: (newSid) => {
          setSessionId(newSid)
          setStreaming(false)
          setMessages(prev => prev.map(m => ({ ...m, streaming: false })))
          if (sendingAttachment) setStagedFile(null)
        },
        onError: (msg) => {
          setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${msg}` }])
          setStreaming(false)
        },
      })
    } catch (e) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${e instanceof Error ? e.message : 'Error'}` }])
      setStreaming(false)
    }
  }, [input, streaming, sessionId, stagedFile, appendAssistantDelta, mergeResolvedToolCalls, finishIfComplete])

  const handleProposalImport = useCallback(async (
    toolCallId: string,
    result: ExtractionResult,
    rows: Array<ExtractedProduct & { user_edited: boolean }>,
  ) => {
    setProposalStatus(s => ({ ...s, [toolCallId]: 'importing' }))
    const out = await commitExtractedCatalogAction({
      rows,
      source_file_ref: result.source_file_ref,
      source_filename: result.source_filename,
      model: result.model,
    })
    if (out.error) {
      setProposalStatus(s => ({ ...s, [toolCallId]: 'idle' }))
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${out.error}` }])
      return
    }
    setProposalStatus(s => ({ ...s, [toolCallId]: 'done' }))
    // Reflect catalog state immediately so the left rail ticks "Catalog" off
    setState(prev => ({ ...prev, product_count: (prev.product_count ?? 0) + (out.count ?? rows.length) }))
    // Tell the agent so it knows to congratulate / move on without re-prompting upload
    void send(`I imported ${out.count ?? rows.length} products from ${result.source_filename}.`, { hideUserMessage: true })
  }, [send])

  const handleProposalCancel = useCallback((toolCallId: string) => {
    setProposalStatus(s => ({ ...s, [toolCallId]: 'cancelled' }))
  }, [])

  const confirm = useCallback(async (toolCallId: string, confirmed: boolean) => {
    if (!pendingConfirm || !sessionId) return
    setConfirming(true)
    setPendingConfirm(null)

    try {
      const res = await fetch('/api/agent/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, messageId: pendingConfirm.messageId, toolCallId, confirmed }),
      })
      if (!res.ok) throw new Error('Confirm failed')

      readSseStream(res, {
        onDelta: appendAssistantDelta,
        onNewTurn: () => setMessages(prev => [
          ...prev.map(m => ({ ...m, streaming: false })),
          { id: `a-${Date.now()}`, role: 'assistant', text: '', streaming: true },
        ]),
        onToolUse: (toolCalls) => {
          setState(prev => applyToolOutputsToState(prev, toolCalls))
          mergeResolvedToolCalls(toolCalls)
          finishIfComplete(toolCalls)
        },
        onConfirm: () => {},
        onDone: () => { setConfirming(false); setMessages(prev => prev.map(m => ({ ...m, streaming: false }))) },
        onError: (msg) => {
          setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${msg}` }])
          setConfirming(false)
        },
      })
    } catch (e) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${e instanceof Error ? e.message : 'Error'}` }])
      setConfirming(false)
    }
  }, [pendingConfirm, sessionId, appendAssistantDelta, mergeResolvedToolCalls, finishIfComplete])

  // Auto-send a silent opener so the agent runs read_onboarding_state and greets us
  useEffect(() => {
    if (sentOpenerRef.current) return
    sentOpenerRef.current = true
    void send('Hi — I just landed on the onboarding page.', { hideUserMessage: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const steps = deriveSteps(state)
  const stepValues = [steps.profile, steps.business_type, steps.currency, steps.catalog, steps.channels]
  const doneCount = stepValues.filter(Boolean).length

  return (
    <div className="ob-shell">

      {/* ── Left panel ── */}
      <aside className="ob-left" aria-hidden="false">
        <div className="ob-glows">
          <div className="ob-glow ob-glow-a" />
          <div className="ob-glow ob-glow-b" />
        </div>
        <div className="ob-dots" />
        <div className="ob-left-inner">

          <div className="ob-logo">
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
              <polygon points="11,1.5 20,6.5 20,15.5 11,20.5 2,15.5 2,6.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <circle cx="11" cy="11" r="2.5" fill="currentColor"/>
              <line x1="11" y1="4" x2="11" y2="8.5" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
              <line x1="11" y1="13.5" x2="11" y2="18" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
            </svg>
            <span>Peptech</span>
          </div>

          <div className="ob-chapter">
            <div className="ob-ch-tag">Agent · v0.2</div>
            <h2 className="ob-ch-title">
              <span>Your store,</span>
              <span>your way.</span>
            </h2>
            <p className="ob-ch-sub">{doneCount} of {STEP_LABELS.length} steps done. Chat with the assistant to set everything up.</p>
          </div>

          <nav className="ob-stepper">
            {STEP_LABELS.map((label, idx) => {
              const done = stepValues[idx]
              const n = idx + 1
              return (
                <div key={label} className={`ob-si${done ? ' done' : ''}${!done && stepValues.slice(0, idx).every(Boolean) ? ' active' : ''}`}>
                  <div className="ob-si-dot">
                    {done ? <Check /> : <span>{n}</span>}
                  </div>
                  <span className="ob-si-label">{label}</span>
                  {idx < STEP_LABELS.length - 1 && <div className="ob-si-line" />}
                </div>
              )
            })}
          </nav>

          <div style={{ marginTop: 'auto', paddingTop: 24 }}>
            <button
              className="ob-btn ob-btn-ghost"
              style={{ fontSize: 12, opacity: 0.7 }}
              onClick={onSwitchToClassic}
            >
              ← Use classic step-by-step instead
            </button>
          </div>

        </div>
      </aside>

      {/* ── Right panel: chat (or completion overlay) ──
          Override ob-right's default centered+scroll behavior so the composer
          is pinned to the viewport bottom and only the message list scrolls. */}
      <main
        className="ob-right"
        style={{
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          padding: '0',
        }}
      >
        {completing && (
          <div className="ob-step ob-completing" key="done" style={{ margin: 'auto' }}>
            <div className="ob-completing-ring">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="21" stroke="var(--pt-ok)" strokeWidth="1.5" opacity="0.25"/>
                <circle cx="24" cy="24" r="21" stroke="var(--pt-ok)" strokeWidth="2" strokeDasharray="132" strokeDashoffset="0"/>
                <polyline points="14,24 20,30 34,17" stroke="var(--pt-ok)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="ob-completing-h">You&apos;re all set!</h2>
            <p className="ob-completing-p">Taking you to your dashboard — I&apos;ll show you around when we land.</p>
          </div>
        )}
        {!completing && (
        <div
          className="ob-step"
          style={{
            maxWidth: 720, width: '100%',
            margin: '0 auto',
            display: 'flex', flexDirection: 'column',
            flex: 1, minHeight: 0,
            padding: '24px 32px 0',
          }}
        >
          <div className="ob-step-hd" style={{ marginBottom: 16, flexShrink: 0 }}>
            <h2 className="ob-step-title">Let&apos;s get {businessName || 'your store'} set up</h2>
            <p className="ob-step-sub">Just chat — the assistant will walk you through each step. You can answer in any order.</p>
          </div>

          <div
            ref={msgsRef}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: '8px 4px 16px',
            }}
          >
            {messages.map(m => (
              <div key={m.id} className={`pt-agent-chat-msg pt-agent-chat-msg-${m.role}`}>
                {m.role === 'assistant' && m.streaming && !m.text ? (
                  <div className="pt-agent-typing"><span /><span /><span /></div>
                ) : m.text ? (
                  <div className="pt-agent-chat-text">
                    {m.role === 'assistant'
                      ? <div className="pt-agent-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown></div>
                      : m.text}
                  </div>
                ) : null}
                {m.toolCalls?.map(tc => {
                  if (tc.name === 'extract_catalog' && tc.status === 'complete' && tc.output && typeof tc.output === 'object' && !('error' in tc.output)) {
                    const result = tc.output as ExtractionResult
                    const status = proposalStatus[tc.id] ?? 'idle'
                    return (
                      <CatalogProposalCard
                        key={tc.id}
                        initial={result}
                        status={status}
                        onImport={rows => handleProposalImport(tc.id, result, rows)}
                        onCancel={() => handleProposalCancel(tc.id)}
                      />
                    )
                  }
                  return (
                    <div key={tc.id} className={`pt-agent-confirm ${tc.status !== 'pending' ? 'is-resolved' : ''}`}>
                      <div className="pt-agent-confirm-summary">{summariseToolCall(tc.name, tc.input)}</div>
                      {tc.status === 'pending' && (
                        <div className="pt-agent-confirm-btns">
                          <button className="pt-btn pt-btn-primary" style={{ height: 30, fontSize: 12.5 }} onClick={() => confirm(tc.id, true)} disabled={confirming}>Confirm</button>
                          <button className="pt-btn pt-btn-ghost"   style={{ height: 30, fontSize: 12.5 }} onClick={() => confirm(tc.id, false)} disabled={confirming}>Cancel</button>
                        </div>
                      )}
                      {tc.status === 'complete' && <div className="pt-agent-confirm-done"><Icons.check size={11} /> Done</div>}
                      {tc.status === 'rejected' && <div className="pt-agent-confirm-skip">Skipped</div>}
                    </div>
                  )
                })}
              </div>
            ))}
            {(streaming || confirming) && !messages.some(m => m.role === 'assistant' && m.streaming) && (
              <div className="pt-agent-chat-msg pt-agent-chat-msg-assistant">
                <div className="pt-agent-typing"><span /><span /><span /></div>
              </div>
            )}
            <div ref={bottomRef} aria-hidden style={{ height: 1 }} />
          </div>

          <div style={{ flexShrink: 0, padding: '8px 0 20px' }}>
            <div
              className={`pt-composer${dragOver ? ' is-drag' : ''}`}
              onDragOver={e => { e.preventDefault() }}
              onDragEnter={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
              }}
              onDrop={e => {
                e.preventDefault()
                setDragOver(false)
                const file = e.dataTransfer.files?.[0]
                if (file) void uploadFile(file)
              }}
            >
              {(uploading || stagedFile) && (
                <div className="pt-composer-chip-row">
                  {uploading && (
                    <div className="pt-composer-uploading">
                      <span className="pt-composer-uploading-dot" />
                      Uploading…
                    </div>
                  )}
                  {!uploading && stagedFile && (
                    <div className="pt-composer-chip">
                      <span className="pt-composer-chip-icon">PDF</span>
                      <span className="pt-composer-chip-name">{stagedFile.filename}</span>
                      <button
                        type="button"
                        className="pt-composer-chip-remove"
                        onClick={() => setStagedFile(null)}
                        aria-label="Remove attachment"
                      >×</button>
                    </div>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                hidden
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) void uploadFile(f)
                  e.target.value = ''
                }}
              />
              <textarea
                ref={textareaRef}
                className="pt-composer-textarea"
                placeholder={
                  uploading
                    ? 'Uploading your file…'
                    : stagedFile
                      ? 'Add a note, or just hit send to extract this catalogue.'
                      : dragOver
                        ? 'Drop your file here…'
                        : 'Reply to the assistant, or drop in your price list (PDF, image, or paste).'
                }
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onPaste={e => {
                  const file = e.clipboardData.files?.[0]
                  if (file) { e.preventDefault(); void uploadFile(file) }
                }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
                disabled={streaming || confirming}
              />

              <div className="pt-composer-actions">
                <button
                  type="button"
                  className="pt-composer-icon-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || streaming || confirming}
                  title="Attach a price list — PDF, image, or paste"
                  aria-label="Attach a price list"
                >
                  <Icons.paperclip size={14} />
                </button>

                <div className="pt-composer-actions-right">
                  <span className="pt-composer-hint">
                    {input.trim() || stagedFile
                      ? <><kbd>↵</kbd> to send · <kbd>Shift</kbd>+<kbd>↵</kbd> for newline</>
                      : <>Drag · Paste · Type</>}
                  </span>
                  <button
                    type="button"
                    className="pt-composer-send"
                    onClick={() => void send()}
                    disabled={(!input.trim() && !stagedFile) || streaming || confirming || uploading}
                    aria-label="Send"
                  >
                    <Icons.send size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </main>
    </div>
  )
}
