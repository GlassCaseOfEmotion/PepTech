import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MessageBubble } from '../MessageBubble'
import type { MessageRow } from '@/types/inbox'

function makeMsg(direction: 'inbound' | 'outbound', status = 'delivered'): MessageRow {
  return { id: 'm1', direction, content: 'Hello world', sent_at: new Date().toISOString(), status: status as MessageRow['status'] }
}

describe('MessageBubble', () => {
  it('renders message content', () => {
    render(<MessageBubble message={makeMsg('inbound')} channelType="telegram" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('applies pt-bubble-them class for inbound messages', () => {
    const { container } = render(<MessageBubble message={makeMsg('inbound')} channelType="telegram" />)
    expect(container.querySelector('.pt-bubble-them')).toBeInTheDocument()
  })

  it('applies pt-bubble-me class for outbound messages', () => {
    const { container } = render(<MessageBubble message={makeMsg('outbound')} channelType="telegram" />)
    expect(container.querySelector('.pt-bubble-me')).toBeInTheDocument()
  })

  it('shows sending indicator for sending status', () => {
    render(<MessageBubble message={makeMsg('outbound', 'sending')} channelType="whatsapp" />)
    expect(screen.getByText(/sending/i)).toBeInTheDocument()
  })
})
