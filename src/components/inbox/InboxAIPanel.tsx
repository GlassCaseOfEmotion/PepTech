'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icons } from '@/lib/icons'
import type { SseEvent, ToolCall } from '@/lib/agent/types'

const mdComponents: Components = {
  table: ({ children, ...props }) => (
    <div className="pt-table-wrap"><table {...props}>{children}</table></div>
  ),
}

const CHIPS = [
  { label: 'Create order from chat',      prompt: 'Read the recent messages in this conversation and create an order based on what the customer has requested.' },
  { label: 'Draft a reply',               prompt: 'Read the recent messages in this conversation and draft a reply for me to send to the customer.' },
  { label: 'Summarise this customer',     prompt: 'Summarise this customer — their order history, LTV, tags, and anything notable from recent messages.' },
  { label: "What's still outstanding?",   prompt: 'Look at the recent messages in this conversation and tell me what questions or requests from the customer are still unresolved.' },
]

interface Msg {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
}

function readSseStream(
  response: Response,
  onDelta: (delta: string) => void,
  onNewTurn: () => void,
  onToolUse: (toolCalls: ToolCall[]) => void,
  onConfirm: (toolCalls: ToolCall[], messageId: string) => void,
  onDone: (sessionId: string) => void,
  onError: (msg: string) => void,
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
        if (event.type === 'text')     onDelta(event.delta)
        if (event.type === 'new_turn') onNewTurn()
        if (event.type === 'tool_use') onToolUse(event.toolCalls)
        if (event.type === 'confirm')  onConfirm(event.toolCalls, event.messageId)
        if (event.type === 'done')     onDone(event.sessionId)
        if (event.type === 'error')    onError(event.message)
      } catch { /* ignore */ }
    }
    await pump()
  }
  pump().catch(e => onError(e.message))
}

interface Props {
  conversationId: string
  customerId: string
  customerName: string
}

export function InboxAIPanel({ conversationId, customerId, customerName }: Props) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [input, setInput] = useState('')
  const [customInput, setCustomInput] = useState('')
  const msgsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Expand rail when AI is active
  useEffect(() => {
    if (messages.length > 0) {
      document.documentElement.classList.add('pt-ai-expanded')
    } else {
      document.documentElement.classList.remove('pt-ai-expanded')
    }
    return () => document.documentElement.classList.remove('pt-ai-expanded')
  }, [messages.length])

  // Reset when conversation changes
  useEffect(() => {
    setMessages([])
    setSessionId(null)
    setStreaming(false)
    setInput('')
    setCustomInput('')
  }, [conversationId])

  const appendDelta = useCallback((delta: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        return [...prev.slice(0, -1), { ...last, text: last.text + delta }]
      }
      return [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: delta, streaming: true }]
    })
  }, [])

  const startNewBubble = useCallback(() => {
    setMessages(prev => [
      ...prev.map(m => ({ ...m, streaming: false })),
      { id: `a-${Date.now()}`, role: 'assistant', text: '', streaming: true },
    ])
  }, [])

  const markDone = useCallback((newSid: string) => {
    setSessionId(newSid)
    setStreaming(false)
    setMessages(prev => prev.map(m => ({ ...m, streaming: false })))
  }, [])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return
    setStreaming(true)
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text }])

    // Prepend conversation context so agent knows where we are
    const contextualMessage = `[Context: conversation ${conversationId}, customer ${customerName} (id: ${customerId})]\n\n${text}`

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: contextualMessage }),
      })
      if (!res.ok) throw new Error('Request failed')
      readSseStream(
        res,
        appendDelta,
        startNewBubble,
        () => {},
        () => {},
        markDone,
        (msg) => {
          setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${msg}` }])
          setStreaming(false)
        },
      )
    } catch (e) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${e instanceof Error ? e.message : 'Error'}` }])
      setStreaming(false)
    }
  }, [streaming, sessionId, conversationId, customerId, customerName, appendDelta, startNewBubble, markDone])

  return (
    <div className="pt-inbox-ai-card">
      <div className="pt-inbox-ai-card-hd">
        <div className="pt-inbox-ai-card-hd-left">
          <Icons.bot size={13} />
          <span>AI Assistant</span>
        </div>
        {messages.length > 0 && (
          <button className="pt-inbox-ai-clear" onClick={() => { setMessages([]); setSessionId(null) }}>
            Clear
          </button>
        )}
      </div>

      {messages.length === 0 && (
        <div className="pt-inbox-ai-chips">
          {CHIPS.map(chip => (
            <button
              key={chip.label}
              className="pt-inbox-ai-chip"
              onClick={() => void send(chip.prompt)}
              disabled={streaming}
            >
              <span className="pt-inbox-ai-chip-arrow">→</span>
              {chip.label}
            </button>
          ))}
          <div className="pt-inbox-ai-custom">
            <input
              className="pt-inbox-ai-custom-input"
              placeholder="Ask something…"
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && customInput.trim()) {
                  void send(customInput)
                  setCustomInput('')
                }
              }}
              disabled={streaming}
            />
            <button
              className="pt-inbox-ai-custom-send"
              onClick={() => { void send(customInput); setCustomInput('') }}
              disabled={!customInput.trim() || streaming}
            >
              <Icons.send size={10} />
            </button>
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="pt-inbox-ai-msgs" ref={msgsRef}>
          {messages.map(m => (
            <div key={m.id} className={`pt-inbox-ai-msg pt-inbox-ai-msg-${m.role}`}>
              {m.role === 'assistant'
                ? m.streaming
                  ? <div className="pt-agent-typing"><span /><span /><span /></div>
                  : <div className="pt-agent-md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{m.text}</ReactMarkdown></div>
                : m.text.replace(/^\[Context:[^\]]+\]\n\n/, '')}
            </div>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="pt-inbox-ai-input-row">
          <input
            className="pt-inbox-ai-input"
            placeholder="Follow up…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); setInput('') } }}
            disabled={streaming}
          />
          <button
            className="pt-inbox-ai-send"
            onClick={() => { void send(input); setInput('') }}
            disabled={!input.trim() || streaming}
          >
            <Icons.send size={11} />
          </button>
        </div>
      )}
    </div>
  )
}
