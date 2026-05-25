import { describe, it, expect, vi, beforeEach } from 'vitest'
import { commitPaymentMethods } from '../commit'
import type { PaymentMethodsCommitInput } from '../types'

vi.mock('@/lib/payments/privy', () => ({
  createPrivyWallet: vi.fn(),
}))

import { createPrivyWallet } from '@/lib/payments/privy'
const mockCreatePrivyWallet = vi.mocked(createPrivyWallet)

// ---------------------------------------------------------------------------
// Fake Supabase factory
// ---------------------------------------------------------------------------

type CapturedInsert = { table: string; rows: unknown[] }

interface FakeSupabaseOptions {
  existingWallet?: { solana_address: string; privy_wallet_id: string } | null
  walletInsertError?: string | null
  configInsertError?: string | null
}

function makeFakeSupabase(opts: FakeSupabaseOptions = {}) {
  const captured: CapturedInsert[] = []

  const supabase = {
    from(table: string) {
      if (table === 'tenant_crypto_wallets') {
        return {
          select(_cols?: string) {
            return {
              eq(_col: string, _val: string) {
                return {
                  maybeSingle() {
                    return Promise.resolve({ data: opts.existingWallet ?? null, error: null })
                  },
                }
              },
            }
          },
          insert(rows: unknown) {
            captured.push({ table, rows: Array.isArray(rows) ? rows : [rows] })
            return Promise.resolve({ data: null, error: opts.walletInsertError ? { message: opts.walletInsertError } : null })
          },
        }
      }

      if (table === 'tenant_payment_configs') {
        return {
          insert(rows: unknown[]) {
            captured.push({ table, rows })
            return {
              select(_cols?: string) {
                if (opts.configInsertError) {
                  return Promise.resolve({ data: null, error: { message: opts.configInsertError } })
                }
                const ids = (rows as unknown[]).map((_, i) => ({ id: `cfg-${i}` }))
                return Promise.resolve({ data: ids, error: null })
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  } as unknown as Parameters<typeof commitPaymentMethods>[0]['supabase']

  return { supabase, captured }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => { vi.resetAllMocks() })

const BTC_ADDRESS = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
const SOLANA_ADDR = 'SoLAddr1111111111111111111111111111111111111'

describe('commitPaymentMethods', () => {
  it('a. happy path — all three categories', async () => {
    const { supabase, captured } = makeFakeSupabase({ existingWallet: null })
    mockCreatePrivyWallet.mockResolvedValue({ id: 'w-1', address: SOLANA_ADDR })

    const input: PaymentMethodsCommitInput = {
      managed_crypto: true,
      byo_crypto: [{ type: 'btc', wallet_address: BTC_ADDRESS }],
      off_platform: [{ type: 'cash', instructions: 'pay me at the gym' }],
    }

    const result = await commitPaymentMethods({ supabase, tenantId: 'tenant-1', input })

    expect(result.configs_inserted).toBe(2)
    expect(result.managed_wallet_ready).toBe(true)
    expect(result.managed_solana_address).toBe(SOLANA_ADDR)

    const configInsert = captured.find(c => c.table === 'tenant_payment_configs')!
    expect(configInsert.rows).toHaveLength(2)

    const btcRow = configInsert.rows.find((r: unknown) => (r as { type: string }).type === 'btc') as {
      tenant_id: string; type: string; wallet_address: string | null; instructions: string | null
    }
    expect(btcRow.tenant_id).toBe('tenant-1')
    expect(btcRow.wallet_address).toBe(BTC_ADDRESS)
    expect(btcRow.instructions).toBeNull()

    const cashRow = configInsert.rows.find((r: unknown) => (r as { type: string }).type === 'cash') as {
      tenant_id: string; type: string; wallet_address: string | null; instructions: string | null
    }
    expect(cashRow.tenant_id).toBe('tenant-1')
    expect(cashRow.wallet_address).toBeNull()
    expect(cashRow.instructions).toBe('pay me at the gym')
  })

  it('b. managed crypto idempotent — does not call Privy when wallet already exists', async () => {
    const existingWallet = { solana_address: 'ExistingAddr111111111111111111111111111111', privy_wallet_id: 'w-existing' }
    const { supabase } = makeFakeSupabase({ existingWallet })

    const input: PaymentMethodsCommitInput = {
      managed_crypto: true,
      byo_crypto: [],
      off_platform: [{ type: 'cash', instructions: 'cash only' }],
    }

    const result = await commitPaymentMethods({ supabase, tenantId: 'tenant-2', input })

    expect(mockCreatePrivyWallet).not.toHaveBeenCalled()
    expect(result.managed_wallet_ready).toBe(true)
    expect(result.managed_solana_address).toBe('ExistingAddr111111111111111111111111111111')
  })

  it('c. managed crypto Privy failure — rejects and does not insert configs', async () => {
    const { supabase, captured } = makeFakeSupabase({ existingWallet: null })
    mockCreatePrivyWallet.mockRejectedValue(new Error('429 rate limited'))

    const input: PaymentMethodsCommitInput = {
      managed_crypto: true,
      byo_crypto: [],
      off_platform: [{ type: 'cash', instructions: 'cash only' }],
    }

    await expect(
      commitPaymentMethods({ supabase, tenantId: 'tenant-3', input })
    ).rejects.toThrow(/managed wallet/i)

    expect(captured.find(c => c.table === 'tenant_payment_configs')).toBeUndefined()
  })

  it('d. invalid BYO address rejected', async () => {
    const { supabase } = makeFakeSupabase()

    const input: PaymentMethodsCommitInput = {
      managed_crypto: false,
      byo_crypto: [{ type: 'btc', wallet_address: 'garbage' }],
      off_platform: [],
    }

    await expect(
      commitPaymentMethods({ supabase, tenantId: 't', input })
    ).rejects.toThrow(/invalid address/i)
  })

  it('e. off-platform with non-off-platform type rejected', async () => {
    const { supabase } = makeFakeSupabase()

    const input: PaymentMethodsCommitInput = {
      managed_crypto: false,
      byo_crypto: [],
      off_platform: [{ type: 'btc' as Parameters<typeof commitPaymentMethods>[0]['input']['off_platform'][0]['type'], instructions: 'x' }],
    }

    await expect(
      commitPaymentMethods({ supabase, tenantId: 't', input })
    ).rejects.toThrow(/not an off-platform method/i)
  })

  it('f. empty instructions rejected', async () => {
    const { supabase } = makeFakeSupabase()

    const input: PaymentMethodsCommitInput = {
      managed_crypto: false,
      byo_crypto: [],
      off_platform: [{ type: 'cash', instructions: '   ' }],
    }

    await expect(
      commitPaymentMethods({ supabase, tenantId: 't', input })
    ).rejects.toThrow(/instructions required/i)
  })

  it('g. nothing selected — rejects', async () => {
    const { supabase } = makeFakeSupabase()

    const input: PaymentMethodsCommitInput = {
      managed_crypto: false,
      byo_crypto: [],
      off_platform: [],
    }

    await expect(
      commitPaymentMethods({ supabase, tenantId: 't', input })
    ).rejects.toThrow(/no payment methods/i)
  })
})
