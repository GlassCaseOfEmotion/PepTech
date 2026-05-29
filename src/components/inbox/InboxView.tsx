'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { useSearchParams, useRouter } from 'next/navigation'
import { formatAmount, formatAmountCompact } from '@/lib/currency'
import { InboxProvider, useInbox } from './InboxProvider'
import { CopilotSuggestions } from './CopilotSuggestions'
import { TemplatePicker } from './TemplatePicker'
import { WaTemplatePicker } from './WaTemplatePicker'
import { ProductInfoPicker } from './ProductInfoPicker'
import type { DbConversation, DbQuickReply, DbTemplate, InboxThread, InboxMessage } from '@/types/inbox'
import type { QueuedRun } from '@/types/automations'
import { PendingApprovalRow } from '@/components/shared/PendingApprovalRow'
import { CollapsiblePendingApprovals } from './CollapsiblePendingApprovals'
import { AcquisitionSourceBanner } from '@/components/inbox/AcquisitionSourceBanner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConvertToCustomerButton } from '@/components/contacts/ConvertToCustomerButton'
import { RailStrip, type RailPanel } from './RailStrip'
import { RailPanelHost } from './RailPanelHost'
import { ViewsColumn } from './ViewsColumn'
import { useViewsCollapsed } from './useViewsCollapsed'
import { CH_NAMES } from './inbox-shared'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'

function fmtMins(m: number) {
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h`
  return `${Math.floor(m / 1440)}d`
}

// ─── Thread item ─────────────────────────────────────────────────────────────

function IxThread({ t, active, onClick }: { t: InboxThread; active: boolean; onClick: () => void }) {
  const { togglePin } = useInbox()
  return (
    <li className={`pt-ixt ${active ? 'is-active' : ''} ${t.unread ? 'is-unread' : ''} ${t.status === 'snoozed' ? 'is-snoozed' : ''} ${t.pinned ? 'is-pinned' : ''}`} onClick={onClick}>
      <Avatar name={t.name} channel={t.channel} size={34} />
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
          {t.status === 'snoozed' && <Badge tone="neutral">⏰ snoozed</Badge>}
          {t.lifecycleStage === 'lead' && <Badge tone="lead">Lead</Badge>}
          {t.tags.includes('vip') && <Badge tone="vip">VIP</Badge>}
          {t.tags.includes('new') && <Badge tone="new">new</Badge>}
          {t.tags.includes('waitlist') && <Badge tone="neutral">waitlist</Badge>}
          {t.tags.includes('payment') && <Badge tone="warn">payment</Badge>}
          {t.tags.includes('repeat') && !t.tags.includes('vip') && <Badge tone="neutral">repeat</Badge>}
          {t.tags.includes('shipping') && <Badge tone="neutral">shipping</Badge>}
          {t.tags.includes('reorder') && <Badge tone="neutral">reorder</Badge>}
          <span className="pt-ixt-trust mono">trust {t.trust}</span>
        </div>
      </div>
    </li>
  )
}

// ─── Thread column ───────────────────────────────────────────────────────────

function ThreadColumn({ threads, activeId, onSelect, filter, setFilter, hasChannels, queuedRuns }: {
  threads: InboxThread[]; activeId: string; onSelect: (id: string) => void
  filter: string; setFilter: (f: string) => void; hasChannels: boolean; queuedRuns: QueuedRun[]
}) {
  const { resolvedCount, view } = useInbox()
  const [search, setSearch] = useState('')
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

  const [pending, setPending] = useState<QueuedRun[]>(queuedRuns)

  const visible = threads.filter(t => {
    if (filter === 'all') { if (t.status === 'resolved') return false }
    else if (t.status !== filter) return false
    // Views lens (single-select): lifecycle or channel
    if (view === 'lead' && t.lifecycleStage !== 'lead') return false
    if (view === 'customer' && t.lifecycleStage !== 'customer') return false
    if ((view === 'wa' || view === 'tg' || view === 'em') && t.channel !== view) return false
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
      {pending.length > 0 && (
        <CollapsiblePendingApprovals count={pending.length}>
          {pending.map(r => (
            <PendingApprovalRow key={r.id} run={r} onRemove={id => setPending(p => p.filter(r => r.id !== id))} />
          ))}
        </CollapsiblePendingApprovals>
      )}
      <div className="pt-ix-filters">
        {filters.map(f => (
          <button key={f.id} className={`pt-pill ${filter === f.id ? 'is-on' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}<span className="pt-pill-num">{f.count}</span>
          </button>
        ))}
      </div>
      <ul className="pt-ix-threads">
        {visible.map(t => <IxThread key={t.id} t={t} active={t.id === activeId} onClick={() => onSelect(t.id)} />)}
        {visible.length === 0 && (
          <li className="pt-ix-empty" style={{ padding: 0, listStyle: 'none' }}>
            {filter === 'all' && (
              hasChannels ? (
                <EmptyState
                  size="md"
                  icon={
                    <svg width="56" height="42" viewBox="0 0 56 42" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="6" width="52" height="34" rx="4" strokeWidth="1.2"/>
                      <path d="M2 16l26 17 26-17" strokeWidth="1"/>
                      <path d="M2 6l26 20L54 6" strokeWidth="0.8" opacity="0.35"/>
                      <circle cx="46" cy="9" r="7" fill="currentColor" opacity="0.07" strokeWidth="0"/>
                      <circle cx="46" cy="9" r="7" strokeWidth="1.1" opacity="0.45"/>
                      <polyline points="42,9 45,12 50,5" strokeWidth="1.3" opacity="0.65"/>
                    </svg>
                  }
                  title="Inbox is clear"
                  body="New conversations appear here when customers reach out via any connected channel."
                />
              ) : (
                <EmptyState
                  size="md"
                  icon={
                    <svg width="56" height="48" viewBox="0 0 56 48" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="10" width="52" height="34" rx="4" strokeWidth="1.2"/>
                      <path d="M2 20l26 17 26-17" strokeWidth="1"/>
                      <path d="M2 10l26 20L54 10" strokeWidth="0.8" opacity="0.35"/>
                      <circle cx="43" cy="10" r="9" fill="var(--pt-warn-soft)" stroke="var(--pt-warn)" strokeWidth="0"/>
                      <circle cx="43" cy="10" r="9" stroke="var(--pt-warn)" strokeWidth="1.1"/>
                      <line x1="43" y1="6.5" x2="43" y2="11" stroke="var(--pt-warn)" strokeWidth="1.3"/>
                      <circle cx="43" cy="13.2" r="0.9" fill="var(--pt-warn)" stroke="none"/>
                    </svg>
                  }
                  title="No channels connected"
                  body="Connect WhatsApp, Telegram or email to start receiving customer messages."
                  action={{ label: 'Connect a channel →', href: '/settings/channels' }}
                />
              )
            )}
            {filter === 'needs_reply' && (
              <EmptyState
                size="md"
                icon={
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6h28a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H10l-6 5V8a2 2 0 0 1 2-2z"/>
                    <line x1="10" y1="13" x2="26" y2="13" opacity="0.45"/>
                    <line x1="10" y1="18" x2="20" y2="18" opacity="0.3"/>
                  </svg>
                }
                title="Nothing needs a reply"
              />
            )}
            {filter === 'new' && (
              <EmptyState
                size="md"
                icon={
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                    <circle cx="18" cy="18" r="13"/>
                    <line x1="18" y1="12" x2="18" y2="24"/>
                    <line x1="12" y1="18" x2="24" y2="18"/>
                  </svg>
                }
                title="No new conversations"
              />
            )}
            {filter === 'snoozed' && (
              <EmptyState
                size="md"
                icon={
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                    <circle cx="18" cy="19" r="13"/>
                    <polyline points="18,11 18,19 23,22"/>
                    <line x1="10" y1="5" x2="15" y2="9" opacity="0.4"/>
                    <line x1="26" y1="5" x2="21" y2="9" opacity="0.4"/>
                  </svg>
                }
                title="No snoozed conversations"
              />
            )}
            {filter === 'resolved' && (
              <EmptyState
                size="md"
                icon={
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="18" r="13"/>
                    <polyline points="11,18 16,23 25,13"/>
                  </svg>
                }
                title="No resolved conversations"
              />
            )}
          </li>
        )}
      </ul>
    </div>
  )
}

// ─── WhatsApp window status hook ─────────────────────────────────────────────

function useWindowStatus(windowExpiresAt: string | null, channel: string) {
  const [status, setStatus] = useState<'none' | 'active' | 'expired'>('none')
  const [timeLeft, setTimeLeft] = useState('')
  useEffect(() => {
    if (channel !== 'wa' || !windowExpiresAt) { setStatus('none'); return }
    const tick = () => {
      const ms = new Date(windowExpiresAt).getTime() - Date.now()
      if (ms <= 0) { setStatus('expired'); setTimeLeft(''); return }
      setStatus('active')
      const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000)
      setTimeLeft(h > 0 ? `${h}h ${m}m` : `${m}m`)
    }
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [windowExpiresAt, channel])
  return { status, timeLeft }
}

// ─── Message bubbles ─────────────────────────────────────────────────────────

function Bubble({ m, onImageClick, onOpenWaPicker }: { m: InboxMessage; onImageClick?: (url: string) => void; onOpenWaPicker?: () => void }) {
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
            <img src={url} alt="Photo" className="pt-bubble-img" loading="lazy" />
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

  if (m.kind === 'invoice') {
    const invoicePath = m.metadata?.invoicePath as string | undefined
    const invoiceName = m.metadata?.invoiceName as string | undefined
    const openPreview = async () => {
      if (!invoicePath) return
      const res = await fetch(`/api/invoices/preview?path=${encodeURIComponent(invoicePath)}`)
      if (res.ok) {
        const { url } = await res.json() as { url: string }
        window.open(url, '_blank', 'noopener')
      }
    }
    return (
      <div className={`pt-bubble pt-bubble-${m.from}`}>
        <button className="pt-bubble-invoice" onClick={openPreview} title="Open PDF">
          <Icons.doc size={15} />
          <span>{invoiceName ?? 'Invoice'}</span>
        </button>
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
        {m.from === 'me' && !m.optimistic && m.status === 'delivered' && <span className="pt-bubble-read"> · delivered</span>}
        {m.from === 'me' && !m.optimistic && m.status === 'read' && <span className="pt-bubble-read"> · read</span>}
        {m.from === 'me' && !m.optimistic && (m.status === 'sent' || !m.status) && <span className="pt-bubble-pending"> · sent</span>}
      </div>
      {m.status === 'failed' && m.error === 'window_expired' && (
        <div className="pt-ix-msg-error">
          <span>✕ Not delivered · WhatsApp window expired</span>
          <button className="pt-link" onClick={() => onOpenWaPicker?.()}>Send as template →</button>
        </div>
      )}
      {m.status === 'failed' && !m.error && (
        <div className="pt-ix-msg-error">
          <span>✕ Not delivered</span>
          <button className="pt-link" onClick={() => onOpenWaPicker?.()}>Send as template →</button>
        </div>
      )}
    </div>
  )
}

// ─── Composer ────────────────────────────────────────────────────────────────

function Composer({ thread, onSend, isSending, initialText, showTemplates, onShowTemplatesChange }: { thread: InboxThread; onSend: (text: string) => void; isSending: boolean; initialText?: string; showTemplates?: boolean; onShowTemplatesChange?: (v: boolean) => void }) {
  const { quickReplies, templates, activeId, pendingInvoicePath, pendingInvoiceName, clearPendingInvoice } = useInbox()
  const [draft, setDraft] = useState(initialText ?? '')

  useEffect(() => {
    if (initialText) {
      setDraft(initialText)
      const url = new URL(window.location.href)
      url.searchParams.delete('prefill')
      window.history.replaceState({}, '', url.toString())
    }
  }, []) // intentionally empty — only runs on mount
  const [localShowTemplates, setLocalShowTemplates] = useState(false)
  const effectiveShowTemplates = showTemplates ?? localShowTemplates
  const setEffectiveShowTemplates = (v: boolean) => {
    setLocalShowTemplates(v)
    onShowTemplatesChange?.(v)
  }
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [pendingAttachment, setPendingAttachment] = useState<{ storagePath: string; label: string; bucket: 'coa' | 'product-media' } | null>(null)

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

  const sendAttachment = useCallback(async () => {
    if (!pendingAttachment || !activeId) return
    setIsUploading(true)
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeId,
          storagePath: pendingAttachment.storagePath,
          bucket: pendingAttachment.bucket,
        }),
      })
      if (!res.ok) {
        console.error('Attachment send failed:', res.status)
        return
      }
      setPendingAttachment(null)
    } finally {
      setIsUploading(false)
    }
  }, [pendingAttachment, activeId])

  const sendTextThenAttachment = useCallback(async () => {
    if (draft.trim()) {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, content: draft }),
      })
      if (!res.ok) return
      setDraft('')
    }
    await sendAttachment()
  }, [draft, activeId, sendAttachment])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (pendingFile) void sendPhoto()
      else if (pendingInvoicePath) void sendInvoice()
      else if (pendingAttachment) void sendTextThenAttachment()
      else send()
    }
  }

  const insertQuick = (content: string) => {
    setDraft(d => d ? `${d}\n\n${content}` : content)
    setTimeout(() => taRef.current?.focus(), 0)
  }

  return (
    <div className="pt-ix-composer">
      {effectiveShowTemplates && (
        <TemplatePicker
          templates={templates}
          onSelect={content => { setDraft(d => d ? `${d}\n\n${content}` : content); setTimeout(() => taRef.current?.focus(), 0) }}
          onClose={() => setEffectiveShowTemplates(false)}
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
        <span className="pt-quicks-sep" />
        <button className="pt-quick pt-quick-product" onClick={() => setShowProductPicker(true)}>
          ⬡ Product info
        </button>
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
      {pendingAttachment && (
        <div className="pt-composer-photo-preview">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icons.doc size={16} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>{pendingAttachment.label}</span>
          </div>
          {!isUploading && (
            <button className="pt-composer-photo-clear" onClick={() => setPendingAttachment(null)} title="Remove">✕</button>
          )}
          {isUploading && <span className="pt-composer-photo-status">Sending…</span>}
        </div>
      )}
      {showProductPicker && (
        <ProductInfoPicker
          onInsert={(text) => {
            setDraft(d => d ? `${d}\n\n${text}` : text)
            setShowProductPicker(false)
          }}
          onAttachFile={(storagePath, label, bucket) => {
            setPendingAttachment({ storagePath, label, bucket })
            setShowProductPicker(false)
          }}
          onClose={() => setShowProductPicker(false)}
        />
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
            <button className="pt-iconbtn pt-iconbtn-product" title="Insert product info" onClick={() => setShowProductPicker(true)}><Icons.flask size={14} /></button>
            <button className="pt-iconbtn" title="Send wallet"><Icons.vault size={14} /></button>
            <span className="pt-composer-sep" />
            <button
              className={`pt-tag pt-tag-soft ${effectiveShowTemplates ? 'is-on' : ''}`}
              title="Templates"
              onClick={() => setEffectiveShowTemplates(!effectiveShowTemplates)}
            >{'{{ template }}'}</button>
          </div>
          <div className="pt-composer-r">
            <span className="pt-composer-hint">⌘↵ to send</span>
            <button
              className={`pt-btn pt-btn-primary ${(isSending || isUploading) ? 'is-sending' : ''}`}
              onClick={() => { if (pendingFile) void sendPhoto(); else if (pendingInvoicePath) void sendInvoice(); else if (pendingAttachment) void sendTextThenAttachment(); else send() }}
              disabled={pendingFile ? isUploading : pendingInvoicePath ? isUploading : pendingAttachment ? isUploading : (!draft.trim() || isSending)}
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

function ConversationPane({ thread, messages, onSend, isSending, onCreateOrder, onBack, initialPrefill, baseCurrency, operatorName }: {
  thread: InboxThread
  messages: InboxMessage[]
  onSend: (text: string) => void
  isSending: boolean
  onCreateOrder: () => void
  onBack: () => void
  initialPrefill?: string
  baseCurrency: string
  operatorName: string
}) {
  const { snooze, markDone, reopen, messagesLoading, updateThreadLifecycle, updateThreadAcquisitionSource, suggestions } = useInbox()
  const [showSnooze, setShowSnooze] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [showWaPicker, setShowWaPicker] = useState(false)
  const { status: windowStatus, timeLeft } = useWindowStatus(thread.windowExpiresAt, thread.channel)
  const snoozeRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const prevMsgCountRef = useRef(0)

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
  // On thread switch: always scroll to bottom after DOM updates
  useEffect(() => {
    prevMsgCountRef.current = 0
    isNearBottomRef.current = true
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }, [thread.id])

  // On new message: only scroll if already near the bottom
  useEffect(() => {
    if (messages.length <= prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length
      return
    }
    prevMsgCountRef.current = messages.length
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  return (
    <div className={`pt-ix-conv pt-ix-${thread.channel}`}>
      <div className="pt-ix-conv-hd">
        <button className="pt-ix-conv-back" onClick={onBack} title="Back to inbox">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div className="pt-ix-conv-id">
          <Avatar name={thread.name} channel={thread.channel as 'wa' | 'tg' | 'em'} size={30} />
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
          {thread.lifecycleStage === 'lead' && (
            <ConvertToCustomerButton
              customerId={thread.customerId}
              currentStage="lead"
              onSuccess={() => updateThreadLifecycle(thread.id, 'customer')}
            />
          )}
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

      {messagesLoading && messages.length === 0 ? (
        <div className="pt-ix-stream-loading">
          <div className="pt-lightbox-spinner" />
        </div>
      ) : (
        <div
          key={thread.id}
          ref={scrollRef}
          className="pt-ix-stream"
          onScroll={() => {
            if (!scrollRef.current) return
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
            isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100
          }}
        >
          {messages.map((m, i, arr) => {
            // Avatar on the last message of each consecutive same-sender run
            // (standard chat grouping); a spacer holds the column on the rest.
            const lastOfGroup = i === arr.length - 1 || arr[i + 1].from !== m.from
            return (
              <div key={m.id} className={`pt-msg-row pt-msg-row-${m.from}`}>
                {lastOfGroup
                  ? (m.from === 'them'
                      ? <Avatar name={thread.name} size={20} />
                      : <Avatar name={operatorName} size={20} />)
                  : <span className="pt-msg-avatar-spacer" aria-hidden />}
                <Bubble m={m} onImageClick={setLightboxUrl} onOpenWaPicker={() => setShowWaPicker(true)} />
              </div>
            )
          })}
          <CopilotSuggestions
            suggestions={suggestions.filter(s => s.conversationId === thread.id)}
            variant="inline"
          />
        </div>
      )}

      {windowStatus === 'active' && (
        <div className="pt-ix-window-banner is-active">
          ⏱ WhatsApp window closes in {timeLeft}
        </div>
      )}
      {windowStatus === 'expired' && (
        <div className="pt-ix-window-banner is-expired">
          ⚠ 24hr window expired — use a template to reach this customer
          <button className="pt-link" onClick={() => setShowWaPicker(true)}>
            Send template →
          </button>
        </div>
      )}

      {lightboxUrl && (
        <div className="pt-lightbox" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Photo" className="pt-lightbox-img" onClick={e => e.stopPropagation()} />
          <button className="pt-lightbox-close" onClick={() => setLightboxUrl(null)}>✕</button>
        </div>
      )}

      {showWaPicker && <WaTemplatePicker onClose={() => setShowWaPicker(false)} />}

      <div className={`pt-ix-mobile-sheet${sheetExpanded ? ' pt-ix-mobile-sheet-expanded' : ''}`}>
        <div
          className="pt-ix-mobile-sheet-peek"
          onClick={() => setSheetExpanded(o => !o)}
        >
          <span className="pt-ix-mobile-sheet-name">{thread.name}</span>
          <span className="pt-ix-mobile-sheet-meta">
            LTV {formatAmountCompact(thread.ltv, baseCurrency)} · Trust {thread.trust}
          </span>
          <span className="pt-ix-mobile-sheet-chevron">▾</span>
        </div>
        <div className="pt-ix-mobile-sheet-body">
          <div className="pt-ix-mobile-detail-row">
            <span className="pt-ix-mobile-detail-key">LTV</span>
            <span className="pt-ix-mobile-detail-val">{formatAmount(thread.ltv, baseCurrency)}</span>
          </div>
          <div className="pt-ix-mobile-detail-row">
            <span className="pt-ix-mobile-detail-key">Trust</span>
            <span className="pt-ix-mobile-detail-val">{thread.trust} / 100</span>
          </div>
          <div className="pt-ix-mobile-detail-row">
            <span className="pt-ix-mobile-detail-key">Tags</span>
            <span className="pt-ix-mobile-detail-val">
              {thread.tags.length > 0 ? thread.tags.join(', ') : '—'}
            </span>
          </div>
        </div>
      </div>

      <AcquisitionSourceBanner
        customerId={thread.customerId}
        currentSource={thread.acquisitionSource}
        lifecycleStage={thread.lifecycleStage}
        onSuccess={(source) => updateThreadAcquisitionSource(thread.id, source)}
      />
      <Composer thread={thread} onSend={onSend} isSending={isSending} initialText={initialPrefill} />
    </div>
  )
}

// ─── Inner layout (consumes context) ────────────────────────────────────────

function InboxLayout({ initialPrefill, baseCurrency, hasChannels, queuedRuns, operatorName }: { initialPrefill?: string; baseCurrency: string; hasChannels: boolean; queuedRuns: QueuedRun[]; operatorName: string }) {
  const { threads, activeId, setActiveId, filter, setFilter, messages, isSending, sendMessage } = useInbox()
  const activeThread = threads.find(t => t.id === activeId) ?? threads[0]
  const [activePanel, setActivePanel] = useState<RailPanel | null>(null)
  const { collapsed: viewsCollapsed, toggle: toggleViews } = useViewsCollapsed()
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedConvId = searchParams.get('conversation')

  useEffect(() => { setActivePanel(null) }, [activeId])

  const handleSelect = useCallback((id: string) => {
    setActiveId(id)
    router.replace(`?conversation=${id}`, { scroll: false })
  }, [setActiveId, router])

  const handleBack = useCallback(() => {
    router.replace('?', { scroll: false })
  }, [router])

  return (
    <div className={`pt-inbox${selectedConvId ? ' has-conversation' : ''}${activePanel ? ' is-panel-open' : ''}${viewsCollapsed ? ' is-views-collapsed' : ''}`}>
      <ViewsColumn collapsed={viewsCollapsed} onToggle={toggleViews} />
      <ThreadColumn
        threads={threads}
        activeId={activeThread?.id ?? ''}
        onSelect={handleSelect}
        filter={filter}
        setFilter={setFilter}
        hasChannels={hasChannels}
        queuedRuns={queuedRuns}
      />
      {activeThread && (
        <ConversationPane
          thread={activeThread}
          messages={messages}
          onSend={sendMessage}
          isSending={isSending}
          onCreateOrder={() => setActivePanel('order')}
          onBack={handleBack}
          initialPrefill={initialPrefill}
          baseCurrency={baseCurrency}
          operatorName={operatorName}
        />
      )}
      {activeThread && (
        <div className={`pt-ix-rail-region${activePanel ? ' is-open' : ''}`}>
          {activePanel && (
            <RailPanelHost
              panel={activePanel}
              thread={activeThread}
              baseCurrency={baseCurrency}
              onClose={() => setActivePanel(null)}
            />
          )}
          <RailStrip active={activePanel} onSelect={(p) => setActivePanel(cur => cur === p ? null : p)} />
        </div>
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
  initialPrefill?: string
  baseCurrency: string
  hasChannels?: boolean
  queuedRuns?: QueuedRun[]
  operatorName?: string
}

export function InboxView({ initialConversations, quickReplies, templates, initialResolvedCount = 0, initialActiveId, initialInvoicePath, initialInvoiceName, initialPrefill, baseCurrency, hasChannels = true, queuedRuns = [], operatorName = 'You' }: InboxViewProps) {
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
      <Suspense fallback={null}>
        <InboxLayout initialPrefill={initialPrefill} baseCurrency={baseCurrency} hasChannels={hasChannels} queuedRuns={queuedRuns} operatorName={operatorName} />
      </Suspense>
    </InboxProvider>
  )
}
