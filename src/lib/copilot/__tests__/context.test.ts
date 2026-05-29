import { describe, it, expect, vi } from 'vitest'
import { gatherContext } from '../context'

// Stub the read tools so we test orchestration, not the tools themselves.
vi.mock('@/lib/agent/tools/read', () => ({
  READ_TOOLS: [],
  getCustomer: { execute: vi.fn().mockResolvedValue({ id: 'cust1', display_name: 'Jordan', recent_orders: [] }) },
  getConversationMessages: { execute: vi.fn().mockResolvedValue([{ direction: 'inbound', content: 'hi', sent_at: 't' }]) },
  queryCatalog: { execute: vi.fn().mockResolvedValue([{ id: 'p1', name: 'BPC-157', total_stock: 5, unit_price: 50 }]) },
}))

describe('gatherContext', () => {
  it('collects customer, messages, catalog and affinity into one bundle', async () => {
    const eqSpy = vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        gte: vi.fn().mockResolvedValue({ data: [{ order_items: [{ product_id: 'p1' }, { product_id: 'p2' }] }] }),
      }),
    })
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: eqSpy,
        }),
      }),
    }
    const ctx = await gatherContext(supabase as never, 'tenant1', 'conv1', 'cust1')
    expect(ctx.customer).toMatchObject({ id: 'cust1' })
    expect(ctx.messages).toHaveLength(1)
    expect(ctx.catalog).toHaveLength(1)
    expect(ctx.affinity['p1']).toEqual([{ productId: 'p2', count: 1 }])
    expect(eqSpy).toHaveBeenCalledWith('tenant_id', 'tenant1')
  })
})
