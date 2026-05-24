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

import { setLifecycleStage, setAcquisitionSource } from '../actions'
import { createClient, getServerUser } from '@/lib/supabase/server'

function makeMockClient(opts: {
  tenantId?: string | null
  updateError?: { message: string } | null
  eventInsertError?: { message: string } | null
  updateCalls?: unknown[]
  insertCalls?: unknown[]
} = {}) {
  const supabase = {
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
          update: (payload: unknown) => {
            opts.updateCalls?.push(payload)
            return {
              eq: () => ({
                eq: () => Promise.resolve({ error: opts.updateError ?? null }),
              }),
            }
          },
        }
      }
      if (table === 'customer_events') {
        return {
          insert: (payload: unknown) => {
            opts.insertCalls?.push(payload)
            return Promise.resolve({ error: opts.eventInsertError ?? null })
          },
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
    const updateCalls: unknown[] = []
    const insertCalls: unknown[] = []
    const supabase = makeMockClient({ tenantId: 't1', updateCalls, insertCalls })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1' } as never)

    const result = await setLifecycleStage('cust-1', 'customer')

    expect(result).toEqual({ success: true })
    expect(updateCalls[0]).toMatchObject({ lifecycle_stage: 'customer', converted_at: expect.any(String) })
    expect(insertCalls[0]).toMatchObject({ event_type: 'lifecycle_flip_to_customer', reason: 'manual', actor_user_id: 'u1' })
  })

  it('flips customer to lead and clears converted_at', async () => {
    const updateCalls: unknown[] = []
    const insertCalls: unknown[] = []
    const supabase = makeMockClient({ tenantId: 't1', updateCalls, insertCalls })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1' } as never)

    const result = await setLifecycleStage('cust-1', 'lead')

    expect(result).toEqual({ success: true })
    expect(updateCalls[0]).toMatchObject({ lifecycle_stage: 'lead', converted_at: null })
    expect(insertCalls[0]).toMatchObject({ event_type: 'lifecycle_flip_to_lead', reason: 'manual', actor_user_id: 'u1' })
  })

  it('returns error when customer_events insert fails', async () => {
    const supabase = makeMockClient({
      tenantId: 't1',
      eventInsertError: { message: 'audit failed' },
    })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1' } as never)

    const result = await setLifecycleStage('cust-1', 'customer')

    expect(result).toEqual({ error: 'audit failed' })
  })

  it('returns error when not authenticated', async () => {
    const supabase = makeMockClient({ tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getServerUser).mockResolvedValue(null)

    const result = await setLifecycleStage('cust-1', 'customer')

    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('rejects invalid stage values', async () => {
    const supabase = makeMockClient({ tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1' } as never)

    // @ts-expect-error — testing runtime validation of invalid input
    const result = await setLifecycleStage('cust-1', 'churned')

    expect(result).toEqual({ error: 'Invalid lifecycle stage' })
  })
})

describe('setAcquisitionSource', () => {
  it('writes the source and optional referred_by_customer_id', async () => {
    const supabase = makeMockClient({ tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1' } as never)

    const result = await setAcquisitionSource('cust-1', {
      source: 'referral',
      referredByCustomerId: 'cust-2',
    })

    expect(result).toEqual({ success: true })
    expect(supabase.from).toHaveBeenCalledWith('customers')
  })

  it('rejects invalid source values', async () => {
    const supabase = makeMockClient({ tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1' } as never)

    // @ts-expect-error — testing runtime validation
    const result = await setAcquisitionSource('cust-1', { source: 'paid_ads' })

    expect(result).toEqual({ error: 'Invalid acquisition source' })
  })

  it('requires a note when source is "other"', async () => {
    const supabase = makeMockClient({ tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1' } as never)

    const result = await setAcquisitionSource('cust-1', { source: 'other', note: '' })

    expect(result).toEqual({ error: 'Note required when source is "other"' })
  })

  it('allows clearing the source by passing null', async () => {
    const supabase = makeMockClient({ tenantId: 't1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1' } as never)

    const result = await setAcquisitionSource('cust-1', { source: null })

    expect(result).toEqual({ success: true })
  })
})
