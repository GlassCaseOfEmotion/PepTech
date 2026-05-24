import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ThreadRow } from '../ThreadRow'
import type { ConversationWithCustomer } from '@/types/inbox'

const BASE_CONV: ConversationWithCustomer = {
  id: 'c1',
  status: 'needs_reply',
  unread_count: 3,
  last_message_at: new Date(Date.now() - 5 * 60000).toISOString(),
  last_message_snippet: 'yo 2 vials reta',
  channel_type: 'telegram',
  channel_identifier: '99887766',
  customers: {
    id: 'cust-1',
    display_name: 'gymrat_84',
    trust_score: 88,
    ltv: 2840,
    customer_tags: [{ tag: 'vip' }, { tag: 'repeat' }],
    lifecycle_stage: 'customer' as const,
    acquisition_source: null,
  },
}

describe('ThreadRow', () => {
  it('renders customer display name and snippet', () => {
    render(<ThreadRow conv={BASE_CONV} active={false} onClick={vi.fn()} />)
    expect(screen.getByText('gymrat_84')).toBeInTheDocument()
    expect(screen.getByText('yo 2 vials reta')).toBeInTheDocument()
  })

  it('shows unread badge when unread_count > 0', () => {
    render(<ThreadRow conv={BASE_CONV} active={false} onClick={vi.fn()} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows trust score when no unread messages', () => {
    const conv = { ...BASE_CONV, unread_count: 0 }
    render(<ThreadRow conv={conv} active={false} onClick={vi.fn()} />)
    expect(screen.getByText(/trust 88/)).toBeInTheDocument()
  })

  it('applies is-active class when active', () => {
    const { container } = render(<ThreadRow conv={BASE_CONV} active={true} onClick={vi.fn()} />)
    expect(container.querySelector('.pt-ixt')).toHaveClass('is-active')
  })

  it('shows VIP tag', () => {
    render(<ThreadRow conv={BASE_CONV} active={false} onClick={vi.fn()} />)
    expect(screen.getByText('VIP')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<ThreadRow conv={BASE_CONV} active={false} onClick={onClick} />)
    fireEvent.click(screen.getByText('gymrat_84'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
