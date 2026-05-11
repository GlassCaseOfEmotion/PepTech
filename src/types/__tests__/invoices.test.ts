import { describe, it, expect } from 'vitest'
import { formatInvoiceNumber, buildInvoiceData } from '../invoices'

const baseOrder = {
  id: 'ord-1',
  ref_number: 'A-1001',
  payment_asset: 'usdt_trc20',
  payment_amount: 440,
  payment_address: '0xABC123',
  created_at: '2026-05-07T10:00:00Z',
  customers: { display_name: 'Alan Ambrose' },
  order_items: [
    { qty: 2, unit_price_snapshot: 220, products: { name: 'Tirzepatide 30mg', sku: 'TIRZ-30' } },
  ],
}

describe('formatInvoiceNumber', () => {
  it('prefixes order ref with INV-', () => {
    expect(formatInvoiceNumber('A-1001')).toBe('INV-A-1001')
  })
})

describe('buildInvoiceData', () => {
  it('maps order to invoice data', () => {
    const data = buildInvoiceData(baseOrder as never, 'Pep Tech', null)
    expect(data.invoiceNumber).toBe('INV-A-1001')
    expect(data.orderRef).toBe('A-1001')
    expect(data.businessName).toBe('Pep Tech')
    expect(data.logoUrl).toBeNull()
    expect(data.customerName).toBe('Alan Ambrose')
    expect(data.paymentMethods).toHaveLength(1)
    expect(data.paymentMethods[0].label).toBe('USDT (TRC20)')
    expect(data.paymentMethods[0].address).toBe('0xABC123')
    expect(data.items).toHaveLength(1)
    expect(data.items[0]).toEqual({ name: 'Tirzepatide 30mg', sku: 'TIRZ-30', qty: 2, unitPrice: 220, subtotal: 440 })
    expect(data.total).toBe(440)
  })

  it('handles null payment_address', () => {
    const data = buildInvoiceData({ ...baseOrder, payment_address: null } as never, 'X', null)
    expect(data.paymentMethods[0].address).toBeUndefined()
  })

  it('returns empty paymentMethods for cash orders', () => {
    const data = buildInvoiceData({ ...baseOrder, payment_asset: 'cash', payment_address: null } as never, 'X', null)
    expect(data.paymentMethods).toHaveLength(0)
  })

  it('uses config for bank_transfer when config is provided', () => {
    const config = {
      id: 'cfg-1',
      tenant_id: 'ten-1',
      type: 'bank_transfer',
      wallet_address: null,
      bank_name: 'Barclays',
      account_name: 'Pep Tech Ltd',
      account_number: '12345678',
      sort_code: '20-00-00',
      iban: null,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    }
    const data = buildInvoiceData(
      { ...baseOrder, payment_asset: 'bank_transfer', payment_address: null } as never,
      'Pep Tech',
      null,
      [config],
    )
    expect(data.paymentMethods).toHaveLength(1)
    expect(data.paymentMethods[0].label).toBe('Bank Transfer')
    expect(data.paymentMethods[0].accountName).toBe('Pep Tech Ltd')
    expect(data.paymentMethods[0].accountNumber).toBe('12345678')
    expect(data.paymentMethods[0].sortCode).toBe('20-00-00')
    expect(data.paymentMethods[0].reference).toBe('A-1001')
  })
})
