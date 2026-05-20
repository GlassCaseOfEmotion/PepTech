'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveAndSendQueuedRun, dismissQueuedRun } from '@/app/automations/actions'
import type { QueuedRun } from '@/types/automations'

type SendState = 'idle' | 'confirming' | 'sending' | 'sent'

export function PendingApprovalRow({ run, onRemove }: {
  run: QueuedRun
  onRemove: (id: string) => void
}) {
  const [state, setState] = useState<SendState>('idle')
  const [editedMessage, setEditedMessage] = useState(run.message)
  const [isEditing, setIsEditing] = useState(false)
  const router = useRouter()

  async function handleSend() {
    setIsEditing(false)
    setState('sending')
    try {
      await approveAndSendQueuedRun(run.id, editedMessage)
      setState('sent')
    } catch {
      setState('confirming')
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
    <div className={`pt-pa-row${state !== 'idle' ? ' is-active' : ''}`}>

      {/* Idle: always-visible content + hover-reveal send bar */}
      {state === 'idle' && (
        <>
          <div className="pt-pa-meta">
            <span className="pt-pa-automation">{run.automationName}</span>
            <span className="pt-pa-sep">·</span>
            <span className="pt-pa-customer">{run.contextLabel ?? '—'}</span>
          </div>
          <div className="pt-pa-msg">{run.message}</div>
          <button className="pt-pa-dismiss" onClick={handleDismiss} title="Dismiss">✕</button>
          <button className="pt-pa-send-bar" onClick={() => setState('confirming')}>
            Review &amp; Send →
          </button>
        </>
      )}

      {/* Confirming overlay */}
      {state === 'confirming' && (
        <div className="pt-pa-overlay">
          <div className="pt-pa-overlay-inner">
            {isEditing ? (
              <textarea
                className="pt-pa-edit-ta"
                value={editedMessage}
                onChange={e => setEditedMessage(e.target.value)}
                onBlur={() => setIsEditing(false)}
                autoFocus
                rows={4}
              />
            ) : (
              <div
                className="pt-pa-full-msg pt-pa-full-msg-editable"
                onClick={() => setIsEditing(true)}
                title="Click to edit"
              >
                {editedMessage}
              </div>
            )}
            <div className="pt-pa-send-to">
              {isEditing ? 'Editing — click outside to finish' : `Send to ${run.contextLabel ?? 'customer'}?`}
            </div>
            <div className="pt-pa-overlay-btns">
              <button className="pt-pa-confirm-btn" onClick={handleSend} disabled={!editedMessage.trim()}>Send</button>
              <button className="pt-pa-cancel-btn" onClick={() => { setState('idle'); setEditedMessage(run.message); setIsEditing(false) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Sending overlay */}
      {state === 'sending' && (
        <div className="pt-pa-overlay">
          <div className="pt-pa-overlay-inner">
            <div className="pt-pa-overlay-label">Sending…</div>
            <div className="pt-pa-progressbar">
              <div className="pt-pa-progressbar-fill" />
            </div>
          </div>
        </div>
      )}

      {/* Sent overlay */}
      {state === 'sent' && (
        <div className="pt-pa-overlay">
          <div className="pt-pa-overlay-inner">
            <div className="pt-pa-check">✓</div>
            <div className="pt-pa-overlay-label">Sent</div>
            <button className="pt-pa-goto" onClick={handleNavigate}>
              Go to chat →
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
