import { describe, it, expect, vi } from 'vitest'
import { dedupAndPersist } from '../persist'
import type { SuggestionDraft } from '../types'

const drafts: SuggestionDraft[] = [
  { kind: 'quote', payload: { message: 'a' }, confidence: 0.9, reasoning: 'r', dedupKey: 'quote' },
  { kind: 'cross_sell', payload: { product_id: 'p2' }, confidence: 0.8, reasoning: 'r', dedupKey: 'cross_sell:p2' },
]

function fakeSupabase(openKeys: string[], insertSpy: ReturnType<typeof vi.fn>) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'ai_suggestions') {
        return {
          // for the open-keys query
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: openKeys.map(dedup_key => ({ dedup_key })) }),
            }),
          }),
          insert: insertSpy,
        }
      }
      throw new Error('unexpected table ' + table)
    }),
  }
}

describe('dedupAndPersist', () => {
  it('inserts only drafts whose dedup_key is not already open', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    const supabase = fakeSupabase(['quote'], insertSpy)
    const inserted = await dedupAndPersist(supabase as never, {
      tenantId: 't', conversationId: 'c', customerId: 'cust',
    }, drafts)
    expect(inserted).toBe(1)
    expect(insertSpy).toHaveBeenCalledOnce()
    const rows = insertSpy.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'cross_sell', dedup_key: 'cross_sell:p2', tenant_id: 't' })
  })

  it('inserts nothing when all drafts are duplicates', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    const supabase = fakeSupabase(['quote', 'cross_sell:p2'], insertSpy)
    const inserted = await dedupAndPersist(supabase as never, {
      tenantId: 't', conversationId: 'c', customerId: 'cust',
    }, drafts)
    expect(inserted).toBe(0)
    expect(insertSpy).not.toHaveBeenCalled()
  })
})
