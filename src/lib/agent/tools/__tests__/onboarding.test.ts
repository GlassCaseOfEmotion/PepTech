import { describe, it, expect } from 'vitest'
import { readOnboardingState, proposePaymentMethods, completeOnboarding } from '../onboarding'
import type { AgentSupabase } from '../../types'

// ---------------------------------------------------------------------------
// Fake Supabase builder
//
// Supports two call patterns for .from(table).select(...).eq(...):
//   - count query (head: true)  → resolves with { count: N, data: null, error: null }
//   - single() query            → resolves with { data: <row>, error: null }
//   - bare .eq()                → resolves with { data: [], error: null }
// The fake is configured per-table via a `tables` map:
//   { [tableName]: { count?: number; single?: object | null; rows?: object[] } }
// ---------------------------------------------------------------------------

type TableSpec = {
  count?: number
  single?: Record<string, unknown> | null
  rows?: Record<string, unknown>[]
}

function makeFakeSupabase(tables: Record<string, TableSpec>, userId = 'user-1'): AgentSupabase {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from(table: string) {
      const spec = tables[table] ?? {}
      return {
        select(_cols?: unknown, opts?: { count?: string; head?: boolean }) {
          const isCount = opts?.head === true
          return {
            eq(_col: string, _val: unknown) {
              if (isCount) {
                return Promise.resolve({ count: spec.count ?? 0, data: null, error: null })
              }
              return {
                single: () => Promise.resolve({ data: spec.single ?? null, error: null }),
                // bare eq resolves as a rows query
                then: (res: (v: { data: unknown[]; error: null }) => void) =>
                  res({ data: spec.rows ?? [], error: null }),
              }
            },
          }
        },
        update(_data: unknown) {
          return {
            eq: (_col: string, _val: unknown) => Promise.resolve({ error: null }),
          }
        },
      }
    },
  } as unknown as AgentSupabase
}

// ---------------------------------------------------------------------------
// readOnboardingState — steps.payments
// ---------------------------------------------------------------------------

describe('readOnboardingState — steps.payments', () => {
  const BASE_TENANT = {
    name: 'Acme',
    business_type: 'peptides',
    base_currency: 'SGD',
    timezone: 'Asia/Singapore',
    intended_channels: ['whatsapp'],
    onboarded_at: null,
  }
  const BASE_USER = { display_name: 'Alan' }

  function makeFake(paymentConfigCount: number, cryptoWalletCount: number) {
    return makeFakeSupabase({
      tenants: { single: BASE_TENANT },
      users: { single: BASE_USER },
      products: { count: 2 },
      tenant_payment_configs: { count: paymentConfigCount },
      tenant_crypto_wallets: { count: cryptoWalletCount },
    })
  }

  it('returns steps.payments: true when tenant_payment_configs has rows', async () => {
    const result = await readOnboardingState.execute({}, makeFake(1, 0), 'tenant-1') as Record<string, unknown>
    const steps = result.steps as Record<string, unknown>
    expect(steps.payments).toBe(true)
  })

  it('returns steps.payments: true when only tenant_crypto_wallets has a row', async () => {
    const result = await readOnboardingState.execute({}, makeFake(0, 1), 'tenant-1') as Record<string, unknown>
    const steps = result.steps as Record<string, unknown>
    expect(steps.payments).toBe(true)
  })

  it('returns steps.payments: false when neither has rows', async () => {
    const result = await readOnboardingState.execute({}, makeFake(0, 0), 'tenant-1') as Record<string, unknown>
    const steps = result.steps as Record<string, unknown>
    expect(steps.payments).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// proposePaymentMethods — validation / sanitisation
// (no-op server-side: supabase/tenantId are unused, pass null stubs)
// ---------------------------------------------------------------------------

const NOOP_SUPABASE = null as unknown as AgentSupabase
const NOOP_TENANT = ''

describe('proposePaymentMethods', () => {
  it('echoes valid input unchanged', async () => {
    const result = await proposePaymentMethods.execute({
      managed_crypto: true,
      byo_crypto_assets: ['btc', 'eth'],
      off_platform_methods: ['zelle', 'wise'],
    }, NOOP_SUPABASE, NOOP_TENANT)
    expect(result).toEqual({
      managed_crypto: true,
      byo_crypto_assets: ['btc', 'eth'],
      off_platform_methods: ['zelle', 'wise'],
    })
  })

  it('filters out unknown / garbage values from both arrays', async () => {
    const result = await proposePaymentMethods.execute({
      managed_crypto: false,
      byo_crypto_assets: ['btc', 'GARBAGE', 'doge', 'sol'],
      off_platform_methods: ['zelle', 'unknown_method', 'bank_transfer'],
    }, NOOP_SUPABASE, NOOP_TENANT)
    expect(result).toEqual({
      managed_crypto: false,
      byo_crypto_assets: ['btc', 'sol'],
      off_platform_methods: ['zelle', 'bank_transfer'],
    })
  })

  it('coerces undefined arrays to empty arrays', async () => {
    const result = await proposePaymentMethods.execute(
      { managed_crypto: false }, NOOP_SUPABASE, NOOP_TENANT
    ) as Record<string, unknown>
    expect(result.byo_crypto_assets).toEqual([])
    expect(result.off_platform_methods).toEqual([])
  })

  it('coerces managed_crypto undefined to false', async () => {
    const result = await proposePaymentMethods.execute({
      byo_crypto_assets: [],
      off_platform_methods: [],
    }, NOOP_SUPABASE, NOOP_TENANT) as Record<string, unknown>
    expect(result.managed_crypto).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// completeOnboarding — payment guard
// ---------------------------------------------------------------------------

describe('completeOnboarding — payment guard', () => {
  function makeFakeForComplete(paymentConfigCount: number, cryptoWalletCount: number) {
    return makeFakeSupabase({
      tenant_payment_configs: { count: paymentConfigCount },
      tenant_crypto_wallets: { count: cryptoWalletCount },
      tenants: { single: null },
    })
  }

  it('throws when neither payment_configs nor crypto_wallets have rows', async () => {
    await expect(
      completeOnboarding.execute({}, makeFakeForComplete(0, 0), 'tenant-1')
    ).rejects.toThrow('Cannot complete onboarding yet: no payment methods configured')
  })

  it('succeeds when tenant_payment_configs has at least one row', async () => {
    const result = await completeOnboarding.execute({}, makeFakeForComplete(1, 0), 'tenant-1')
    expect(result).toEqual({ complete: true })
  })

  it('succeeds when only tenant_crypto_wallets has a row', async () => {
    const result = await completeOnboarding.execute({}, makeFakeForComplete(0, 1), 'tenant-1')
    expect(result).toEqual({ complete: true })
  })
})
