import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getServerUser: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [] })) }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: (fn: unknown) => fn }
})
vi.mock('@/lib/payments/onboarding/commit', () => ({
  commitPaymentMethods: vi.fn(),
}))

import { commitPaymentMethodsAction } from '../payment-actions'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { commitPaymentMethods } from '@/lib/payments/onboarding/commit'
import type { PaymentMethodsCommitInput } from '@/lib/payments/onboarding/types'

const TENANT_ID = 'tenant-abc'

function makeMockClient() {
  return {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { tenant_id: TENANT_ID } }),
        }),
      }),
    })),
  }
}

const validInput: PaymentMethodsCommitInput = {
  managed_crypto: false,
  byo_crypto: [],
  off_platform: [{ type: 'bank_transfer', instructions: 'Transfer to IBAN XYZ' }],
}

const commitResult = {
  configs_inserted: 1,
  managed_wallet_ready: false,
  managed_solana_address: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('commitPaymentMethodsAction', () => {
  it('happy path — returns success with result', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(createClient).mockResolvedValue(makeMockClient() as never)
    vi.mocked(commitPaymentMethods).mockResolvedValue(commitResult)

    const result = await commitPaymentMethodsAction(validInput)

    expect(result).toEqual({ success: true, ...commitResult })
  })

  it('error path — commit throws; returns { error: message }', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(createClient).mockResolvedValue(makeMockClient() as never)
    vi.mocked(commitPaymentMethods).mockRejectedValue(new Error('no payment methods to save'))

    const result = await commitPaymentMethodsAction(validInput)

    expect(result).toEqual({ error: 'no payment methods to save' })
  })

  it('unauthorized — getServerUser returns null; returns { error: "Unauthorized" }', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    vi.mocked(createClient).mockResolvedValue(makeMockClient() as never)

    const result = await commitPaymentMethodsAction(validInput)

    expect(result).toEqual({ error: 'Unauthorized' })
  })
})
