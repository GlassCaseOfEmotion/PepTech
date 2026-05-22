'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveAndSendQueuedRun, dismissQueuedRun } from '@/app/automations/actions'
import type { QueuedRun } from '@/types/automations'

type SendState = 'idle' | 'confirming' | 'sending' | 'sent' | 'error'

function friendlyError(code: string): string {
  if (code === 'window_expired')
    return 'The 24-hour window has expired. Customer must message first.'
  if (code.includes('not connected') || code.toLowerCase().includes('channel'))
    return 'Channel disconnected — check Settings.'
  if (code.includes('not found') || code.includes('Conversation'))
    return 'Conversation no longer exists.'
  if (code.includes('Unauthorized'))
    return 'Session expired — please refresh.'
  return 'Could not deliver. Open chat to send manually.'
}

export function PendingApprovalCard({ run, onRemove }: {
  run: QueuedRun
  onRemove: (id: string) => void
}) {
  const [state, setState] = useState<SendState>('idle')
  const [editedMessage, setEditedMessage] = useState(run.message)
  const [isEditing, setIsEditing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const router = useRouter()

  async function handleSend() {
    setIsEditing(false)
    setState('sending')
    const result = await approveAndSendQueuedRun(run.id, editedMessage)
      .catch(e => ({ error: e instanceof Error ? e.message : 'Unknown error' }))
    if ('error' in result) {
      setErrorMessage(friendlyError(result.error))
      setState('error')
    } else {
      setState('sent')
    }
  }

  function handleDismiss() {
    onRemove(run.id)
    dismissQueuedRun(run.id).catch(() => {})
  }

  function handleNavigate() {
    onRemove(run.id)
    if (run.conversationId) {
      router.push(`/inbox?conversation=${run.conversationId}`)
    } else {
      router.push('/inbox')
    }
  }

  return (
    <div className="pt-pac">
      {state === 'idle' && (
        <>
          <button className="pt-pac-dismiss" onClick={handleDismiss} title="Dismiss">✕</button>
          <div className="pt-pac-head">
            <span className="pt-pac-auto">{run.automationName}</span>
            <span className="pt-pac-cust">{run.contextLabel ?? '—'}</span>
          </div>
          <div className="pt-pac-bubble">
            <div className="pt-pac-msg">{run.message}</div>
          </div>
          <div className="pt-pac-foot">
            <button className="pt-pac-send-btn" onClick={() => setState('confirming')}>
              Review &amp; Send →
            </button>
          </div>
        </>
      )}

      {state === 'confirming' && (
        <div className="pt-pac-overlay">
          <div className="pt-pac-overlay-lbl">
            {isEditing ? 'Editing — click outside to finish' : `Send to ${run.contextLabel ?? 'customer'}?`}
          </div>
          {isEditing ? (
            <textarea
              className="pt-pac-edit-ta"
              value={editedMessage}
              onChange={e => setEditedMessage(e.target.value)}
              onBlur={() => setIsEditing(false)}
              autoFocus
              rows={4}
            />
          ) : (
            <div
              className="pt-pac-full-msg"
              onClick={() => setIsEditing(true)}
              title="Click to edit"
            >
              {editedMessage}
            </div>
          )}
          <div className="pt-pac-overlay-btns">
            <button className="pt-pac-confirm-btn" onClick={handleSend} disabled={!editedMessage.trim()}>Send</button>
            <button className="pt-pac-cancel-btn" onClick={() => { setState('idle'); setEditedMessage(run.message); setIsEditing(false) }}>Cancel</button>
          </div>
        </div>
      )}

      {state === 'sending' && (
        <div className="pt-pac-overlay">
          <div className="pt-pac-sending-inner">
            <div className="pt-pac-overlay-lbl">Sending…</div>
            <div className="pt-pac-progressbar"><div className="pt-pac-progressbar-fill" /></div>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="pt-pac-overlay">
          <div className="pt-pac-error-icon">✕</div>
          <div className="pt-pac-overlay-lbl">Failed to send</div>
          <div className="pt-pac-error-msg">{errorMessage}</div>
          <div className="pt-pac-overlay-btns">
            <button className="pt-pac-confirm-btn" onClick={() => setState('confirming')}>Retry</button>
            <button className="pt-pac-cancel-btn" onClick={handleNavigate}>Open chat</button>
          </div>
        </div>
      )}

      {state === 'sent' && (
        <div className="pt-pac-overlay">
          <div className="pt-pac-check">✓</div>
          <div className="pt-pac-overlay-lbl">Sent!</div>
          <button className="pt-pac-goto" onClick={handleNavigate}>Go to chat →</button>
        </div>
      )}
    </div>
  )
}
