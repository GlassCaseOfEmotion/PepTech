import { describe, it, expect } from 'vitest'
import { formatAmount, STABLECOIN_ASSETS, COINGECKO_IDS } from '../currency'

describe('formatAmount', () => {
  it('formats USD with 2 decimal places and $ symbol', () => {
    expect(formatAmount(39.99, 'USD')).toBe('$39.99')
  })

  it('formats USD $0.00', () => {
    expect(formatAmount(0, 'USD')).toBe('$0.00')
  })

  it('formats IDR with no fractional decimal places', () => {
    const result = formatAmount(50000, 'IDR')
    // IDR uses thousands separator (dot in Indonesian locale), not decimal places
    expect(result).toContain('Rp')
    expect(result).toContain('50')
  })

  it('formats IDR rounds to nearest whole number', () => {
    const a = formatAmount(50000, 'IDR')
    const b = formatAmount(50000.4, 'IDR')
    expect(a).toBe(b)
  })

  it('IDR result contains Rp', () => {
    const result = formatAmount(1000, 'IDR')
    expect(result.toLowerCase()).toMatch(/rp/)
  })
})

describe('STABLECOIN_ASSETS', () => {
  it('includes usdt_trc20 and usdc_erc20', () => {
    expect(STABLECOIN_ASSETS.has('usdt_trc20')).toBe(true)
    expect(STABLECOIN_ASSETS.has('usdc_erc20')).toBe(true)
  })

  it('does not include volatile crypto', () => {
    expect(STABLECOIN_ASSETS.has('btc')).toBe(false)
    expect(STABLECOIN_ASSETS.has('eth')).toBe(false)
  })
})

describe('COINGECKO_IDS', () => {
  it('maps btc, eth, ltc, xmr to gecko IDs', () => {
    expect(COINGECKO_IDS['btc']).toBe('bitcoin')
    expect(COINGECKO_IDS['eth']).toBe('ethereum')
    expect(COINGECKO_IDS['ltc']).toBe('litecoin')
    expect(COINGECKO_IDS['xmr']).toBe('monero')
  })

  it('does not include stablecoins', () => {
    expect(COINGECKO_IDS['usdt_trc20']).toBeUndefined()
  })
})
