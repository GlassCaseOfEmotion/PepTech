import type { MessageRow } from '@/types/inbox'
import { fmtTime } from '@/types/inbox'

interface MessageBubbleProps {
  message: MessageRow
  channelType: string
}

export function MessageBubble({ message, channelType }: MessageBubbleProps) {
  const isMe = message.direction === 'outbound'
  const isSending = message.status === 'sending'

  return (
    <div className={`pt-bubble ${isMe ? 'pt-bubble-me' : 'pt-bubble-them'} ${isSending ? 'is-optimistic' : ''}`}>
      <div className="pt-bubble-text">{message.content}</div>
      <div className="pt-bubble-meta">
        {fmtTime(message.sent_at)}
        {isSending && <span className="pt-bubble-pending"> · sending…</span>}
        {isMe && !isSending && message.status === 'read' && (
          <span className="pt-bubble-read"> · read</span>
        )}
      </div>
    </div>
  )
}
