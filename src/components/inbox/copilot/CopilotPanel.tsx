'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCopilotSession } from './CopilotSessionContext'
import type { CopilotMsg, CopilotToolCall } from './timeline'
import { formatAmount } from '@/lib/currency'

// Concrete "moves" — decisions with consequences. Prominent accent chips.
const ACTION_LABEL: Record<string, string> = {
  update_draft_order: 'Updated the draft order',
  set_shipping_address: 'Set shipping address',
  set_payment_asset: 'Set payment method',
  finalize_order: 'Finalized the order',
}

// Read tools — supporting activity ("showing its work"). Subtle, muted chips,
// in present-tense so the copilot reads like a live assistant.
const READ_LABEL: Record<string, string> = {
  get_conversation_messages: 'Reviewing the conversation',
  get_customer: 'Looking up customer details',
  query_customers: 'Looking up customer details',
  query_catalog: 'Checking the catalog',
  get_peptide_reference: 'Matching peptide names',
  get_draft_order: 'Checking the draft order',
  query_orders: 'Reviewing order history',
  get_order: 'Reviewing order history',
  get_analytics: 'Checking the numbers',
}

function Md({ text }: { text: string }) {
  return <div className="pt-cp-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>
}

function confirmSummary(tc: CopilotToolCall): string {
  if (tc.name === 'finalize_order') return 'Finalize this draft into a real order?'
  return `Run ${tc.name.replace(/_/g, ' ')}?`
}

function voiceOf(content: string): { kind: 'customer' | 'operator' | 'sent' | 'plain'; body: string } {
  if (content.startsWith('[CUSTOMER]')) return { kind: 'customer', body: content.slice(10).trim() }
  if (content.startsWith('[OPERATOR]')) return { kind: 'operator', body: content.slice(10).trim() }
  if (content.startsWith('[SENT]')) return { kind: 'sent', body: content.slice(6).trim() }
  return { kind: 'plain', body: content }
}

function timeOf(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

const SparkSvg = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z" fill="currentColor" />
  </svg>
)
const CheckSvg = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const SendSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4 12h13M12 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const SpinSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
)
const SearchSvg = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
    <path d="M20 20l-3.4-3.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

// The agent's running observations — its margin notes. Markdown-rendered.
function CommentaryEntry({ text, time }: { text: string; time: string }) {
  return (
    <div className="pt-cp-entry">
      <div className="pt-cp-note"><Md text={text} /></div>
      {time && <div className="pt-cp-time">{time}</div>}
    </div>
  )
}

// Read-tool activity — "showing its work". Subtle, muted, deduped per turn.
function ActivityEntry({ labels }: { labels: string[] }) {
  return (
    <div className="pt-cp-entry is-activity">
      <div className="pt-cp-chips">
        {labels.map((l, i) => (
          <span key={i} className="pt-cp-activity"><SearchSvg />{l}</span>
        ))}
      </div>
    </div>
  )
}

// Free-text the copilot writes directly to the operator (answers, suggested
// wording). Distinct from the margin-note commentary. Markdown-rendered.
function ReplyEntry({ text, time }: { text: string; time: string }) {
  return (
    <div className="pt-cp-entry is-reply">
      <div className="pt-cp-reply">
        <div className="pt-cp-reply-eyebrow">Copilot</div>
        <div className="pt-cp-reply-body"><Md text={text} /></div>
      </div>
      {time && <div className="pt-cp-time">{time}</div>}
    </div>
  )
}

function VoiceEntry({ kind, body, name }: { kind: 'customer' | 'operator' | 'sent'; body: string; name: string }) {
  const label = kind === 'customer' ? name : kind === 'operator' ? 'You' : 'Sent'
  return (
    <div className={`pt-cp-entry is-${kind === 'sent' ? 'sent' : 'voice'} pt-cp-voice-${kind}`}>
      <div className="pt-cp-voice-label">{label}</div>
      <div className="pt-cp-voice-body">{body}</div>
    </div>
  )
}

function ChipsEntry({ names }: { names: string[] }) {
  return (
    <div className="pt-cp-entry">
      <div className="pt-cp-chips">
        {names.map((n, i) => (
          <span key={i} className="pt-cp-chip"><SparkSvg />{ACTION_LABEL[n] ?? n.replace(/_/g, ' ')}</span>
        ))}
      </div>
    </div>
  )
}

function ConfirmEntry({ tc, onApprove, onDismiss, busy }: {
  tc: CopilotToolCall
  onApprove: (editedContent?: string) => void
  onDismiss: () => void
  busy: boolean
}) {
  const isSend = tc.name === 'send_message'
  const initial = isSend ? String((tc.input as { content?: string }).content ?? '') : ''
  const [edited, setEdited] = useState(initial)
  const resolved = tc.status === 'complete' || tc.status === 'rejected'

  if (isSend && !resolved) {
    return (
      <div className="pt-cp-entry">
        <div className="pt-cp-confirm">
          <div className="pt-cp-confirm-eyebrow">Reply to customer — review &amp; send</div>
          <textarea className="pt-cp-confirm-edit" value={edited} rows={3}
            onChange={e => setEdited(e.target.value)} aria-label="Message to send" />
          <div className="pt-cp-confirm-btns">
            <button className="pt-cp-approve" onClick={() => onApprove(edited)} disabled={busy || !edited.trim()}>Send</button>
            <button className="pt-cp-dismiss" onClick={onDismiss} disabled={busy}>Discard</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-cp-entry">
      <div className={`pt-cp-confirm${resolved ? ' is-resolved' : ''}`}>
        <div className="pt-cp-confirm-eyebrow">Needs your nod</div>
        <div className="pt-cp-confirm-summary">{confirmSummary(tc)}</div>
        {tc.status === 'pending' && (
          <div className="pt-cp-confirm-btns">
            <button className="pt-cp-approve" onClick={() => onApprove()} disabled={busy}>Approve</button>
            <button className="pt-cp-dismiss" onClick={onDismiss} disabled={busy}>Not now</button>
          </div>
        )}
        {tc.status === 'complete' && <div className="pt-cp-confirm-btns"><span className="pt-cp-confirm-done"><CheckSvg /> Done</span></div>}
        {tc.status === 'rejected' && <div className="pt-cp-confirm-btns"><span className="pt-cp-confirm-skip">Skipped</span></div>}
      </div>
    </div>
  )
}

/** Render one persisted agent turn into zero-or-more feed entries. */
function renderMessage(
  m: CopilotMsg, customerName: string,
  onConfirm: (messageId: string, toolCallId: string, confirmed: boolean, editedContent?: string) => void,
  confirmingIds: Set<string>,
) {
  if (m.role === 'user') {
    // Customer messages + operator-to-customer sends already live in the main
    // conversation window — don't duplicate them here. Only the operator's
    // direct commands to the copilot belong in this feed.
    const v = voiceOf(m.content ?? '')
    if (v.kind !== 'operator' || !v.body) return null
    return <VoiceEntry key={m.id} kind="operator" body={v.body} name={customerName} />
  }

  // assistant turn → activity (reads) + commentary + move chips + reply + confirm cards
  const nodes: React.ReactNode[] = []

  // reads → subtle "showing its work" chips, deduped by label within the turn
  const readLabels = [...new Set(
    m.toolCalls.filter(tc => tc.status !== 'pending' && READ_LABEL[tc.name]).map(tc => READ_LABEL[tc.name]),
  )]
  if (readLabels.length) nodes.push(<ActivityEntry key={`${m.id}-act`} labels={readLabels} />)

  // post_commentary → the agent's observations
  const commentaries = m.toolCalls.filter(tc => tc.name === 'post_commentary' && tc.status !== 'pending')
  for (const tc of commentaries) {
    const note = String((tc.input as { note?: string }).note ?? (tc.output as { note?: string } | null)?.note ?? '').trim()
    if (note) nodes.push(<CommentaryEntry key={`${m.id}-${tc.id}`} text={note} time={timeOf(m.createdAt)} />)
  }

  // write moves → prominent decision chips
  const actions = m.toolCalls.filter(tc => tc.status !== 'pending' && ACTION_LABEL[tc.name])
  if (actions.length) nodes.push(<ChipsEntry key={`${m.id}-chips`} names={actions.map(a => a.name)} />)

  // free-text content → a direct reply to the operator
  if (m.content?.trim()) nodes.push(<ReplyEntry key={`${m.id}-r`} text={m.content.trim()} time={timeOf(m.createdAt)} />)

  // gated tools → confirm cards
  const pending = m.toolCalls.filter(tc => tc.status === 'pending')
  const resolvedGated = m.toolCalls.filter(tc => (tc.status === 'complete' || tc.status === 'rejected') && (tc.name === 'finalize_order' || tc.name === 'send_message'))
  for (const tc of [...pending, ...resolvedGated]) {
    nodes.push(<ConfirmEntry key={`${m.id}-${tc.id}`} tc={tc} busy={confirmingIds.has(tc.id)}
      onApprove={(editedContent) => onConfirm(m.id, tc.id, true, editedContent)} onDismiss={() => onConfirm(m.id, tc.id, false)} />)
  }
  return nodes.length ? <div key={m.id}>{nodes}</div> : null
}

export function CopilotPanel({ customerName }: { customerName: string }) {
  const { messages, draftOrder, loading, sending, send, confirm } = useCopilotSession()
  const [draft, setDraft] = useState('')
  // Per-tool-call in-flight guard so an Approve/Dismiss can't double-fire while
  // the confirm round-trips (the card only flips status via realtime, which can
  // be seconds away). Cleared once the action resolves.
  const [confirming, setConfirming] = useState<Set<string>>(new Set())
  async function handleConfirm(messageId: string, toolCallId: string, confirmed: boolean, editedContent?: string) {
    if (confirming.has(toolCallId)) return
    setConfirming(s => new Set(s).add(toolCallId))
    try { await confirm(messageId, toolCallId, confirmed, editedContent) }
    finally { setConfirming(s => { const n = new Set(s); n.delete(toolCallId); return n }) }
  }
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, draftOrder])

  function submit() {
    const t = draft.trim()
    if (!t || sending) return
    setDraft('')
    void send(t)
  }

  const hasFeed = messages.some(m => {
    if (m.role === 'assistant') return m.content?.trim() || m.toolCalls.length
    return voiceOf(m.content ?? '').kind === 'operator'
  })
  const items = draftOrder?.order_items ?? []

  return (
    <div className={`pt-cp${sending ? ' is-working' : ''}`}>
      <div className="pt-cp-head">
        <span className="pt-cp-spark"><SparkSvg /></span>
        <div className="pt-cp-head-txt">
          <div className="pt-cp-name">Copilot</div>
          <div className="pt-cp-status">
            <span className="pt-cp-dot" />
            {sending ? 'Thinking…' : `Watching ${customerName}`}
          </div>
        </div>
      </div>

      <div className="pt-cp-feed" ref={feedRef}>
        {loading ? (
          <div className="pt-cp-thread">
            <div className="pt-cp-entry"><div className="pt-cp-skel" style={{ width: '80%' }} /></div>
            <div className="pt-cp-entry"><div className="pt-cp-skel" style={{ width: '55%' }} /></div>
          </div>
        ) : !hasFeed ? (
          <div className="pt-cp-empty">
            <span className="pt-cp-spark"><SparkSvg /></span>
            <div className="pt-cp-empty-title">Copilot is watching this conversation</div>
            <div className="pt-cp-empty-sub">It’ll flag buying signals, build the order, and line up the next move as the chat unfolds.</div>
          </div>
        ) : (
          <div className="pt-cp-thread">
            {messages.map(m => renderMessage(m, customerName, handleConfirm, confirming))}
          </div>
        )}
      </div>

      {items.length > 0 && draftOrder && (
        <div className="pt-cp-receipt">
          <div className="pt-cp-receipt-hd">
            <span>Draft order</span>
            <span className="pt-cp-receipt-ref">{draftOrder.ref_number}</span>
          </div>
          {items.map((it, i) => (
            <div className="pt-cp-line" key={i}>
              <span className="pt-cp-line-name"><span className="pt-cp-line-qty">{it.qty}×</span> {it.products?.name ?? it.product_id}</span>
              <span className="pt-cp-line-price">{formatAmount(it.qty * it.unit_price_snapshot, draftOrder.currency)}</span>
            </div>
          ))}
          <div className="pt-cp-receipt-total">
            <span className="pt-cp-receipt-total-l">Total</span>
            <span className="pt-cp-receipt-total-v">{formatAmount(draftOrder.payment_amount, draftOrder.currency)}</span>
          </div>
          {(!!draftOrder.payment_asset || (!!draftOrder.shipping_address && Object.keys(draftOrder.shipping_address as object).length > 0)) && (
            <div className="pt-cp-receipt-meta">
              {draftOrder.payment_asset && <span className="pt-cp-meta-chip">Pay: <b>{draftOrder.payment_asset}</b></span>}
              {!!draftOrder.shipping_address && Object.keys(draftOrder.shipping_address as object).length > 0 && <span className="pt-cp-meta-chip">Shipping set</span>}
            </div>
          )}
        </div>
      )}

      <div className="pt-cp-composer">
        <input
          className="pt-cp-input"
          placeholder="Direct the copilot…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        />
        <button className={`pt-cp-send${sending ? ' is-sending' : ''}`} onClick={submit} disabled={!draft.trim() || sending} aria-label="Send">
          {sending ? <SpinSvg /> : <SendSvg />}
        </button>
      </div>
    </div>
  )
}
