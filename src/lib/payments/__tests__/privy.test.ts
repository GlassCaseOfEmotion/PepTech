import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPrivyWallet, getPrivyWallet } from '../privy'

describe('createPrivyWallet', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('returns wallet id and address on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'wallet_abc', address: 'So1anaAddr1234' }),
    }))
    const result = await createPrivyWallet()
    expect(result).toEqual({ id: 'wallet_abc', address: 'So1anaAddr1234' })
  })

  it('throws when Privy returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }))
    await expect(createPrivyWallet()).rejects.toThrow('Privy error 401')
  })
})

describe('getPrivyWallet', () => {
  it('returns wallet data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'wallet_abc', address: 'So1anaAddr1234' }),
    }))
    const result = await getPrivyWallet('wallet_abc')
    expect(result.address).toBe('So1anaAddr1234')
  })
})
