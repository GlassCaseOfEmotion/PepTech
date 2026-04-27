import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConversationPane } from '../ConversationPane'
import type { ConversationWithCustomer, MessageRow } from '@/types/inbox'

const CONV: ConversationWithCustomer = {
  id: 'c1', status: 'needs_reply', unread_count: 2,
  last_message_at: null, last_message_snippet: null,
  channel_type: 'telegram', channel_identifier: '99887766',
  customers: { id: 'cust-1', display_name: 'gymrat_84', trust_score: 88, ltv: 2840, customer_tags: [] },
}

const MESSAGES: MessageRow[] = [
  { id: 'm1', direction: 'inbound', content: 'need tirz', sent_at: new Date().toISOString(), status: 'delivered' },
  { id: 'm2', direction: 'outbound', content: 'in stock!', sent_at: new Date().toISOString(), status: 'sent' },
]

describe('ConversationPane', () => {
  it('renders customer name in header', () => {
    render(<ConversationPane conversation={CONV} messages={MESSAGES} onSend={vi.fn()} quickReplies={[]} />)
    expect(screen.getByText('gymrat_84')).toBeInTheDocument()
  })

  it('renders all messages', () => {
    render(<ConversationPane conversation={CONV} messages={MESSAGES} onSend={vi.fn()} quickReplies={[]} />)
    expect(screen.getByText('need tirz')).toBeInTheDocument()
    expect(screen.getByText('in stock!')).toBeInTheDocument()
  })
})
