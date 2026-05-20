import { describe, it, expect, vi } from 'vitest'
import { evaluateCondition } from '@/lib/automations/engine'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Builds a Supabase mock where every table query resolves to the given result.
// Pass a map of table name → { data, count } to override per table.
function makeSupabase(
  tables: Record<string, { data?: unknown; count?: number | null }> = {}
): SupabaseClient<Database> {
  return {
    from: vi.fn((table: string) => {
      const resp = tables[table] ?? {}
      const result = { data: resp.data ?? null, count: resp.count ?? null, error: null }
      const resolved = Promise.resolve(result)
      const chain: Record<string, unknown> = {
        then: resolved.then.bind(resolved),
        catch: resolved.catch.bind(resolved),
      }
      ;['select','eq','neq','in','gte','not','order','limit'].forEach(m => {
        chain[m] = vi.fn().mockReturnValue(chain)
      })
      chain['maybeSingle'] = vi.fn().mockResolvedValue(result)
      chain['single']      = vi.fn().mockResolvedValue(result)
      return chain
    }),
  } as unknown as SupabaseClient<Database>
}

// ── protocol_days_remaining ───────────────────────────────────────────────────

describe('evaluateCondition: protocol_days_remaining', () => {
  it('returns true when days remaining satisfy lte condition', async () => {
    // Customer delivered 23 days ago on a 4-week (28-day) cycle → 5 days remaining
    const deliveredAt = new Date(Date.now() - 23 * 86_400_000).toISOString()
    const supabase = makeSupabase({
      orders:           { data: { id: 'ord1', delivered_at: deliveredAt } },
      order_items:      { data: [{ product_id: 'p1' }] },
      product_protocols:{ data: [{ cycle_length_weeks: 4 }] },
    })
    const result = await evaluateCondition(
      { type: 'protocol_days_remaining', operator: 'lte', value: 5 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(true)
  })

  it('returns false when days remaining do not satisfy condition', async () => {
    // Customer delivered 10 days ago on a 4-week cycle → 18 days remaining
    const deliveredAt = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const supabase = makeSupabase({
      orders:           { data: { id: 'ord1', delivered_at: deliveredAt } },
      order_items:      { data: [{ product_id: 'p1' }] },
      product_protocols:{ data: [{ cycle_length_weeks: 4 }] },
    })
    const result = await evaluateCondition(
      { type: 'protocol_days_remaining', operator: 'lte', value: 5 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(false)
  })

  it('returns false when customer has no delivered order', async () => {
    const supabase = makeSupabase({ orders: { data: null } })
    const result = await evaluateCondition(
      { type: 'protocol_days_remaining', operator: 'lte', value: 5 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(false)
  })

  it('returns false when product has no protocol', async () => {
    const deliveredAt = new Date(Date.now() - 23 * 86_400_000).toISOString()
    const supabase = makeSupabase({
      orders:           { data: { id: 'ord1', delivered_at: deliveredAt } },
      order_items:      { data: [{ product_id: 'p1' }] },
      product_protocols:{ data: [] },
    })
    const result = await evaluateCondition(
      { type: 'protocol_days_remaining', operator: 'lte', value: 5 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(false)
  })
})

// ── days_since_last_order ─────────────────────────────────────────────────────

describe('evaluateCondition: days_since_last_order', () => {
  it('returns true when days since last order satisfy gte condition', async () => {
    const createdAt = new Date(Date.now() - 35 * 86_400_000).toISOString()
    const supabase = makeSupabase({ orders: { data: { created_at: createdAt } } })
    const result = await evaluateCondition(
      { type: 'days_since_last_order', operator: 'gte', value: 30 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(true)
  })

  it('returns false when last order is too recent', async () => {
    const createdAt = new Date(Date.now() - 5 * 86_400_000).toISOString()
    const supabase = makeSupabase({ orders: { data: { created_at: createdAt } } })
    const result = await evaluateCondition(
      { type: 'days_since_last_order', operator: 'gte', value: 30 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(false)
  })

  it('returns false when customer has no orders', async () => {
    const supabase = makeSupabase({ orders: { data: null } })
    const result = await evaluateCondition(
      { type: 'days_since_last_order', operator: 'gte', value: 30 },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(false)
  })
})

// ── has_tag ───────────────────────────────────────────────────────────────────

describe('evaluateCondition: has_tag', () => {
  it('returns true when customer has the tag', async () => {
    const supabase = makeSupabase({ customer_tags: { data: { tag: 'vip' } } })
    const result = await evaluateCondition(
      { type: 'has_tag', operator: 'eq', value: 'vip' },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(true)
  })

  it('returns false when customer does not have the tag', async () => {
    const supabase = makeSupabase({ customer_tags: { data: null } })
    const result = await evaluateCondition(
      { type: 'has_tag', operator: 'eq', value: 'vip' },
      { customerId: 'c1' },
      supabase,
    )
    expect(result).toBe(false)
  })
})

// ── cooldown_days ─────────────────────────────────────────────────────────────

describe('evaluateCondition: cooldown_days', () => {
  it('returns false when automation fired for this customer within the window', async () => {
    const supabase = makeSupabase({ automation_runs: { count: 1 } })
    const result = await evaluateCondition(
      { type: 'cooldown_days', value: 30 },
      { customerId: 'c1', automationId: 'auto1' },
      supabase,
    )
    expect(result).toBe(false)
  })

  it('returns true when no run exists within the window', async () => {
    const supabase = makeSupabase({ automation_runs: { count: 0 } })
    const result = await evaluateCondition(
      { type: 'cooldown_days', value: 30 },
      { customerId: 'c1', automationId: 'auto1' },
      supabase,
    )
    expect(result).toBe(true)
  })

  it('returns false when a scheduled (delayed) run exists within the window', async () => {
    // state 'scheduled' = delayed send already queued — cooldown should still block
    const supabase = makeSupabase({ automation_runs: { count: 1 } })
    const result = await evaluateCondition(
      { type: 'cooldown_days', value: 30 },
      { customerId: 'c1', automationId: 'auto1' },
      supabase,
    )
    expect(result).toBe(false)
  })

  it('returns false (fail closed) when automationId is missing', async () => {
    const supabase = makeSupabase({})
    const result = await evaluateCondition(
      { type: 'cooldown_days', value: 30 },
      { customerId: 'c1' },  // no automationId
      supabase,
    )
    expect(result).toBe(false)
  })

  it('returns false (fail closed) when query errors', async () => {
    const errorResult = { count: null, error: { message: 'DB error' }, data: null }
    const resolved = Promise.resolve(errorResult)
    const chain: Record<string, unknown> = {
      then: resolved.then.bind(resolved),
      catch: resolved.catch.bind(resolved),
    }
    ;['select','eq','neq','in','gte','not','order','limit'].forEach(m => {
      chain[m] = vi.fn().mockReturnValue(chain)
    })
    chain['maybeSingle'] = vi.fn().mockResolvedValue(errorResult)
    chain['single']      = vi.fn().mockResolvedValue(errorResult)
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient<Database>
    const result = await evaluateCondition(
      { type: 'cooldown_days', value: 30 },
      { customerId: 'c1', automationId: 'auto1' },
      supabase,
    )
    expect(result).toBe(false)
  })
})
