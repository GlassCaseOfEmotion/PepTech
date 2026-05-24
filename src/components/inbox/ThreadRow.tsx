import { ChannelIcon } from '@/lib/icons'
import { initials, fmtTime } from '@/types/inbox'
import type { ConversationWithCustomer } from '@/types/inbox'

interface ThreadRowProps {
  conv: ConversationWithCustomer
  active: boolean
  onClick: () => void
}

export function ThreadRow({ conv, active, onClick }: ThreadRowProps) {
  const customer = conv.customers
  const tags = customer?.customer_tags?.map((t) => t.tag) ?? []
  const name = customer?.display_name ?? conv.channel_identifier
  const hasUnread = conv.unread_count > 0

  return (
    <li
      className={`pt-ixt ${active ? 'is-active' : ''} ${hasUnread ? 'is-unread' : ''}`}
      onClick={onClick}
    >
      <div className="pt-ixt-av" data-channel={conv.channel_type}>
        <span>{initials(name)}</span>
        <i className={`pt-thread-ch pt-ch-${conv.channel_type}`}>
          <ChannelIcon channelType={conv.channel_type} size={9} />
        </i>
      </div>
      <div className="pt-ixt-mid">
        <div className="pt-ixt-row1">
          <span className="pt-ixt-name">{name}</span>
          <span className="pt-ixt-time mono">{fmtTime(conv.last_message_at)}</span>
        </div>
        <div className="pt-ixt-row2">
          <span className="pt-ixt-snip">{conv.last_message_snippet ?? ''}</span>
          {hasUnread && (
            <span className="pt-thread-unread">{conv.unread_count}</span>
          )}
        </div>
        <div className="pt-ixt-row3">
          {customer?.lifecycle_stage === 'lead' && (
            <span className="pt-tag pt-tag-lead">Lead</span>
          )}
          {tags.includes('vip') && <span className="pt-tag pt-tag-vip">VIP</span>}
          {tags.includes('new') && <span className="pt-tag pt-tag-new">new</span>}
          {tags.includes('waitlist') && <span className="pt-tag">waitlist</span>}
          {tags.includes('payment') && <span className="pt-tag pt-tag-warn">payment</span>}
          {tags.includes('repeat') && !tags.includes('vip') && (
            <span className="pt-tag pt-tag-soft">repeat</span>
          )}
          {!hasUnread && customer && (
            <span className="pt-ixt-trust mono">trust {customer.trust_score}</span>
          )}
        </div>
      </div>
    </li>
  )
}
