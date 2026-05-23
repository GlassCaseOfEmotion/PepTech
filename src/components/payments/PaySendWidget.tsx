// src/components/payments/PaySendWidget.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { sendPaymentLinkToCustomer } from '@/app/payments/actions'

type SendState = 'idle' | 'confirming' | 'sending' | 'sent' | 'error'

function channelLabel(type: string | null): string {
  if (type === 'whatsapp') return 'WhatsApp'
  if (type === 'telegram') return 'Telegram'
  if (type === 'email') return 'Email'
  return 'message'
}

function ChannelIcon({ type }: { type: string | null }) {
  if (type === 'whatsapp') return <Icons.wa size={13} style={{ color: 'var(--pt-wa)' }} />
  if (type === 'telegram') return <Icons.tg size={13} style={{ color: 'var(--pt-tg)' }} />
  if (type === 'email') return <Icons.em size={13} />
  return <Icons.send size={13} />
}

function friendlyError(msg: string): string {
  if (msg.includes('window') || msg.includes('63016')) return '24-hour window expired — customer must message first.'
  if (msg.toLowerCase().includes('channel')) return 'Channel disconnected — check Settings.'
  if (msg.includes('not found') || msg.includes('Conversation')) return 'Conversation not found.'
  return 'Could not deliver. Copy the link to share manually.'
}

export function PaySendWidget({
  conversationId,
  customerName,
  channelType,
  messageText,
  url,
}: {
  conversationId: string | null
  customerName: string | null
  channelType: string | null
  messageText: string
  url: string
}) {
  const [state, setState] = useState<SendState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  const canSend = !!conversationId

  async function handleSend() {
    if (!conversationId) return
    setState('sending')
    const result = await sendPaymentLinkToCustomer(conversationId, messageText)
      .catch(e => ({ error: e instanceof Error ? e.message : 'Unknown error' }))
    if ('error' in result) {
      setErrorMsg(friendlyError(result.error))
      setState('error')
    } else {
      setState('sent')
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function goToChat() {
    if (conversationId) router.push(`/inbox?conversation=${conversationId}`)
    else router.push('/inbox')
  }

  return (
    <div className="pay-comp-snd">
      {/* Idle */}
      {state === 'idle' && (
        <>
          {canSend ? (
            <button className="pay-comp-snd-primary" onClick={() => setState('confirming')}>
              <ChannelIcon type={channelType} />
              <span className="label">
                Send to {customerName ?? 'customer'} via {channelLabel(channelType)}
              </span>
              <span style={{ fontSize: 11 }}>→</span>
            </button>
          ) : (
            <button className="pay-comp-snd-primary" style={{ opacity: 0.45 }} disabled>
              <Icons.send size={13} />
              <span className="label">No conversation linked</span>
            </button>
          )}
          <button className={`pay-comp-snd-copy${copied ? ' copied' : ''}`} onClick={copyUrl}>
            <Icons.doc size={10} />
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </>
      )}

      {/* Confirming */}
      {state === 'confirming' && (
        <div className="pay-comp-snd-overlay">
          <div className="pay-comp-snd-confirm-lbl">
            Send to {customerName ?? 'customer'} via {channelLabel(channelType)}?
          </div>
          <div className="pay-comp-snd-confirm-msg">{messageText}</div>
          <div className="pay-comp-snd-confirm-btns">
            <button className="pay-comp-snd-ok" onClick={handleSend}>Send</button>
            <button className="pay-comp-snd-cancel" onClick={() => setState('idle')}>Cancel</button>
          </div>
        </div>
      )}

      {/* Sending */}
      {state === 'sending' && (
        <div className="pay-comp-snd-overlay">
          <div className="pay-comp-snd-confirm-lbl">Sending…</div>
          <div className="pay-comp-snd-progress">
            <div className="pay-comp-snd-progress-fill" />
          </div>
        </div>
      )}

      {/* Sent */}
      {state === 'sent' && (
        <div className="pay-comp-snd-overlay">
          <div className="pay-comp-snd-check">✓</div>
          <div className="pay-comp-snd-confirm-lbl">Sent!</div>
          <button className="pay-comp-snd-goto" onClick={goToChat}>
            Go to chat →
          </button>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="pay-comp-snd-overlay">
          <div className="pay-comp-snd-err-icon">✕</div>
          <div className="pay-comp-snd-confirm-lbl">Failed to send</div>
          <div className="pay-comp-snd-err-msg">{errorMsg}</div>
          <div className="pay-comp-snd-confirm-btns">
            <button className="pay-comp-snd-ok" onClick={() => setState('confirming')}>Retry</button>
            <button className="pay-comp-snd-cancel" onClick={copyUrl}>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
