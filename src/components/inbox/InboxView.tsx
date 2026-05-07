'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { InboxProvider, useInbox } from './InboxProvider'
import { OrderRail } from './OrderRail'
import { TemplatePicker } from './TemplatePicker'
import type { DbConversation, DbQuickReply, DbTemplate, InboxThread, InboxMessage } from '@/types/inbox'
import { initials } from '@/types/inbox'

function fmtMins(m: number) {
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h`
  return `${Math.floor(m / 1440)}d`
}

function fmtRelative(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  const days = Math.floor(mins / 1440)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }
const CH_NAMES: Record<string, string> = { wa: 'WhatsApp', tg: 'Telegram', em: 'Email' }

// ─── Thread item ─────────────────────────────────────────────────────────────

function IxThread({ t, active, onClick }: { t: InboxThread; active: boolean; onClick: () => void }) {
  const { togglePin } = useInbox()
  const ChIcon = CH_ICONS[t.channel]
  return (
    <li className={`pt-ixt ${active ? 'is-active' : ''} ${t.unread ? 'is-unread' : ''} ${t.status === 'snoozed' ? 'is-snoozed' : ''} ${t.pinned ? 'is-pinned' : ''}`} onClick={onClick}>
      <div className="pt-ixt-av" data-channel={t.channel}>
        <span>{initials(t.name)}</span>
        <i className={`pt-thread-ch pt-ch-${t.channel}`}>{ChIcon && <ChIcon size={9} />}</i>
      </div>
      <div className="pt-ixt-mid">
        <div className="pt-ixt-row1">
          <span className="pt-ixt-name">{t.name}</span>
          <button
            className={`pt-ixt-pin ${t.pinned ? 'is-pinned' : ''}`}
            title={t.pinned ? 'Unpin' : 'Pin'}
            onClick={e => { e.stopPropagation(); void togglePin(t.id) }}
          >
            <Icons.pin size={10} />
          </button>
          <span className="pt-ixt-time mono">{fmtMins(t.minsAgo)}</span>
        </div>
        <div className="pt-ixt-row2">
          <span className="pt-ixt-snip">{t.snippet}</span>
          {t.unread > 0 && <span className="pt-thread-unread">{t.unread}</span>}
        </div>
        <div className="pt-ixt-row3">
          {t.status === 'snoozed'       && <span className="pt-tag pt-tag-soft pt-tag-snoozed">⏰ snoozed</span>}
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
  threads: InboxThread[]; activeId: string; onSelect: (id: string) => void
  filter: string; setFilter: (f: string) => void
}) {
  const { resolvedCount } = useInbox()
  const [search, setSearch] = useState('')
  const [chanFilter, setChanFilter] = useState<'all' | 'wa' | 'tg' | 'em'>('all')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const counts = {
    all: threads.filter(t => t.status !== 'resolved').length,
    needs_reply: threads.filter(t => t.status === 'needs_reply').length,
    new: threads.filter(t => t.status === 'new').length,
    snoozed: threads.filter(t => t.status === 'snoozed').length,
    resolved: resolvedCount,
  }

  const filters = [
    { id: 'all',         label: 'All',          count: counts.all },
    { id: 'needs_reply', label: 'Needs reply',   count: counts.needs_reply },
    { id: 'new',         label: 'New',           count: counts.new },
    { id: 'snoozed',     label: 'Snoozed',       count: counts.snoozed },
    { id: 'resolved',    label: 'Resolved',      count: counts.resolved },
  ]

  const visible = threads.filter(t => {
    if (filter === 'all') { if (t.status === 'resolved') return false }
    else if (t.status !== filter) return false
    if (chanFilter !== 'all' && t.channel !== chanFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return t.name.toLowerCase().includes(q) || t.handle.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="pt-ix-list">
      <div className="pt-ix-list-hd">
        <Link href="/" className="pt-ix-back" title="Back to dashboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </Link>
        <span className="pt-ix-list-title">Inbox</span>
      </div>
      <div className="pt-ix-search">
        <Icons.search size={12} />
        <input
          ref={searchRef}
          placeholder="search threads, names, txids…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <kbd>⌘F</kbd>
      </div>
      <div className="pt-ix-filters">
        {filters.map(f => (
          <button key={f.id} className={`pt-pill ${filter === f.id ? 'is-on' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}<span className="pt-pill-num">{f.count}</span>
          </button>
        ))}
      </div>
      <div className="pt-ix-filters">
        {(['all', 'wa', 'tg', 'em'] as const).map(ch => (
          <button
            key={ch}
            className={`pt-pill ${chanFilter === ch ? 'is-on' : ''}`}
            onClick={() => setChanFilter(ch)}
          >
            {ch === 'all' ? 'All channels' : ch === 'wa' ? 'WhatsApp' : ch === 'tg' ? 'Telegram' : 'Email'}
          </button>
        ))}
      </div>
      <ul className="pt-ix-threads">
        {visible.map(t => <IxThread key={t.id} t={t} active={t.id === activeId} onClick={() => onSelect(t.id)} />)}
        {visible.length === 0 && (
          <li className="pt-ix-empty">
            {filter === 'all' && 'Inbox is clear'}
            {filter === 'needs_reply' && 'Nothing needs a reply'}
            {filter === 'new' && 'No new conversations'}
            {filter === 'snoozed' && 'No snoozed conversations'}
            {filter === 'resolved' && 'No resolved conversations'}
          </li>
        )}
      </ul>
    </div>
  )
}

// ─── Message bubbles ─────────────────────────────────────────────────────────

function Bubble({ m, onImageClick }: { m: InboxMessage; onImageClick?: (url: string) => void }) {
  if (m.kind === 'wallet') {
    const { asset, network, address, amount } = m.metadata ?? {}
    return (
      <div className={`pt-bubble pt-bubble-${m.from} pt-bubble-card`}>
        <div className="pt-cardbubble">
          <div className="pt-cardbubble-hd">
            <span className="pt-cardbubble-asset">{asset ?? 'USDT'} · {network ?? 'TRC20'}</span>
            <span className="pt-cardbubble-amt mono">${amount?.toFixed(2) ?? '—'}</span>
          </div>
          <div className="pt-cardbubble-addr mono">{address ?? '—'}</div>
          <div className="pt-cardbubble-actions">
            <button className="pt-btn pt-btn-ghost"
              onClick={() => address && navigator.clipboard.writeText(address)}>Copy</button>
            <button className="pt-btn pt-btn-ghost">QR</button>
          </div>
        </div>
        <div className="pt-bubble-meta">{m.at}</div>
      </div>
    )
  }

  if (m.kind === 'tx') {
    const { asset, tx_id, confirmations, required_confirmations, state } = m.metadata ?? {}
    const conf = confirmations ?? 0
    const req = required_confirmations ?? 3
    const pct = Math.min(1, conf / req)
    return (
      <div className={`pt-bubble pt-bubble-${m.from}`}>
        <div className="pt-tx">
          <div className="pt-tx-row">
            <span className="pt-tx-asset">{asset ?? 'USDT'}</span>
            <span className="pt-tx-id mono">{tx_id ? `${tx_id.slice(0, 6)}…${tx_id.slice(-4)}` : '—'}</span>
            <span className={`pt-tx-state ${state === 'confirmed' ? 'is-ok' : 'is-warn'}`}>
              <i className={`pt-dot pt-dot-${state === 'confirmed' ? 'cool' : 'warn'}`} />
              {conf}/{req} conf
            </span>
          </div>
          <div className="pt-confbar"><div className="pt-confbar-fill" style={{ width: `${pct * 100}%` }} /></div>
        </div>
        <div className="pt-bubble-meta">{m.at} · {state ?? 'pending'}</div>
      </div>
    )
  }

  if (m.kind === 'photo') {
    const url = m.metadata?.mediaUrl as string | undefined
    return (
      <div className={`pt-bubble pt-bubble-${m.from} pt-bubble-photo`}>
        {url ? (
          <button className="pt-bubble-img-link" onClick={() => onImageClick?.(url)} style={{ border: 'none', padding: 0, background: 'none', cursor: 'zoom-in' }}>
            <img src={url} alt="Photo" className="pt-bubble-img" />
          </button>
        ) : (
          <div className="pt-bubble-img-placeholder">📷</div>
        )}
        <div className="pt-bubble-meta">
          {m.at}
          {m.from === 'me' && !m.optimistic && <span className="pt-bubble-read"> · sent</span>}
        </div>
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

function Composer({ thread, onSend, isSending }: { thread: InboxThread; onSend: (text: string) => void; isSending: boolean }) {
  const { quickReplies, templates, activeId, pendingInvoicePath, pendingInvoiceName, clearPendingInvoice } = useInbox()
  const [draft, setDraft] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    setPendingFile(file)
    setPendingPreviewUrl(URL.createObjectURL(file))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [pendingPreviewUrl])

  const clearPendingFile = useCallback(() => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    setPendingFile(null)
    setPendingPreviewUrl(null)
  }, [pendingPreviewUrl])

  const sendPhoto = useCallback(async () => {
    if (!pendingFile || !activeId) return
    setIsUploading(true)
    try {
      const form = new FormData()
      form.append('file', pendingFile)
      form.append('conversationId', activeId)
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: form })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const { storagePath } = await uploadRes.json() as { storagePath: string }
      await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, storagePath }),
      })
      clearPendingFile()
    } finally {
      setIsUploading(false)
    }
  }, [pendingFile, activeId, clearPendingFile])

  const send = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }, [draft, onSend])

  const sendInvoice = useCallback(async () => {
    if (!pendingInvoicePath || !pendingInvoiceName || !activeId) return
    setIsUploading(true)
    try {
      const res = await fetch('/api/invoices/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, invoicePath: pendingInvoicePath, invoiceName: pendingInvoiceName }),
      })
      if (!res.ok) return
      clearPendingInvoice()
      if (draft.trim()) send()
    } finally {
      setIsUploading(false)
    }
  }, [pendingInvoicePath, pendingInvoiceName, activeId, clearPendingInvoice, draft, send])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (pendingFile) void sendPhoto()
      else if (pendingInvoicePath) void sendInvoice()
      else send()
    }
  }

  const insertQuick = (content: string) => {
    setDraft(d => d ? `${d}\n\n${content}` : content)
    setTimeout(() => taRef.current?.focus(), 0)
  }

  return (
    <div className="pt-ix-composer">
      {showTemplates && (
        <TemplatePicker
          templates={templates}
          onSelect={content => { setDraft(d => d ? `${d}\n\n${content}` : content); setTimeout(() => taRef.current?.focus(), 0) }}
          onClose={() => setShowTemplates(false)}
        />
      )}
      <div className="pt-quicks pt-quicks-bar">
        <span className="pt-quicks-lbl">Quick</span>
        {quickReplies.slice(0, 5).map(q => (
          <button key={q.id} className="pt-quick" onClick={() => insertQuick(q.content)}>{q.label}</button>
        ))}
        {quickReplies.length > 5 && (
          <button className="pt-quick pt-quick-more">+{quickReplies.length - 5} more</button>
        )}
      </div>
      {pendingPreviewUrl && (
        <div className="pt-composer-photo-preview">
          <img src={pendingPreviewUrl} alt="Photo to send" className={`pt-composer-photo-thumb ${isUploading ? 'is-uploading' : ''}`} />
          {isUploading
            ? <span className="pt-composer-photo-status">Sending…</span>
            : <button className="pt-composer-photo-clear" onClick={clearPendingFile} title="Remove">✕</button>
          }
        </div>
      )}
      {pendingInvoicePath && pendingInvoiceName && (
        <div className="pt-composer-photo-preview">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icons.doc size={16} />
            <button
              className="pt-link"
              style={{ fontSize: 12, fontWeight: 500 }}
              title="Preview PDF"
              onClick={async () => {
                const res = await fetch(`/api/invoices/preview?path=${encodeURIComponent(pendingInvoicePath)}`)
                if (res.ok) {
                  const { url } = await res.json() as { url: string }
                  window.open(url, '_blank', 'noopener')
                }
              }}
            >
              {pendingInvoiceName}
            </button>
          </div>
          {!isUploading && (
            <button className="pt-composer-photo-clear" onClick={clearPendingInvoice} title="Remove">✕</button>
          )}
          {isUploading && <span className="pt-composer-photo-status">Sending…</span>}
        </div>
      )}
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
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button
                className="pt-iconbtn"
                title="Attach photo"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-2.8-2.8L15 8.5"/></svg>
              </button>
            </>
            <button className="pt-iconbtn" title="Drop COA"><Icons.flask size={14} /></button>
            <button className="pt-iconbtn" title="Send wallet"><Icons.vault size={14} /></button>
            <span className="pt-composer-sep" />
            <button
              className={`pt-tag pt-tag-soft ${showTemplates ? 'is-on' : ''}`}
              title="Templates"
              onClick={() => setShowTemplates(v => !v)}
            >{'{{ template }}'}</button>
          </div>
          <div className="pt-composer-r">
            <span className="pt-composer-hint">⌘↵ to send</span>
            <button
              className={`pt-btn pt-btn-primary ${(isSending || isUploading) ? 'is-sending' : ''}`}
              onClick={() => { if (pendingFile) void sendPhoto(); else if (pendingInvoicePath) void sendInvoice(); else send() }}
              disabled={pendingFile ? isUploading : pendingInvoicePath ? isUploading : (!draft.trim() || isSending)}
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

function snoozeOptions() {
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0)
  const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + 7); nextWeek.setHours(9, 0, 0, 0)
  return [
    { label: '1 hour',        until: new Date(now.getTime() + 60 * 60 * 1000) },
    { label: '4 hours',       until: new Date(now.getTime() + 4 * 60 * 60 * 1000) },
    { label: 'Tomorrow 9am',  until: tomorrow },
    { label: 'Next week',     until: nextWeek },
  ]
}

function ConversationPane({ thread, messages, onSend, isSending, onCreateOrder }: {
  thread: InboxThread
  messages: InboxMessage[]
  onSend: (text: string) => void
  isSending: boolean
  onCreateOrder: () => void
}) {
  const { snooze, markDone, reopen } = useInbox()
  const [showSnooze, setShowSnooze] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const snoozeRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!lightboxUrl) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxUrl(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lightboxUrl])

  useEffect(() => {
    if (!showSnooze) return
    const handler = (e: MouseEvent) => {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setShowSnooze(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSnooze])
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
            </div>
          </div>
        </div>
        <div className="pt-ix-conv-actions">
          <div ref={snoozeRef} style={{ position: 'relative' }}>
            <button className="pt-btn pt-btn-ghost" onClick={() => setShowSnooze(v => !v)}>
              <Icons.clock size={12} /> Snooze
            </button>
            {showSnooze && (
              <div className="pt-snooze-menu">
                {snoozeOptions().map(opt => (
                  <button key={opt.label} className="pt-snooze-opt" onClick={() => { snooze(opt.until); setShowSnooze(false) }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="pt-btn pt-btn-ghost" onClick={onCreateOrder}>
            <Icons.box size={12} /> Order
          </button>
          {thread.status === 'resolved'
            ? <button className="pt-btn pt-btn-ghost" onClick={reopen}><Icons.rotate size={12} /> Reopen</button>
            : <button className="pt-btn pt-btn-ghost" onClick={markDone}><Icons.check size={12} /> Mark done</button>
          }
        </div>
      </div>

      <div ref={scrollRef} className="pt-ix-stream">
        {messages.map(m => <Bubble key={m.id} m={m} onImageClick={setLightboxUrl} />)}
      </div>

      {lightboxUrl && (
        <div className="pt-lightbox" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Photo" className="pt-lightbox-img" onClick={e => e.stopPropagation()} />
          <button className="pt-lightbox-close" onClick={() => setLightboxUrl(null)}>✕</button>
        </div>
      )}

      <Composer thread={thread} onSend={onSend} isSending={isSending} />
    </div>
  )
}

// ─── Conversation right rail ─────────────────────────────────────────────────

function ConversationRail({ thread }: { thread: InboxThread }) {
  const { notes, addNote } = useInbox()
  const [addingNote, setAddingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const trustCls = thread.trust >= 85 ? 'hi' : thread.trust >= 65 ? 'md' : 'lo'

  const submitNote = async () => {
    if (!noteText.trim()) return
    await addNote(noteText)
    setNoteText('')
    setAddingNote(false)
  }

  return (
    <aside className="pt-ix-rail">
      {/* Customer card */}
      <div className="pt-cust">
        <Link href={`/customers/${thread.customerId}`} className="pt-cust-hd" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="pt-cust-av" data-channel={thread.channel}>{initials(thread.name)}</div>
          <div className="pt-cust-id">
            <div className="pt-cust-name">{thread.name}</div>
            <div className="pt-cust-handle mono">{thread.handle}</div>
          </div>
          <div className={`pt-trust pt-trust-${trustCls}`}>
            <div className="pt-trust-num">{thread.trust}</div>
            <div className="pt-trust-lbl">trust</div>
          </div>
        </Link>
        <div className="pt-cust-stats">
          <div><div className="lbl">LTV</div><div className="val mono">${thread.ltv.toLocaleString()}</div></div>
          <div><div className="lbl">Channel</div><div className="val">{CH_NAMES[thread.channel]}</div></div>
        </div>
        <div className="pt-cust-tags">
          {thread.tags.map(tag => <span key={tag} className="pt-tag pt-tag-soft">{tag}</span>)}
        </div>
      </div>

      {/* Notes */}
      <div className="pt-right-section">
        <div className="pt-right-hd">
          <span>Notes</span>
          <button className="pt-right-add" onClick={() => { setAddingNote(v => !v); setNoteText('') }}>
            <Icons.plus size={11} />
          </button>
        </div>
        {addingNote && (
          <div className="pt-note-form">
            <textarea
              className="pt-note-input"
              placeholder="Add an internal note…"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className="pt-note-actions">
              <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => { setAddingNote(false); setNoteText('') }}>Cancel</button>
              <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={submitNote} disabled={!noteText.trim()}>Save</button>
            </div>
          </div>
        )}
        {notes.map(note => (
          <div key={note.id} className="pt-rail-note">
            <div className="pt-rail-note-meta">{fmtRelative(note.created_at)}</div>
            <div>{note.content}</div>
          </div>
        ))}
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

// ─── Inner layout (consumes context) ────────────────────────────────────────

function InboxLayout() {
  const { threads, activeId, setActiveId, filter, setFilter, messages, isSending, sendMessage } = useInbox()
  const activeThread = threads.find(t => t.id === activeId) ?? threads[0]
  const [showOrderRail, setShowOrderRail] = useState(false)

  useEffect(() => { setShowOrderRail(false) }, [activeId])

  return (
    <div className="pt-inbox">
      <ThreadColumn
        threads={threads}
        activeId={activeThread?.id ?? ''}
        onSelect={setActiveId}
        filter={filter}
        setFilter={setFilter}
      />
      {activeThread && (
        <ConversationPane
          thread={activeThread}
          messages={messages}
          onSend={sendMessage}
          isSending={isSending}
          onCreateOrder={() => setShowOrderRail(true)}
        />
      )}
      {activeThread && !showOrderRail && <ConversationRail thread={activeThread} />}
      {activeThread && showOrderRail && (
        <OrderRail
          customerId={activeThread.customerId}
          customerName={activeThread.name}
          conversationId={activeThread.id}
          onClose={() => setShowOrderRail(false)}
        />
      )}
    </div>
  )
}

// ─── Main InboxView ──────────────────────────────────────────────────────────

interface InboxViewProps {
  initialConversations: DbConversation[]
  quickReplies: DbQuickReply[]
  templates: DbTemplate[]
  initialResolvedCount?: number
  initialActiveId?: string
  initialInvoicePath?: string
  initialInvoiceName?: string
}

export function InboxView({ initialConversations, quickReplies, templates, initialResolvedCount = 0, initialActiveId, initialInvoicePath, initialInvoiceName }: InboxViewProps) {
  return (
    <InboxProvider
      initialConversations={initialConversations}
      quickReplies={quickReplies}
      templates={templates}
      initialResolvedCount={initialResolvedCount}
      initialActiveId={initialActiveId}
      initialInvoicePath={initialInvoicePath}
      initialInvoiceName={initialInvoiceName}
    >
      <InboxLayout />
    </InboxProvider>
  )
}
