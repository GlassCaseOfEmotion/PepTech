'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  sendSuggestionMessage,
  dismissSuggestion,
  commitDraftOrder,
} from '@/app/inbox/copilot-actions'
import type { SuggestionRow, DraftOrderPayload } from '@/types/copilot'
import { useInbox } from './InboxProvider'
import { formatAmount } from '@/lib/currency'

type CardState = 'idle' | 'confirming' | 'working' | 'done' | 'error'

const KIND_LABEL: Record<string, string> = {
  cross_sell: 'AI cross-sell',
  draft_order: 'AI draft order',
  quote: 'AI quote',
  reply: 'AI reply',
  payment_link: 'AI payment link',
}

function messageText(s: SuggestionRow): string {
  const p = s.payload
  if (s.kind === 'cross_sell') return String(p.offer_message ?? '')
  return String(p.message ?? '')
}

export function SuggestionCard({ suggestion, onRemove }: {
  suggestion: SuggestionRow
  onRemove: (id: string) => void
}) {
  const { baseCurrency } = useInbox()
  const isMessageKind = suggestion.kind === 'reply' || suggestion.kind === 'quote' || suggestion.kind === 'cross_sell'
  const [state, setState] = useState<CardState>('idle')
  const [edited, setEdited] = useState(messageText(suggestion))
  const [isEditing, setIsEditing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const router = useRouter()

  function handleDismiss() {
    onRemove(suggestion.id)
    dismissSuggestion(suggestion.id).catch(() => {})
  }

  async function handleSendMessage() {
    if (state === 'working') return
    setIsEditing(false)
    setState('working')
    const result = await sendSuggestionMessage(suggestion.id, edited)
      .catch(e => ({ error: e instanceof Error ? e.message : 'Unknown error' }))
    if ('error' in result) { setErrorMessage(result.error); setState('error') }
    else { setState('done'); setTimeout(() => onRemove(suggestion.id), 1200) }
  }

  async function handleCommitOrder() {
    if (state === 'working') return
    setState('working')
    const result = await commitDraftOrder(suggestion.id)
      .catch(e => ({ error: e instanceof Error ? e.message : 'Unknown error' }))
    if ('error' in result) { setErrorMessage(result.error); setState('error') }
    else { setState('done'); setTimeout(() => onRemove(suggestion.id), 1400) }
  }

  const confidencePct = Math.round(suggestion.confidence * 100)

  return (
    <div className={`pt-sug pt-sug-${suggestion.kind}`}>
      <div className="pt-sug-head">
        <span className="pt-sug-kind">{KIND_LABEL[suggestion.kind] ?? 'AI suggestion'}</span>
        <span className="pt-sug-conf" title="Model confidence">{confidencePct}%</span>
        <button className="pt-sug-dismiss" onClick={handleDismiss} title="Dismiss">✕</button>
      </div>

      {suggestion.reasoning && <div className="pt-sug-reason">{suggestion.reasoning}</div>}

      {isMessageKind && (
        <>
          {state === 'confirming' && isEditing ? (
            <textarea
              className="pt-sug-edit-ta"
              value={edited}
              onChange={e => setEdited(e.target.value)}
              onBlur={() => setIsEditing(false)}
              autoFocus
              rows={4}
            />
          ) : (
            <div
              className="pt-sug-msg"
              onClick={() => { if (state === 'confirming') setIsEditing(true) }}
              title={state === 'confirming' ? 'Click to edit' : undefined}
            >
              {edited}
            </div>
          )}
        </>
      )}

      {suggestion.kind === 'draft_order' && (
        <DraftOrderBody payload={suggestion.payload as unknown as DraftOrderPayload} currency={baseCurrency} />
      )}

      {state === 'idle' && (
        <div className="pt-sug-foot">
          {isMessageKind && (
            <button className="pt-sug-primary" onClick={() => setState('confirming')}>Review &amp; send →</button>
          )}
          {suggestion.kind === 'draft_order' && (
            <button className="pt-sug-primary" onClick={handleCommitOrder}>Create order →</button>
          )}
          {suggestion.kind === 'payment_link' && (
            <button className="pt-sug-primary" disabled title="Coming soon">Payment link</button>
          )}
        </div>
      )}

      {state === 'confirming' && (
        <div className="pt-sug-foot">
          <button className="pt-sug-primary" onClick={handleSendMessage} disabled={!edited.trim()}>Send</button>
          <button className="pt-sug-cancel" onClick={() => { setState('idle'); setIsEditing(false); setEdited(messageText(suggestion)) }}>Cancel</button>
        </div>
      )}

      {state === 'working' && <div className="pt-sug-status">Working…</div>}
      {state === 'done' && <div className="pt-sug-status pt-sug-done">✓ Done</div>}
      {state === 'error' && (
        <div className="pt-sug-foot">
          <div className="pt-sug-err">{errorMessage}</div>
          <button className="pt-sug-cancel" onClick={() => { setState('idle'); setErrorMessage('') }}>Retry</button>
          <button className="pt-sug-cancel" onClick={() => router.push(`/inbox?conversation=${suggestion.conversationId}`)}>Open chat</button>
        </div>
      )}
    </div>
  )
}

function DraftOrderBody({ payload, currency }: { payload: DraftOrderPayload; currency: string }) {
  return (
    <div className="pt-sug-order">
      {(payload.items ?? []).map((it, i) => (
        <div key={i} className="pt-sug-order-line">
          <span className="pt-sug-order-name">{it.qty}× {it.product_name}</span>
          <span className="pt-sug-order-price">{formatAmount(it.qty * it.unit_price, currency)}</span>
        </div>
      ))}
      <div className="pt-sug-order-total">
        <span>Total</span><span>{formatAmount(Number(payload.total ?? 0), currency)}</span>
      </div>
    </div>
  )
}
