import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AcquisitionSourceBanner } from '../AcquisitionSourceBanner'
import { setAcquisitionSource } from '@/app/contacts/actions'

vi.mock('@/app/contacts/actions', () => ({
  setAcquisitionSource: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

describe('AcquisitionSourceBanner', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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
  })

  it('calls setAcquisitionSource when a chip is clicked', async () => {
    render(
      <AcquisitionSourceBanner customerId="c1" currentSource={null} lifecycleStage="lead" />
    )
    fireEvent.click(screen.getByRole('button', { name: /referral/i }))
    await Promise.resolve()
    expect(setAcquisitionSource).toHaveBeenCalledWith('c1', { source: 'referral', note: null })
  })

  it('does not show "Other" as a one-tap option', () => {
    render(
      <AcquisitionSourceBanner customerId="c1" currentSource={null} lifecycleStage="lead" />
    )
    expect(screen.queryByRole('button', { name: /^other$/i })).not.toBeInTheDocument()
  })
})
