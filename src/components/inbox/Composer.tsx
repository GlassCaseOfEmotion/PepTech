'use client'

import { useState, useRef, useCallback } from 'react'
import { Icons } from '@/lib/icons'

export interface QuickReply {
  id: string
  label: string
  content: string
  sort_order: number
}

interface ComposerProps {
  onSend: (content: string) => void
  channelType: string
  customerName: string
  quickReplies: QuickReply[]
}

export function Composer({ onSend, channelType, customerName, quickReplies }: ComposerProps) {
  const [draft, setDraft] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  const channelLabel = channelType === 'whatsapp' ? 'WhatsApp'
    : channelType === 'telegram' ? 'Telegram'
    : 'Email'

  const handleSend = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }, [draft, onSend])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const insertQuickReply = (content: string) => {
    setDraft((d) => d ? `${d}\n\n${content}` : content)
    setTimeout(() => taRef.current?.focus(), 0)
  }

  return (
    <div className="pt-ix-composer">
      {quickReplies.length > 0 && (
        <div className="pt-quicks pt-quicks-bar">
          <span className="pt-quicks-lbl">Quick</span>
          {quickReplies.slice(0, 5).map((q) => (
            <button key={q.id} className="pt-quick" onClick={() => insertQuickReply(q.content)}>
              {q.label}
            </button>
          ))}
        </div>
      )}
      <div className="pt-composer-field">
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${customerName} via ${channelLabel}…`}
          rows={3}
        />
        <div className="pt-composer-tools">
          <div className="pt-composer-l">
            <span className="pt-composer-hint">⌘↵ to send</span>
          </div>
          <div className="pt-composer-r">
            <button
              className="pt-btn pt-btn-primary"
              onClick={handleSend}
              disabled={!draft.trim()}
              aria-label="Send"
            >
              <Icons.send size={12} /> Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
