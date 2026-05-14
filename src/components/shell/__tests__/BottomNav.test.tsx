import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomNav } from '../BottomNav'

vi.mock('next/navigation', () => ({
  usePathname: () => '/inbox',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className, onClick }: any) => (
    <a href={href} className={className} onClick={onClick}>{children}</a>
  ),
}))

describe('BottomNav', () => {
  it('renders 5 tabs', () => {
    render(<BottomNav unreadCount={0} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    expect(screen.getByText('Customers')).toBeInTheDocument()
    expect(screen.getByText('Orders')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
  })

  it('shows unread badge when unreadCount > 0', () => {
    render(<BottomNav unreadCount={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('does not show badge when unreadCount is 0', () => {
    render(<BottomNav unreadCount={0} />)
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument()
  })

  it('marks inbox tab active when on /inbox', () => {
    render(<BottomNav unreadCount={0} />)
    const inboxLink = screen.getByText('Inbox').closest('a')
    expect(inboxLink?.className).toContain('is-on')
  })

  it('opens More sheet on click', async () => {
    render(<BottomNav unreadCount={0} />)
    await userEvent.click(screen.getByText('More'))
    expect(screen.getByText('Catalog')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})
