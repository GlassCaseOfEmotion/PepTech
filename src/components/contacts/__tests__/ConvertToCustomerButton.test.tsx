import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConvertToCustomerButton } from '../ConvertToCustomerButton'

vi.mock('@/app/contacts/actions', () => ({
  setLifecycleStage: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { setLifecycleStage } from '@/app/contacts/actions'

describe('ConvertToCustomerButton', () => {
  it('renders null when currentStage is customer', () => {
    const { container } = render(
      <ConvertToCustomerButton customerId="c1" currentStage="customer" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the button when currentStage is lead', () => {
    render(<ConvertToCustomerButton customerId="c1" currentStage="lead" />)
    expect(screen.getByRole('button', { name: /convert to customer/i })).toBeInTheDocument()
  })

  it('calls setLifecycleStage with (customerId, "customer") on click', async () => {
    render(<ConvertToCustomerButton customerId="cust-1" currentStage="lead" />)
    fireEvent.click(screen.getByRole('button', { name: /convert to customer/i }))
    await Promise.resolve()
    expect(setLifecycleStage).toHaveBeenCalledWith('cust-1', 'customer')
  })
})
