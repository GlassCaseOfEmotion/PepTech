import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ThreadList } from '../ThreadList'
import type { ConversationWithCustomer } from '@/types/inbox'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/inbox'),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => <a href={href} {...p}>{children}</a>,
}))

function makeConv(id: string, status: string): ConversationWithCustomer {
  return {
    id, status: status as ConversationWithCustomer['status'], unread_count: 0,
    last_message_at: null, last_message_snippet: 'msg',
    channel_type: 'telegram', channel_identifier: '123',
    customers: { id: `cust-${id}`, display_name: `Customer ${id}`, trust_score: 80, ltv: 100, customer_tags: [] },
  }
}

describe('ThreadList', () => {
  const convs = [makeConv('c1', 'needs_reply'), makeConv('c2', 'new'), makeConv('c3', 'snoozed')]

  it('shows all conversations by default', () => {
    render(<ThreadList conversations={convs} activeId={null} onSelect={vi.fn()} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('filters to needs_reply when pill clicked', () => {
    render(<ThreadList conversations={convs} activeId={null} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByText('Needs reply'))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('calls onSelect when thread is clicked', () => {
    const onSelect = vi.fn()
    render(<ThreadList conversations={convs} activeId={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Customer c1'))
    expect(onSelect).toHaveBeenCalledWith('c1')
  })
})
