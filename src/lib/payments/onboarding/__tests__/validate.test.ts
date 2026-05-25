import { describe, it, expect } from 'vitest'
import { validateAddress, isCryptoType } from '../validate'
import type { PaymentType } from '@/types/payments'

describe('validateAddress', () => {
  describe('btc', () => {
    it('accepts a legacy mainnet address (genesis block)', () => {
      expect(validateAddress('btc', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toEqual({ ok: true })
    })
    it('accepts a P2SH address', () => {
      expect(validateAddress('btc', '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toEqual({ ok: true })
    })
    it('accepts a bech32 address', () => {
      expect(validateAddress('btc', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toEqual({ ok: true })
    })
    it('rejects garbage', () => {
      const result = validateAddress('btc', 'notabtcaddress')
      expect(result.ok).toBe(false)
    })
    it('rejects wrong-length string', () => {
      const result = validateAddress('btc', '1A1zP1eP5QGefi2')
      expect(result.ok).toBe(false)
    })
  })

  describe('eth', () => {
    it('accepts a valid EVM address (USDT contract)', () => {
      expect(validateAddress('eth', '0xdAC17F958D2ee523a2206206994597C13D831ec7')).toEqual({ ok: true })
    })
    it('rejects missing 0x prefix', () => {
      const result = validateAddress('eth', 'dAC17F958D2ee523a2206206994597C13D831ec7')
      expect(result.ok).toBe(false)
    })
    it('rejects too-short hex', () => {
      const result = validateAddress('eth', '0xdAC17F')
      expect(result.ok).toBe(false)
    })
  })

  describe('usdt_erc20', () => {
    it('accepts a valid EVM address', () => {
      expect(validateAddress('usdt_erc20', '0xdAC17F958D2ee523a2206206994597C13D831ec7')).toEqual({ ok: true })
    })
    it('rejects invalid address', () => {
      const result = validateAddress('usdt_erc20', '0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ')
      expect(result.ok).toBe(false)
    })
  })

  describe('usdc_erc20', () => {
    it('accepts a valid EVM address', () => {
      expect(validateAddress('usdc_erc20', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toEqual({ ok: true })
    })
    it('rejects invalid address', () => {
      const result = validateAddress('usdc_erc20', '0x123')
      expect(result.ok).toBe(false)
    })
  })

  describe('usdt_trc20', () => {
    it('accepts the USDT TRC20 contract address', () => {
      expect(validateAddress('usdt_trc20', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toEqual({ ok: true })
    })
    it('rejects wrong prefix', () => {
      const result = validateAddress('usdt_trc20', 'AR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
      expect(result.ok).toBe(false)
    })
    it('rejects too-short Tron address', () => {
      const result = validateAddress('usdt_trc20', 'TR7NHq')
      expect(result.ok).toBe(false)
    })
  })

  describe('sol', () => {
    it('accepts the wSOL mint address', () => {
      expect(validateAddress('sol', 'So11111111111111111111111111111111111111112')).toEqual({ ok: true })
    })
    it('rejects address with invalid base58 characters', () => {
      const result = validateAddress('sol', 'So1111111111111111111111111111111111111111O')
      expect(result.ok).toBe(false)
    })
    it('rejects too-short address', () => {
      const result = validateAddress('sol', 'So1111111')
      expect(result.ok).toBe(false)
    })
  })

  describe('ltc', () => {
    it('accepts a legacy L-prefix address', () => {
      expect(validateAddress('ltc', 'LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL')).toEqual({ ok: true })
    })
    it('accepts a bech32 ltc1 address (lowercase)', () => {
      expect(validateAddress('ltc', 'ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgmwm3t')).toEqual({ ok: true })
    })
    it('rejects uppercase bech32', () => {
      const result = validateAddress('ltc', 'LTC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4')
      expect(result.ok).toBe(false)
    })
    it('rejects garbage', () => {
      const result = validateAddress('ltc', 'notanltcaddress')
      expect(result.ok).toBe(false)
    })
  })

  describe('xmr', () => {
    it('accepts a well-known Monero address', () => {
      expect(validateAddress('xmr', '4AdUndXHHZ9pfQj27iMAjAr4ipBVrJqXgWEMo8q4cmNB6ZUyrV98a5fGyTaJWErxxRDDmHe6BMV6FfP8oNBpwGV9ULxKj76')).toEqual({ ok: true })
    })
    it('rejects address with wrong leading character', () => {
      const result = validateAddress('xmr', '5AdUndXHHZ9pfQj27iMAjAr4ipBVrJqXgWEMo8q4cmNB6ZUyrV98a5fGyTaJWErxxRDDmHe6BMV6FfP8oNBpwGV9ULxKj76')
      expect(result.ok).toBe(false)
    })
    it('rejects address that is too short', () => {
      const result = validateAddress('xmr', '4AdUndXHHZ9pfQj27iMAjAr4ip')
      expect(result.ok).toBe(false)
    })
  })

  describe('whitespace trimming', () => {
    it('accepts an ETH address with leading/trailing spaces', () => {
      expect(validateAddress('eth', '  0xdAC17F958D2ee523a2206206994597C13D831ec7  ')).toEqual({ ok: true })
    })
    it('accepts a BTC address with whitespace', () => {
      expect(validateAddress('btc', ' 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa ')).toEqual({ ok: true })
    })
  })

  describe('empty string', () => {
    it('returns the empty reason for empty string', () => {
      expect(validateAddress('eth', '')).toEqual({ ok: false, reason: 'Address is empty' })
    })
    it('returns the empty reason for whitespace-only string', () => {
      expect(validateAddress('btc', '   ')).toEqual({ ok: false, reason: 'Address is empty' })
    })
  })

  describe('off-platform methods', () => {
    const offPlatform: PaymentType[] = ['bank_transfer', 'cash', 'zelle', 'venmo', 'cashapp', 'wise']
    for (const type of offPlatform) {
      it(`returns defensive error for ${type}`, () => {
        expect(validateAddress(type, 'anything')).toEqual({
          ok: false,
          reason: 'validateAddress should not be called for off-platform methods',
        })
      })
    }
  })
})

describe('isCryptoType', () => {
  it('returns true for crypto types', () => {
    const cryptoTypes: PaymentType[] = ['btc', 'eth', 'usdt_erc20', 'usdc_erc20', 'usdt_trc20', 'sol', 'ltc', 'xmr']
    for (const type of cryptoTypes) {
      expect(isCryptoType(type)).toBe(true)
    }
  })

  it('returns false for off-platform types', () => {
    const offPlatform: PaymentType[] = ['bank_transfer', 'cash', 'zelle', 'venmo', 'cashapp', 'wise']
    for (const type of offPlatform) {
      expect(isCryptoType(type)).toBe(false)
    }
  })
})
