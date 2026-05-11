import { describe, it, expect } from 'vitest'
import { buildPaymentMessage } from '../payments'
import type { TenantPaymentConfig } from '@/types/payments'

const cryptoConfig = (type: string, address: string): TenantPaymentConfig => ({
  id: '1', tenant_id: 't1', type, wallet_address: address,
  bank_name: null, account_name: null, account_number: null,
  sort_code: null, iban: null, is_active: true, created_at: new Date().toISOString(),
})

const bankConfig: TenantPaymentConfig = {
  id: '2', tenant_id: 't1', type: 'bank_transfer', wallet_address: null,
  bank_name: 'Barclays', account_name: 'Alan Ambrose', account_number: '12345678',
  sort_code: '04-00-04', iban: null, is_active: true, created_at: new Date().toISOString(),
}

describe('buildPaymentMessage', () => {
  it('returns empty string for cash orders', () => {
    expect(buildPaymentMessage(
      { ref_number: 'A-1', payment_amount: 100, payment_asset: 'cash', payment_address: null },
      []
    )).toBe('')
  })

  it('builds single crypto message', () => {
    const msg = buildPaymentMessage(
      { ref_number: 'A-1', payment_amount: 330, payment_asset: 'usdt_trc20', payment_address: 'T9XbnHabc' },
      []
    )
    expect(msg).toContain('A-1')
    expect(msg).toContain('$330.00')
    expect(msg).toContain('USDT (TRC20)')
    expect(msg).toContain('T9XbnHabc')
  })

  it('builds bank transfer message with reference', () => {
    const msg = buildPaymentMessage(
      { ref_number: 'A-2', payment_amount: 200, payment_asset: 'bank_transfer', payment_address: null },
      [bankConfig]
    )
    expect(msg).toContain('A-2')
    expect(msg).toContain('Alan Ambrose')
    expect(msg).toContain('04-00-04')
    expect(msg).toContain('Reference: A-2')
  })

  it('builds customer_chooses message with all active configs', () => {
    const configs = [
      cryptoConfig('usdt_trc20', 'Taddr123'),
      bankConfig,
    ]
    const msg = buildPaymentMessage(
      { ref_number: 'A-3', payment_amount: 150, payment_asset: 'customer_chooses', payment_address: null },
      configs
    )
    expect(msg).toContain('USDT (TRC20)')
    expect(msg).toContain('Taddr123')
    expect(msg).toContain('Bank Transfer')
    expect(msg).toContain('Ref: A-3')
  })

  it('returns fallback when address missing for single coin', () => {
    const msg = buildPaymentMessage(
      { ref_number: 'A-4', payment_amount: 100, payment_asset: 'btc', payment_address: null },
      []
    )
    expect(msg).toContain('contact the operator')
  })
})
