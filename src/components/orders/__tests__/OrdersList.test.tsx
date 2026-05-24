import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OrdersList } from '../OrdersList'
import type { OrderCard } from '@/types/orders'

const baseOrder: OrderCard = {
  id: 'o1',
  refNumber: '1001',
  customerId: 'c1',
  customerName: 'Test Customer',
  channel: 'wa',
  handle: '+1234567890',
  status: 'confirming',
  paymentAsset: 'usdt_trc20',
  paymentAmount: 150,
  currency: 'USD',
  conversationId: null,
  items: [{ name: 'BPC-157 5mg', qty: 2 }],
  minsAgo: 30,
  createdAt: '2026-05-24T10:00:00Z',
}

describe('OrdersList', () => {
  it('renders one row per order', () => {
    render(
      <OrdersList
        orders={[
          { ...baseOrder, id: 'a', refNumber: '1001', customerName: 'Alice' },
          { ...baseOrder, id: 'b', refNumber: '1002', customerName: 'Bob' },
        ]}
        onAdvance={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('#1001')).toBeInTheDocument()
    expect(screen.getByText('#1002')).toBeInTheDocument()
  })

  it('calls onOpen when a row is clicked', () => {
    const onOpen = vi.fn()
    render(
      <OrdersList orders={[{ ...baseOrder, id: 'o42' }]} onAdvance={vi.fn()} onOpen={onOpen} />
    )
    fireEvent.click(screen.getByText('Test Customer'))
    expect(onOpen).toHaveBeenCalledWith('o42')
  })

  it('renders an Advance button when the order has a next status', () => {
    const onAdvance = vi.fn()
    render(
      <OrdersList
        orders={[{ ...baseOrder, id: 'o1', status: 'confirming' }]}
        onAdvance={onAdvance}
        onOpen={vi.fn()}
      />
    )
    const btn = screen.getByRole('button', { name: /confirm payment/i })
    fireEvent.click(btn)
    expect(onAdvance).toHaveBeenCalledWith('o1', 'packing')
  })

  it('does not render an Advance button for terminal statuses', () => {
    render(
      <OrdersList
        orders={[{ ...baseOrder, id: 'o1', status: 'delivered' }]}
        onAdvance={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /mark.*deliver|confirm/i })).not.toBeInTheDocument()
  })

  it('does not trigger onOpen when the advance button is clicked', () => {
    const onOpen = vi.fn()
    const onAdvance = vi.fn()
    render(
      <OrdersList
        orders={[{ ...baseOrder, id: 'o1', status: 'packing' }]}
        onAdvance={onAdvance}
        onOpen={onOpen}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /mark packed/i }))
    expect(onAdvance).toHaveBeenCalledWith('o1', 'shipped')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('renders an empty tbody when no orders are passed', () => {
    render(<OrdersList orders={[]} onAdvance={vi.fn()} onOpen={vi.fn()} />)
    // header still renders
    expect(screen.getByText('#')).toBeInTheDocument()
    // no rows
    expect(screen.queryByText('Test Customer')).not.toBeInTheDocument()
  })
})
