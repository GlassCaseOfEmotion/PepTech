'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icons } from '@/lib/icons'
import type { SseEvent, ToolCall } from '@/lib/agent/types'

function summariseToolCall(name: string, input: Record<string, unknown>): string {
  const i = input
  switch (name) {
    case 'query_customers': {
      const parts: string[] = []
      if (i.name) parts.push(`name "${i.name}"`)
      if (i.tag) parts.push(`tag "${i.tag}"`)
      if (i.min_ltv != null) parts.push(`LTV ≥ ${i.min_ltv}`)
      if (i.created_after) parts.push(`joined after ${i.created_after}`)
      return parts.length ? `Searched customers — ${parts.join(', ')}` : 'Queried all customers'
    }
    case 'get_customer':
      return `Looked up customer${i.name ? ` "${i.name}"` : ''}`
    case 'query_orders': {
      const parts: string[] = []
      if (i.status) parts.push(`status: ${i.status}`)
      if (i.since) parts.push(`since ${i.since}`)
      if (i.until) parts.push(`until ${i.until}`)
      return parts.length ? `Queried orders — ${parts.join(', ')}` : 'Queried all orders'
    }
    case 'get_order':
      return `Looked up order${i.ref_number ? ` ${i.ref_number}` : ''}`
    case 'query_catalog':
      return i.family ? `Queried catalog — ${i.family}` : i.low_stock ? 'Queried low-stock products' : 'Queried full catalog'
    case 'get_analytics':
      return `Fetched analytics${i.since ? ` from ${i.since}` : ''}`
    case 'get_conversation_messages':
      return `Read conversation messages`
    case 'create_order': {
      const items = i.items as { qty: number }[] | undefined
      const count = items?.reduce((s, it) => s + it.qty, 0) ?? '?'
      return `Create order — ${count} item(s) · ${i.payment_asset ?? '?'}`
    }
    case 'update_order_status':
      return `Move order ${i.order_id ?? ''} → ${i.status ?? '?'}`
    case 'generate_invoice':
      return `Generate invoice for order ${i.order_id ?? ''}`
    default:
      return name.replace(/_/g, ' ')
  }
}

interface Msg {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCall[]
}

function readSseStream(
  response: Response,
  onDelta: (delta: string) => void,
  onNewTurn: () => void,
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
        if (event.type === 'confirm')  onConfirm(event.toolCalls, event.messageId)
        if (event.type === 'done')     onDone(event.sessionId)
        if (event.type === 'error')    onError(event.message)
      } catch { /* ignore parse errors */ }
    }
    await pump()
  }
  pump().catch(e => onError(e.message))
}

export function AgentPalette() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [pendingToolCalls, setPendingToolCalls] = useState<{ messageId: string; toolCalls: ToolCall[] } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const msgsRef = useRef<HTMLDivElement>(null)
  const lastSessionTime = useRef<number>(0)

  // ⌘K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  // Scroll to bottom on new messages
  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const appendAssistantDelta = useCallback((delta: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && !last.toolCalls) {
        return [...prev.slice(0, -1), { ...last, text: last.text + delta }]
      }
      return [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: delta }]
    })
  }, [])

  const send = useCallback(async (text: string, currentSessionId: string | null) => {
    if (!text.trim() || streaming) return
    setStreaming(true)
    setPendingToolCalls(null)

    // Reuse session if within 5 minutes
    const now = Date.now()
    let sid = (now - lastSessionTime.current < 5 * 60 * 1000) ? currentSessionId : null
    lastSessionTime.current = now

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text }])

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, message: text }),
      })
      if (!res.ok) throw new Error('Request failed')

      readSseStream(
        res,
        appendAssistantDelta,
        () => setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: '' }]),
        (toolCalls, messageId) => {
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant') {
              const updatedLast = { ...last, toolCalls }
              setPendingToolCalls({ messageId, toolCalls })
              return [...prev.slice(0, -1), updatedLast]
            }
            const newMsg = { id: `a-${Date.now()}`, role: 'assistant' as const, text: '', toolCalls }
            setPendingToolCalls({ messageId, toolCalls })
            return [...prev, newMsg]
          })
        },
        (newSessionId) => {
          setSessionId(newSessionId)
          sid = newSessionId
          setStreaming(false)
        },
        (msg) => {
          setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${msg}` }])
          setStreaming(false)
        },
      )
    } catch (e) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${e instanceof Error ? e.message : 'Error'}` }])
      setStreaming(false)
    }
  }, [streaming, appendAssistantDelta])

  const confirm = useCallback(async (toolCallId: string, confirmed: boolean) => {
    if (!pendingToolCalls || !sessionId) return
    setConfirming(true)
    setPendingToolCalls(null)

    try {
      const res = await fetch('/api/agent/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          messageId: pendingToolCalls.messageId,
          toolCallId,
          confirmed,
        }),
      })
      if (!res.ok) throw new Error('Confirm failed')

      readSseStream(
        res,
        appendAssistantDelta,
        () => setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: '' }]),
        () => {},
        () => setConfirming(false),
        (msg) => {
          setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${msg}` }])
          setConfirming(false)
        },
      )
    } catch (e) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', text: `⚠ ${e instanceof Error ? e.message : 'Error'}` }])
      setConfirming(false)
    }
  }, [pendingToolCalls, sessionId, appendAssistantDelta])

  const handleSubmit = () => {
    if (!input.trim()) return
    const text = input.trim()
    setInput('')
    void send(text, sessionId)
  }

  if (!open) return null

  return (
    <div className="pt-agent-backdrop" onClick={() => setOpen(false)}>
      <div className="pt-agent-palette" onClick={e => e.stopPropagation()}>
        <div className="pt-agent-top">
          <Icons.spark size={14} className="pt-agent-icon" />
          <input
            ref={inputRef}
            className="pt-agent-input"
            placeholder="Ask anything or give a command…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
            disabled={streaming || confirming}
          />
          {(streaming || confirming) && <div className="pt-agent-spinner" />}
        </div>

        {messages.length > 0 && (
          <div className="pt-agent-messages" ref={msgsRef}>
            {messages.map(m => (
              <div key={m.id} className={`pt-agent-msg pt-agent-msg-${m.role}`}>
                {m.text && (
                  <div className="pt-agent-msg-text">
                    {m.role === 'assistant'
                      ? <div className="pt-agent-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown></div>
                      : m.text}
                  </div>
                )}
                {m.toolCalls?.map(tc => (
                  <div key={tc.id} className={`pt-agent-confirm ${tc.status !== 'pending' ? 'is-resolved' : ''}`}>
                    <div className="pt-agent-confirm-summary">{summariseToolCall(tc.name, tc.input)}</div>
                    {tc.status === 'pending' && (
                      <div className="pt-agent-confirm-btns">
                        <button className="pt-btn pt-btn-primary" style={{ height: 28, fontSize: 12 }} onClick={() => confirm(tc.id, true)} disabled={confirming}>Confirm</button>
                        <button className="pt-btn pt-btn-ghost"   style={{ height: 28, fontSize: 12 }} onClick={() => confirm(tc.id, false)} disabled={confirming}>Cancel</button>
                      </div>
                    )}
                    {tc.status === 'complete' && <div className="pt-agent-confirm-done"><Icons.check size={11} /> Done</div>}
                    {tc.status === 'rejected' && <div className="pt-agent-confirm-skip">Skipped</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="pt-agent-footer">
          <span className="pt-agent-hint">↵ send · Esc close</span>
          {sessionId && (
            <Link href={`/agent?session=${sessionId}`} className="pt-agent-history" onClick={() => setOpen(false)}>
              View full history →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
