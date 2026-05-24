import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AcquisitionSourceBanner } from '../AcquisitionSourceBanner'

vi.mock('@/app/contacts/actions', () => ({
  setAcquisitionSource: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

describe('AcquisitionSourceBanner', () => {
  it('does not render when source is already set', () => {
    const { container } = render(
      <AcquisitionSourceBanner customerId="c1" currentSource="referral" lifecycleStage="lead" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('does not render for non-leads', () => {
    const { container } = render(
      <AcquisitionSourceBanner customerId="c1" currentSource={null} lifecycleStage="customer" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the prompt when source is null and stage is lead', () => {
    render(
      <AcquisitionSourceBanner customerId="c1" currentSource={null} lifecycleStage="lead" />
    )
    expect(screen.getByText(/where'd they find you/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /referral/i })).toBeInTheDocument()
  })

  it('dismisses (demotes to inline link) when skip is clicked', () => {
    render(
      <AcquisitionSourceBanner customerId="c1" currentSource={null} lifecycleStage="lead" />
    )
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(screen.queryByText(/where'd they find you/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set source/i })).toBeInTheDocument()
  })

  it('demotes itself after 10 seconds of inactivity', () => {
    vi.useFakeTimers()
    render(
      <AcquisitionSourceBanner customerId="c1" currentSource={null} lifecycleStage="lead" />
    )
    expect(screen.getByText(/where'd they find you/i)).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(10_001) })
    expect(screen.queryByText(/where'd they find you/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set source/i })).toBeInTheDocument()
    vi.useRealTimers()
  })
})
