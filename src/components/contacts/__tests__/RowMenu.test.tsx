import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RowMenu } from '../RowMenu'

vi.mock('@/app/contacts/actions', () => ({
  setLifecycleStage: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

describe('RowMenu', () => {
  it('shows "Mark as customer" for a lead', () => {
    render(<RowMenu customerId="c1" currentStage="lead" />)
    expect(screen.getByText(/mark as customer/i)).toBeInTheDocument()
  })

  it('shows "Mark as lead" for a customer', () => {
    render(<RowMenu customerId="c1" currentStage="customer" />)
    expect(screen.getByText(/mark as lead/i)).toBeInTheDocument()
  })
})
