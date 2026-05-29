import { describe, it, expect, vi } from 'vitest'
import { draftSuggestions } from '../draft'
import type { CopilotContext } from '../context'

const ctx: CopilotContext = {
  customer: { id: 'cust1', display_name: 'Jordan', recent_orders: [] },
  messages: [{ direction: 'inbound', content: 'how much is RETA-10?', sent_at: 't' }],
  catalog: [{ id: 'p1', name: 'RETA-10', total_stock: 8, unit_price: 120, margin_pct: 40 }],
  affinity: { p1: [{ productId: 'p2', count: 6 }] },
  currency: 'USD',
}

describe('draftSuggestions', () => {
  it('maps model output into validated drafts with dedup keys', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({
      suggestions: [
        { kind: 'quote', payload: { message: 'RETA-10 is $120 and in stock.' }, confidence: 0.9, reasoning: 'direct price question' },
        { kind: 'cross_sell', payload: { product_id: 'p2', product_name: 'BPC-157', offer_message: 'Add BPC?', affinity_pct: 67 }, confidence: 0.72, reasoning: 'pairs often' },
      ],
    }))
    const drafts = await draftSuggestions(ctx, { complete })
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({ kind: 'quote', dedupKey: 'quote' })
    expect(drafts[1].dedupKey).toBe('cross_sell:p2')
  })

  it('drops suggestions below the confidence threshold', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({
      suggestions: [
        { kind: 'reply', payload: { message: 'maybe' }, confidence: 0.2, reasoning: 'weak' },
      ],
    }))
    const drafts = await draftSuggestions(ctx, { complete })
    expect(drafts).toHaveLength(0)
  })

  it('returns [] on unparseable output', async () => {
    const complete = vi.fn().mockResolvedValue('garbage')
    const drafts = await draftSuggestions(ctx, { complete })
    expect(drafts).toEqual([])
  })

  it('ignores entries with an unknown kind', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({
      suggestions: [{ kind: 'banana', payload: {}, confidence: 0.9, reasoning: 'x' }],
    }))
    const drafts = await draftSuggestions(ctx, { complete })
    expect(drafts).toEqual([])
  })
})
