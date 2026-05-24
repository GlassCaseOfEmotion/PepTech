import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/inbox'),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { Sidebar } from '../Sidebar'

describe('Sidebar', () => {
  it('renders all primary nav items', () => {
    render(<Sidebar displayName="dr_peptide" />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    expect(screen.getByText('Contacts')).toBeInTheDocument()
    expect(screen.getByText('Media')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('marks inbox nav item as active when on /inbox', () => {
    render(<Sidebar displayName="dr_peptide" />)
    const inboxBtn = screen.getByText('Inbox').closest('a')
    expect(inboxBtn).toHaveClass('is-on')
  })

  it('renders user display name', () => {
    render(<Sidebar displayName="dr_peptide" />)
    expect(screen.getByText('dr_peptide')).toBeInTheDocument()
  })
})
