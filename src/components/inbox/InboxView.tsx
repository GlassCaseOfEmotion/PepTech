'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { MOCK_THREADS, MOCK_MESSAGES, MOCK_QUICK_REPLIES, type MockThread, type MockMessage } from '@/lib/mock-data'

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0]]).join('')
}

function fmtMins(m: number) {
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h`
  return `${Math.floor(m / 1440)}d`
}

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }
const CH_NAMES: Record<string, string> = { wa: 'WhatsApp', tg: 'Telegram', em: 'Email' }

// ─── Thread item ─────────────────────────────────────────────────────────────

function IxThread({ t, active, onClick }: { t: MockThread; active: boolean; onClick: () => void }) {
  const ChIcon = CH_ICONS[t.channel]
  return (
    <li className={`pt-ixt ${active ? 'is-active' : ''} ${t.unread ? 'is-unread' : ''}`} onClick={onClick}>
      <div className="pt-ixt-av" data-channel={t.channel}>
        <span>{initials(t.name)}</span>
        <i className={`pt-thread-ch pt-ch-${t.channel}`}>{ChIcon && <ChIcon size={9} />}</i>
      </div>
      <div className="pt-ixt-mid">
        <div className="pt-ixt-row1">
          <span className="pt-ixt-name">{t.name}</span>
          <span className="pt-ixt-time mono">{fmtMins(t.minsAgo)}</span>
        </div>
        <div className="pt-ixt-row2">
          <span className="pt-ixt-snip">{t.snippet}</span>
          {t.unread > 0 && <span className="pt-thread-unread">{t.unread}</span>}
        </div>
        <div className="pt-ixt-row3">
          {t.tags.includes('vip')      && <span className="pt-tag pt-tag-vip">VIP</span>}
          {t.tags.includes('new')      && <span className="pt-tag pt-tag-new">new</span>}
          {t.tags.includes('waitlist') && <span className="pt-tag">waitlist</span>}
          {t.tags.includes('payment')  && <span className="pt-tag pt-tag-warn">payment</span>}
          {t.tags.includes('repeat') && !t.tags.includes('vip') && <span className="pt-tag pt-tag-soft">repeat</span>}
          {t.tags.includes('shipping') && <span className="pt-tag pt-tag-soft">shipping</span>}
          {t.tags.includes('reorder')  && <span className="pt-tag pt-tag-soft">reorder</span>}
          <span className="pt-ixt-trust mono">trust {t.trust}</span>
        </div>
      </div>
    </li>
  )
}

// ─── Thread column ───────────────────────────────────────────────────────────

function ThreadColumn({ threads, activeId, onSelect, filter, setFilter }: {
  threads: MockThread[]; activeId: string; onSelect: (id: string) => void
  filter: string; setFilter: (f: string) => void
}) {
  const filters = [
    { id: 'all',         label: 'All',         count: threads.length },
    { id: 'needs_reply', label: 'Needs reply',  count: threads.filter(x => x.status === 'needs_reply').length },
    { id: 'new',         label: 'New',          count: threads.filter(x => x.status === 'new').length },
    { id: 'snoozed',     label: 'Snoozed',      count: threads.filter(x => x.status === 'snoozed').length },
  ]
  const list = filter === 'all' ? threads : threads.filter(x => x.status === filter)

  return (
    <div className="pt-ix-list">
      <div className="pt-ix-list-hd">
        <Link href="/" className="pt-ix-back" title="Back to dashboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </Link>
        <span className="pt-ix-list-title">Inbox</span>
        <button className="pt-iconbtn" title="Filter"><Icons.filter size={13} /></button>
        <button className="pt-iconbtn" title="Compose"><Icons.plus size={13} /></button>
      </div>
      <div className="pt-ix-search">
        <Icons.search size={12} />
        <input placeholder="search threads, names, txids…" />
        <kbd>⌘F</kbd>
      </div>
      <div className="pt-ix-filters">
        {filters.map(f => (
          <button key={f.id} className={`pt-pill ${filter === f.id ? 'is-on' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}<span className="pt-pill-num">{f.count}</span>
          </button>
        ))}
      </div>
      <ul className="pt-ix-threads">
        {list.map(t => <IxThread key={t.id} t={t} active={t.id === activeId} onClick={() => onSelect(t.id)} />)}
      </ul>
    </div>
  )
}

// ─── Message bubbles ─────────────────────────────────────────────────────────

function Bubble({ m, channel }: { m: MockMessage; channel: string }) {
  if (m.kind === 'wallet') {
    return (
      <div className={`pt-bubble pt-bubble-${m.from} pt-bubble-card`}>
        <div className="pt-cardbubble">
          <div className="pt-cardbubble-hd">
            <span className="pt-cardbubble-asset">USDT · TRC20</span>
            <span className="pt-cardbubble-amt mono">$330.00</span>
          </div>
          <div className="pt-cardbubble-addr mono">T9XbnH4kQ4fM2pLrGv8WqRcXm6tPxJjN8a</div>
          <div className="pt-cardbubble-actions">
            <button className="pt-btn pt-btn-ghost">Copy</button>
            <button className="pt-btn pt-btn-ghost">QR</button>
          </div>
        </div>
        <div className="pt-bubble-meta">{m.at}</div>
      </div>
    )
  }
  if (m.kind === 'tx') {
    return (
      <div className={`pt-bubble pt-bubble-${m.from}`}>
        <div className="pt-tx">
          <div className="pt-tx-row">
            <span className="pt-tx-asset">USDT</span>
            <span className="pt-tx-id mono">0xb39…e21</span>
            <span className="pt-tx-state"><i className="pt-dot pt-dot-warn" /> 2/3 conf</span>
          </div>
        </div>
        <div className="pt-bubble-meta">{m.at} · pending</div>
      </div>
    )
  }
  return (
    <div className={`pt-bubble pt-bubble-${m.from} ${m.optimistic ? 'is-optimistic' : ''}`}>
      <div className="pt-bubble-text">{m.text}</div>
      <div className="pt-bubble-meta">
        {m.at}
        {m.optimistic && <span className="pt-bubble-pending"> · sending…</span>}
        {m.from === 'me' && !m.optimistic && <span className="pt-bubble-read"> · read</span>}
      </div>
    </div>
  )
}

// ─── Composer ────────────────────────────────────────────────────────────────

function Composer({ thread, onSend }: { thread: MockThread; onSend: (text: string) => void }) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const send = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    setSending(true)
    onSend(text)
    setDraft('')
    setTimeout(() => setSending(false), 400)
  }, [draft, onSend])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
  }

  const insertQuick = (text: string) => {
    setDraft(d => d ? `${d}\n\n${text}` : text)
    setTimeout(() => taRef.current?.focus(), 0)
  }

  return (
    <div className="pt-ix-composer">
      <div className="pt-quicks pt-quicks-bar">
        <span className="pt-quicks-lbl">Quick</span>
        {MOCK_QUICK_REPLIES.slice(0, 5).map(q => (
          <button key={q.id} className="pt-quick" onClick={() => insertQuick(q.text)}>{q.label}</button>
        ))}
        <button className="pt-quick pt-quick-more">+{MOCK_QUICK_REPLIES.length - 5} more</button>
      </div>
      <div className="pt-composer-field">
        <textarea
          ref={taRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={`Message ${thread.name} via ${CH_NAMES[thread.channel]}…`}
          rows={3}
        />
        <div className="pt-composer-tools">
          <div className="pt-composer-l">
            <button className="pt-iconbtn" title="Attach">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-2.8-2.8L15 8.5"/></svg>
            </button>
            <button className="pt-iconbtn" title="Drop COA"><Icons.flask size={14} /></button>
            <button className="pt-iconbtn" title="Send wallet"><Icons.vault size={14} /></button>
            <span className="pt-composer-sep" />
            <button className="pt-tag pt-tag-soft" title="Templates">{'{{ template }}'}</button>
          </div>
          <div className="pt-composer-r">
            <span className="pt-composer-hint">⌘↵ to send</span>
            <button
              className={`pt-btn pt-btn-primary ${sending ? 'is-sending' : ''}`}
              onClick={send}
              disabled={!draft.trim()}
            >
              <Icons.send size={12} /> Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Conversation pane ───────────────────────────────────────────────────────

function ConversationPane({ thread, messages, onSend }: {
  thread: MockThread
  messages: MockMessage[]
  onSend: (text: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const ChIcon = CH_ICONS[thread.channel]

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [thread.id, messages.length])

  return (
    <div className={`pt-ix-conv pt-ix-${thread.channel}`}>
      <div className="pt-ix-conv-hd">
        <div className="pt-ix-conv-id">
          <div className="pt-ixt-av" data-channel={thread.channel}>
            <span>{initials(thread.name)}</span>
            <i className={`pt-thread-ch pt-ch-${thread.channel}`}>{ChIcon && <ChIcon size={9} />}</i>
          </div>
          <div>
            <div className="pt-ix-conv-name">{thread.name}</div>
            <div className="pt-ix-conv-meta">
              <span className="mono">{thread.handle}</span>
              <span className="pt-dot pt-dot-cool" />
              <span>{CH_NAMES[thread.channel]}</span>
              <span className="pt-dot pt-dot-cool" />
              <span><i className="pt-dot pt-dot-ok" /> e2e encrypted</span>
            </div>
          </div>
        </div>
        <div className="pt-ix-conv-actions">
          <button className="pt-btn pt-btn-ghost"><Icons.clock size={12} /> Snooze</button>
          <button className="pt-btn pt-btn-ghost"><Icons.check size={12} /> Mark done</button>
          <button className="pt-iconbtn"><Icons.more size={14} /></button>
        </div>
      </div>

      <div ref={scrollRef} className="pt-ix-stream">
        <div className="pt-ix-day">Apr 18, 2026</div>
        {messages.map(m => <Bubble key={m.id} m={m} channel={thread.channel} />)}
        <div className="pt-ix-typing">
          <span className="pt-typing-dot" /><span className="pt-typing-dot" /><span className="pt-typing-dot" />
          <span className="pt-typing-lbl">{thread.name.split(' ')[0]} is typing…</span>
        </div>
      </div>

      <Composer thread={thread} onSend={onSend} />
    </div>
  )
}

// ─── Conversation right rail ─────────────────────────────────────────────────

function ConversationRail({ thread }: { thread: MockThread }) {
  const trustCls = thread.trust >= 85 ? 'hi' : thread.trust >= 65 ? 'md' : 'lo'
  return (
    <aside className="pt-ix-rail">
      {/* Customer card */}
      <div className="pt-cust">
        <div className="pt-cust-hd">
          <div className="pt-cust-av" data-channel={thread.channel}>{initials(thread.name)}</div>
          <div className="pt-cust-id">
            <div className="pt-cust-name">{thread.name}</div>
            <div className="pt-cust-handle mono">{thread.handle}</div>
          </div>
          <div className={`pt-trust pt-trust-${trustCls}`}>
            <div className="pt-trust-num">{thread.trust}</div>
            <div className="pt-trust-lbl">trust</div>
          </div>
        </div>
        <div className="pt-cust-stats">
          <div><div className="lbl">LTV</div><div className="val mono">${thread.ltv.toLocaleString()}</div></div>
          <div><div className="lbl">Last</div><div className="val mono">{thread.lastOrder}</div></div>
          <div><div className="lbl">Channel</div><div className="val">{CH_NAMES[thread.channel]}</div></div>
        </div>
        <div className="pt-cust-tags">
          {thread.tags.map(tag => <span key={tag} className="pt-tag pt-tag-soft">{tag}</span>)}
        </div>
      </div>

      {/* Open order */}
      <div className="pt-right-section">
        <div className="pt-right-hd"><span>Open order</span><button className="pt-link">Order →</button></div>
        <div className="pt-rail-order">
          <div className="pt-rail-order-row">
            <span className="mono pt-rail-order-id">#A-2241</span>
            <span className="pt-tag pt-tag-warn">awaiting payment</span>
          </div>
          <ul className="pt-rail-items">
            <li><span>Retatrutide 10mg</span><span className="mono">×2</span><span className="mono">$330</span></li>
          </ul>
          <div className="pt-rail-order-meta">
            <div><span className="lbl">Lot</span><span className="mono">L24-131</span></div>
            <div><span className="lbl">Ship to</span><span>same as #A-2188</span></div>
          </div>
          <div className="pt-rail-order-pay">
            <div className="pt-rail-pay-row">
              <span className="pt-pay-asset" data-asset="USDT">USDT</span>
              <div className="pt-rail-pay-mid">
                <div className="pt-rail-pay-state">2/3 confirmations · 4m ago</div>
                <div className="pt-confbar"><div className="pt-confbar-fill" style={{ width: '66%' }} /></div>
              </div>
              <button className="pt-btn pt-btn-primary pt-btn-sm">Mark paid</button>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="pt-right-section">
        <div className="pt-right-hd"><span>Notes</span><button className="pt-right-add"><Icons.plus size={11} /></button></div>
        <div className="pt-rail-note">
          <div className="pt-rail-note-meta">3w ago</div>
          <div>prefers tues/thurs ship. uses signal if WA goes down — handle <span className="mono">@gymrat84</span></div>
        </div>
        <div className="pt-rail-note">
          <div className="pt-rail-note-meta">2mo ago</div>
          <div>asked about tirz/reta stack. sent dosing protocol v2.</div>
        </div>
      </div>

      {/* Activity */}
      <div className="pt-right-section">
        <div className="pt-right-hd"><span>Activity</span></div>
        <ul className="pt-rail-activity">
          <li><i className="pt-act-dot pt-bul-cool" /><div><b>Order placed</b> · #A-2241 · $330<div className="pt-act-time">11:38 today</div></div></li>
          <li><i className="pt-act-dot" /><div><b>Tag added</b> · vip<div className="pt-act-time">2d ago</div></div></li>
          <li><i className="pt-act-dot pt-bul-warn" /><div><b>Reorder ping sent</b><div className="pt-act-time">11d ago</div></div></li>
          <li><i className="pt-act-dot" /><div><b>Order delivered</b> · #A-2188<div className="pt-act-time">14d ago</div></div></li>
        </ul>
      </div>
    </aside>
  )
}

// ─── Main InboxView ──────────────────────────────────────────────────────────

export function InboxView() {
  const [threads] = useState(MOCK_THREADS)
  const [activeId, setActiveId] = useState(MOCK_THREADS[0].id)
  const [filter, setFilter] = useState('all')
  const [messages, setMessages] = useState<Record<string, MockMessage[]>>(MOCK_MESSAGES)

  const activeThread = threads.find(t => t.id === activeId) ?? threads[0]

  const handleSend = useCallback((text: string) => {
    const newMsg: MockMessage = {
      id: `m${Date.now()}`,
      from: 'me',
      at: 'Today · just now',
      text,
      optimistic: true,
    }
    setMessages(prev => ({
      ...prev,
      [activeId]: [...(prev[activeId] ?? []), newMsg],
    }))
    setTimeout(() => {
      setMessages(prev => ({
        ...prev,
        [activeId]: (prev[activeId] ?? []).map(m => m.id === newMsg.id ? { ...m, optimistic: false } : m),
      }))
    }, 600)
  }, [activeId])

  return (
    <div className="pt-inbox">
      <ThreadColumn
        threads={threads}
        activeId={activeThread.id}
        onSelect={setActiveId}
        filter={filter}
        setFilter={setFilter}
      />
      <ConversationPane
        thread={activeThread}
        messages={messages[activeThread.id] ?? []}
        onSend={handleSend}
      />
      <ConversationRail thread={activeThread} />
    </div>
  )
}
