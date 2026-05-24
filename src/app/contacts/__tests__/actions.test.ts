import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [] })) }))

import { setLifecycleStage } from '../actions'
import { createClient } from '@/lib/supabase/server'

function makeMockClient(opts: {
  authUserId?: string | null
  tenantId?: string | null
  updateError?: { message: string } | null
} = {}) {
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.authUserId ? { id: opts.authUserId } : null },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: opts.tenantId ? { tenant_id: opts.tenantId } : null,
              }),
            }),
          }),
        }
      }
      if (table === 'customers') {
        return {
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: opts.updateError ?? null }),
            }),
          }),
        }
      }
      if (table === 'customer_events') {
        return {
          insert: () => Promise.resolve({ error: null }),
        }
      }
      return {}
    }),
  }
  return supabase
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('setLifecycleStage', () => {
  it('flips lead to customer and writes an event row', async () => {
    const supabase = makeMockClient({ authUserId: 'u1', tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await setLifecycleStage('cust-1', 'customer')

    expect(result).toEqual({ success: true })
    expect(supabase.from).toHaveBeenCalledWith('customers')
    expect(supabase.from).toHaveBeenCalledWith('customer_events')
  })

  it('returns error when not authenticated', async () => {
    const supabase = makeMockClient({ authUserId: null })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await setLifecycleStage('cust-1', 'customer')

    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('rejects invalid stage values', async () => {
    const supabase = makeMockClient({ authUserId: 'u1', tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    // @ts-expect-error — testing runtime validation of invalid input
    const result = await setLifecycleStage('cust-1', 'churned')

    expect(result).toEqual({ error: 'Invalid lifecycle stage' })
  })
})
