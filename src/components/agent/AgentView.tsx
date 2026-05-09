'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icons } from '@/lib/icons'
import { renameSession, deleteSession } from '@/app/agent/actions'
import type { AgentSession, AgentMessage, SseEvent, ToolCall } from '@/lib/agent/types'

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function readSseStream(
  response: Response,
  onDelta: (delta: string) => void,
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
        if (event.type === 'text')    onDelta(event.delta)
        if (event.type === 'confirm') onConfirm(event.toolCalls, event.messageId)
        if (event.type === 'done')    onDone(event.sessionId)
        if (event.type === 'error')   onError(event.message)
      } catch { /* ignore */ }
    }
    await pump()
  }
  pump().catch(e => onError(e.message))
}

interface DisplayMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCall[]
}

function dbMsgToDisplay(m: AgentMessage): DisplayMsg {
  return {
    id: m.id,
    role: m.role as 'user' | 'assistant',
    text: m.content ?? '',
    toolCalls: (m.tool_calls as ToolCall[] | null) ?? undefined,
  }
}

interface AgentViewProps {
  sessions: AgentSession[]
  initialSessionId: string | null
  initialMessages: AgentMessage[]
}

export function AgentView({ sessions: initialSessions, initialSessionId, initialMessages }: AgentViewProps) {
  const router = useRouter()
  const [sessions, setSessions] = useState(initialSessions)
  const [activeId, setActiveId] = useState(initialSessionId)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [messages, setMessages] = useState<DisplayMsg[]>(initialMessages.map(dbMsgToDisplay))
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{ messageId: string; toolCalls: ToolCall[] } | null>(null)
  const msgsRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const selectSession = useCallback(async (id: string) => {
    setActiveId(id)
    router.push(`/agent?session=${id}`, { scroll: false })
    const res = await fetch(`/api/agent/messages?sessionId=${id}`)
    if (res.ok) {
      const data = await res.json() as AgentMessage[]
      setMessages(data.map(dbMsgToDisplay))
    }
  }, [router])

  const appendAssistantDelta = useCallback((delta: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && !last.toolCalls) {
        return [...prev.slice(0, -1), { ...last, text: last.text + delta }]
      }
      return [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: delta }]
    })
  }, [])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setStreaming(true)
    setPendingConfirm(null)

    let sid = activeId
    if (!sid) {
      // Create new session optimistically
      const newSession: AgentSession = {
        id: `tmp-${Date.now()}`,
        tenant_id: '',
        trigger: 'user',
        trigger_ref: null,
        status: 'active',
        title: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setSessions(prev => [newSession, ...prev])
    }

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
        (toolCalls, messageId) => {
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant') {
              const updated = { ...last, toolCalls }
              setPendingConfirm({ messageId, toolCalls })
              return [...prev.slice(0, -1), updated]
            }
            const newMsg: DisplayMsg = { id: `a-${Date.now()}`, role: 'assistant', text: '', toolCalls }
            setPendingConfirm({ messageId, toolCalls })
            return [...prev, newMsg]
          })
        },
        (newSid) => {
          sid = newSid
          setActiveId(newSid)
          setSessions(prev => {
            const exists = prev.find(s => s.id === newSid)
            if (exists) return prev.map(s => s.id === newSid ? { ...s, updated_at: new Date().toISOString() } : s)
            const newS: AgentSession = { id: newSid, tenant_id: '', trigger: 'user', trigger_ref: null, status: 'active', title: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
            return [newS, ...prev.filter(s => !s.id.startsWith('tmp-'))]
          })
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
  }, [input, streaming, activeId, appendAssistantDelta])

  const confirm = useCallback(async (toolCallId: string, confirmed: boolean) => {
    if (!pendingConfirm || !activeId) return
    setConfirming(true)
    setPendingConfirm(null)

    try {
      const res = await fetch('/api/agent/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeId, messageId: pendingConfirm.messageId, toolCallId, confirmed }),
      })
      if (!res.ok) throw new Error('Confirm failed')

      readSseStream(
        res,
        appendAssistantDelta,
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
  }, [pendingConfirm, activeId, appendAssistantDelta])

  const startRename = (session: AgentSession, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(session.id)
    setRenameValue(session.title ?? firstUserMsg(session))
    setTimeout(() => renameInputRef.current?.select(), 30)
  }

  const commitRename = async (sessionId: string) => {
    const title = renameValue.trim()
    setRenamingId(null)
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: title || null } : s))
    await renameSession(sessionId, title)
  }

  const handleDelete = async (session: AgentSession, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Delete this session? This cannot be undone.`)) return
    setSessions(prev => prev.filter(s => s.id !== session.id))
    if (activeId === session.id) { setActiveId(null); setMessages([]) }
    await deleteSession(session.id)
  }

  const firstUserMsg = (session: AgentSession) => {
    if (session.title) return session.title
    if (session.id === activeId) {
      const first = messages.find(m => m.role === 'user')
      if (first) return first.text.slice(0, 60)
    }
    if (session.snippet) return session.snippet.slice(0, 60)
    return 'New session'
  }

  return (
    <div className="pt-agent-page">
      {/* Session list */}
      <aside className="pt-agent-sessions">
        <div className="pt-agent-sessions-hd">
          <span>History</span>
          <button
            className="pt-btn pt-btn-ghost"
            style={{ fontSize: 11, height: 26, padding: '0 10px' }}
            onClick={() => { setActiveId(null); setMessages([]) }}
          >
            <Icons.plus size={11} /> New
          </button>
        </div>
        <ul>
          {sessions.map(s => (
            <li
              key={s.id}
              className={`pt-agent-session-row ${activeId === s.id ? 'is-active' : ''}`}
              onClick={() => renamingId !== s.id && selectSession(s.id)}
            >
              {s.trigger === 'automation' && <span className="pt-agent-auto-tag">⚡</span>}
              {renamingId === s.id ? (
                <input
                  ref={renameInputRef}
                  className="pt-agent-rename-input"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(s.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); void commitRename(s.id) }
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <div className="pt-agent-session-snippet">{firstUserMsg(s)}</div>
              )}
              <div className="pt-agent-session-meta">
                <span className={`pt-agent-session-status pt-agent-status-${s.status}`} />
                <span className="pt-agent-session-time">{formatDate(s.updated_at)}</span>
              </div>
              <div className="pt-agent-session-actions">
                <button className="pt-agent-session-action" title="Rename" onClick={e => startRename(s, e)}>
                  <Icons.pencil size={11} />
                </button>
                <button className="pt-agent-session-action pt-agent-session-action-del" title="Delete" onClick={e => handleDelete(s, e)}>
                  <Icons.trash size={11} />
                </button>
              </div>
            </li>
          ))}
          {sessions.length === 0 && (
            <li className="pt-agent-sessions-empty">No sessions yet — press ⌘K to start</li>
          )}
        </ul>
      </aside>

      {/* Chat pane */}
      <div className="pt-agent-chat">
        <div className="pt-agent-chat-msgs" ref={msgsRef}>
          {messages.length === 0 && (
            <div className="pt-agent-empty">
              <Icons.spark size={24} />
              <p>Ask about your business or give a command</p>
              <div className="pt-agent-suggestions">
                {['How many orders this week?', 'Which products are low on stock?', 'Show me my top 5 customers by LTV'].map(q => (
                  <button key={q} className="pt-agent-suggestion" onClick={() => { setInput(q); inputRef.current?.focus() }}>{q}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} className={`pt-agent-chat-msg pt-agent-chat-msg-${m.role}`}>
              {m.text && (
                <div className="pt-agent-chat-text">
                  {m.role === 'assistant'
                    ? <div className="pt-agent-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown></div>
                    : m.text}
                </div>
              )}
              {m.toolCalls?.map(tc => (
                <div key={tc.id} className={`pt-agent-confirm ${tc.status !== 'pending' ? 'is-resolved' : ''}`}>
                  <div className="pt-agent-confirm-name">{tc.name.replace(/_/g, ' ')}</div>
                  <div className="pt-agent-confirm-input">{JSON.stringify(tc.input, null, 2).slice(0, 300)}</div>
                  {tc.status === 'pending' && (
                    <div className="pt-agent-confirm-btns">
                      <button className="pt-btn pt-btn-primary" style={{ height: 30, fontSize: 12.5 }} onClick={() => confirm(tc.id, true)} disabled={confirming}>Confirm</button>
                      <button className="pt-btn pt-btn-ghost"   style={{ height: 30, fontSize: 12.5 }} onClick={() => confirm(tc.id, false)} disabled={confirming}>Cancel</button>
                    </div>
                  )}
                  {tc.status === 'complete'  && <div className="pt-agent-confirm-done"><Icons.check size={11} /> Done</div>}
                  {tc.status === 'rejected'  && <div className="pt-agent-confirm-skip">Skipped</div>}
                </div>
              ))}
            </div>
          ))}
          {(streaming || confirming) && (
            <div className="pt-agent-chat-msg pt-agent-chat-msg-assistant">
              <div className="pt-agent-typing"><span /><span /><span /></div>
            </div>
          )}
        </div>

        <div className="pt-agent-chat-input-row">
          <textarea
            ref={inputRef}
            className="pt-agent-chat-textarea"
            placeholder="Ask anything or give a command…"
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            disabled={streaming || confirming}
          />
          <button
            className="pt-btn pt-btn-primary pt-agent-send-btn"
            onClick={() => void send()}
            disabled={!input.trim() || streaming || confirming}
          >
            <Icons.send size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
