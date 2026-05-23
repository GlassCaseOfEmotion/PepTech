import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn((table: string) => {
      if (table === 'users') return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { tenant_id: 't1' } }),
      }
      if (table === 'crypto_payment_links') {
        const chain = {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ error: null }),
        }
        return chain
      }
      return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    }),
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('cancelPaymentLink', () => {
  beforeEach(() => vi.resetModules())

  it('returns ok:true on success', async () => {
    const { cancelPaymentLink } = await import('@/app/payments/actions')
    const result = await cancelPaymentLink('link-id')
    expect(result).toEqual({ ok: true })
  })
})
