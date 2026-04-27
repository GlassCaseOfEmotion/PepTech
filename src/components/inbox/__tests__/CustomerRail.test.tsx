import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CustomerRail } from '../CustomerRail'
import type { ConversationWithCustomer } from '@/types/inbox'

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => <a href={href} {...p}>{children}</a>,
}))

const CONV: ConversationWithCustomer = {
  id: 'c1', status: 'needs_reply', unread_count: 0,
  last_message_at: null, last_message_snippet: null,
  channel_type: 'whatsapp', channel_identifier: '+15005550001',
  customers: { id: 'cust-1', display_name: 'K. (gymrat_84)', trust_score: 92, ltv: 2840, customer_tags: [{ tag: 'vip' }] },
}

describe('CustomerRail', () => {
  it('renders customer name', () => {
    render(<CustomerRail conversation={CONV} />)
    expect(screen.getByText('K. (gymrat_84)')).toBeInTheDocument()
  })

  it('renders trust score', () => {
    render(<CustomerRail conversation={CONV} />)
    expect(screen.getByText('92')).toBeInTheDocument()
  })

  it('renders LTV', () => {
    render(<CustomerRail conversation={CONV} />)
    expect(screen.getByText(/2,840/)).toBeInTheDocument()
  })

  it('renders VIP tag', () => {
    render(<CustomerRail conversation={CONV} />)
    expect(screen.getByText('vip')).toBeInTheDocument()
  })
})
