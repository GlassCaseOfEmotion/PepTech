import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContactsListView } from '../ContactsListView'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
  usePathname: vi.fn().mockReturnValue('/contacts'),
}))

const baseContact = {
  display_name: 'Test',
  trust_score: 50,
  ltv: 0,
  customer_channels: [],
  customer_tags: [],
  acquisition_source: null,
  acquisition_source_note: null,
  referred_by_customer_id: null,
  converted_at: null,
  created_at: '2026-05-01T00:00:00Z',
}

describe('ContactsListView', () => {
  it('defaults to the Leads tab', () => {
    render(<ContactsListView
      customers={[
        { ...baseContact, id: 'a', display_name: 'Alice', lifecycle_stage: 'lead' },
        { ...baseContact, id: 'b', display_name: 'Bob',   lifecycle_stage: 'customer' },
      ]}
      supplyStatuses={{}} orderStats={{}} baseCurrency="USD" hasChannels recentConvByCustomer={{}}
    />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
  })

  it('switches to the Customers tab on click', () => {
    render(<ContactsListView
      customers={[
        { ...baseContact, id: 'a', display_name: 'Alice', lifecycle_stage: 'lead' },
        { ...baseContact, id: 'b', display_name: 'Bob',   lifecycle_stage: 'customer' },
      ]}
      supplyStatuses={{}} orderStats={{}} baseCurrency="USD" hasChannels recentConvByCustomer={{}}
    />)
    fireEvent.click(screen.getByRole('tab', { name: /customers/i }))
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('shows count badges on each tab', () => {
    render(<ContactsListView
      customers={[
        { ...baseContact, id: 'a', display_name: 'Alice', lifecycle_stage: 'lead' },
        { ...baseContact, id: 'b', display_name: 'Bob',   lifecycle_stage: 'customer' },
        { ...baseContact, id: 'c', display_name: 'Cara',  lifecycle_stage: 'lead' },
      ]}
      supplyStatuses={{}} orderStats={{}} baseCurrency="USD" hasChannels recentConvByCustomer={{}}
    />)
    expect(screen.getByRole('tab', { name: /leads.*2/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /customers.*1/i })).toBeInTheDocument()
  })
})
