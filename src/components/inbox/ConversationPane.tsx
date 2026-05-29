'use client'

import { useEffect, useRef } from 'react'
import { Icons } from '@/lib/icons'
import { MessageBubble } from './MessageBubble'
import { Avatar } from '@/components/ui/Avatar'
import { Composer } from './Composer'
import type { ConversationWithCustomer, MessageRow } from '@/types/inbox'
import type { QuickReply } from './Composer'

interface ConversationPaneProps {
  conversation: ConversationWithCustomer
  messages: MessageRow[]
  onSend: (content: string) => void
  quickReplies: QuickReply[]
  onSnooze?: () => void
  onResolve?: () => void
}

export function ConversationPane({
  conversation, messages, onSend, quickReplies, onSnooze, onResolve,
}: ConversationPaneProps) {
  const streamRef = useRef<HTMLDivElement>(null)
  const customer = conversation.customers
  const name = customer?.display_name ?? conversation.channel_identifier

  const channelLabel = conversation.channel_type === 'whatsapp' ? 'WhatsApp'
    : conversation.channel_type === 'telegram' ? 'Telegram'
    : 'Email'

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [messages.length])

  return (
    <div className={`pt-ix-conv pt-ix-${conversation.channel_type}`}>
      {/* Header */}
      <div className="pt-ix-conv-hd">
        <div className="pt-ix-conv-id">
          <Avatar name={name} channel={conversation.channel_type as 'wa' | 'tg' | 'em'} size={36} />
          <div>
            <div className="pt-ix-conv-name">{name}</div>
            <div className="pt-ix-conv-meta">
              <span className="mono">{conversation.channel_identifier}</span>
              <span className="pt-dot" />
              <span>{channelLabel}</span>
            </div>
          </div>
        </div>
        <div className="pt-ix-conv-actions">
          {onSnooze && (
            <button className="pt-btn pt-btn-ghost" onClick={onSnooze}>
              <Icons.clock size={12} /> Snooze
            </button>
          )}
          {onResolve && (
            <button className="pt-btn pt-btn-ghost" onClick={onResolve}>
              <Icons.check size={12} /> Resolve
            </button>
          )}
        </div>
      </div>

      {/* Message stream */}
      <div ref={streamRef} className="pt-ix-stream">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} channelType={conversation.channel_type} />
        ))}
        {messages.length === 0 && (
          <div style={{ alignSelf: 'center', color: 'var(--pt-fg-4)', fontSize: 12, marginTop: 40 }}>
            No messages yet
          </div>
        )}
      </div>

      {/* Composer */}
      <Composer
        onSend={onSend}
        channelType={conversation.channel_type}
        customerName={name}
        quickReplies={quickReplies}
      />
    </div>
  )
}
