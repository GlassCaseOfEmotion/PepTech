import { describe, it, expect } from 'vitest'
import { buildPaymentMessage } from '../payments'
import type { TenantPaymentConfig } from '@/types/payments'

const noConfigs: TenantPaymentConfig[] = []

describe('buildPaymentMessage', () => {
  it('returns empty string for cash orders', () => {
    expect(buildPaymentMessage(
      { ref_number: 'A-1', payment_amount: 100, payment_asset: 'cash', payment_address: null },
      noConfigs,
    )).toBe('')
  })

  it('uses checkout URL for crypto orders when provided', () => {
    const result = buildPaymentMessage(
      { ref_number: 'A-2', payment_amount: 50, payment_asset: 'usdt_trc20', payment_address: 'TQrZ...' },
      noConfigs,
      'https://peptech.app/pay/abc-123',
    )
    expect(result).toContain('https://peptech.app/pay/abc-123')
    expect(result).toContain('USDT (TRC20)')
    expect(result).not.toContain('TQrZ...')
  })

  it('falls back to raw address for crypto when no checkout URL', () => {
    const result = buildPaymentMessage(
      { ref_number: 'A-3', payment_amount: 50, payment_asset: 'btc', payment_address: 'bc1q...' },
      noConfigs,
    )
    expect(result).toContain('bc1q...')
    expect(result).toContain('BTC')
  })

  it('formats bank transfer with reference number', () => {
    const cfg: TenantPaymentConfig = {
      id: '1', tenant_id: 't1', type: 'bank_transfer', is_active: true,
      wallet_address: null, bank_name: 'HSBC', account_name: 'Peptech Ltd',
      account_number: '12345678', sort_code: '40-20-30', iban: null, created_at: '',
    }
    const result = buildPaymentMessage(
      { ref_number: 'A-4', payment_amount: 200, payment_asset: 'bank_transfer', payment_address: null },
      [cfg],
    )
    expect(result).toContain('A-4')
    expect(result).toContain('12345678')
    expect(result).toContain('40-20-30')
  })
})
