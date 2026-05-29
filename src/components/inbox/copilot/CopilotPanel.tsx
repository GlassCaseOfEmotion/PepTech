'use client'

import { useEffect, useRef, useState } from 'react'
import { useCopilotSession } from './useCopilotSession'
import type { CopilotMsg, CopilotToolCall } from './timeline'
import { formatAmount } from '@/lib/currency'

// Tools that are concrete "moves" worth surfacing as chips. Pure reads
// (query_*, get_*) stay invisible — the feed is about narration + decisions.
const ACTION_LABEL: Record<string, string> = {
  update_draft_order: 'Updated the draft order',
  set_shipping_address: 'Set shipping address',
  set_payment_asset: 'Set payment method',
  finalize_order: 'Finalized the order',
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

function CommentaryEntry({ text, time }: { text: string; time: string }) {
  return (
    <div className="pt-cp-entry">
      <div className="pt-cp-note">{text}</div>
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
  tc: CopilotToolCall; onApprove: () => void; onDismiss: () => void; busy: boolean
}) {
  const resolved = tc.status === 'complete' || tc.status === 'rejected'
  return (
    <div className={`pt-cp-entry`}>
      <div className={`pt-cp-confirm${resolved ? ' is-resolved' : ''}`}>
        <div className="pt-cp-confirm-eyebrow">Needs your nod</div>
        <div className="pt-cp-confirm-summary">{confirmSummary(tc)}</div>
        {tc.status === 'pending' && (
          <div className="pt-cp-confirm-btns">
            <button className="pt-cp-approve" onClick={onApprove} disabled={busy}>Approve</button>
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
  onConfirm: (messageId: string, toolCallId: string, confirmed: boolean) => void,
  busy: boolean,
) {
  if (m.role === 'user') {
    // Customer messages + operator-to-customer sends already live in the main
    // conversation window — don't duplicate them here. Only the operator's
    // direct commands to the copilot belong in this feed.
    const v = voiceOf(m.content ?? '')
    if (v.kind !== 'operator' || !v.body) return null
    return <VoiceEntry key={m.id} kind="operator" body={v.body} name={customerName} />
  }

  // assistant turn → commentary + post_commentary notes + action chips + confirm cards
  const nodes: React.ReactNode[] = []
  if (m.content?.trim()) nodes.push(<CommentaryEntry key={`${m.id}-c`} text={m.content.trim()} time={timeOf(m.createdAt)} />)

  const pending = m.toolCalls.filter(tc => tc.status === 'pending')
  const commentaries = m.toolCalls.filter(tc => tc.name === 'post_commentary' && tc.status !== 'pending')
  const actions = m.toolCalls.filter(tc => tc.status !== 'pending' && tc.name !== 'post_commentary' && ACTION_LABEL[tc.name])
  const resolvedGated = m.toolCalls.filter(tc => (tc.status === 'complete' || tc.status === 'rejected') && tc.name === 'finalize_order')

  for (const tc of commentaries) {
    const note = String((tc.input as { note?: string }).note ?? (tc.output as { note?: string } | null)?.note ?? '').trim()
    if (note) nodes.push(<CommentaryEntry key={`${m.id}-${tc.id}`} text={note} time={timeOf(m.createdAt)} />)
  }
  if (actions.length) nodes.push(<ChipsEntry key={`${m.id}-chips`} names={actions.map(a => a.name)} />)
  for (const tc of [...pending, ...resolvedGated]) {
    nodes.push(<ConfirmEntry key={`${m.id}-${tc.id}`} tc={tc} busy={busy}
      onApprove={() => onConfirm(m.id, tc.id, true)} onDismiss={() => onConfirm(m.id, tc.id, false)} />)
  }
  return nodes.length ? <div key={m.id}>{nodes}</div> : null
}

export function CopilotPanel({ conversationId, customerName }: { conversationId: string; customerName: string }) {
  const { messages, draftOrder, loading, sending, send, confirm } = useCopilotSession(conversationId)
  const [draft, setDraft] = useState('')
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
            {messages.map(m => renderMessage(m, customerName, confirm, sending))}
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
