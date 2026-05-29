import { describe, it, expect, vi, beforeEach } from 'vitest'

const { classifyActionable, gatherContext, draftSuggestions, dedupAndPersist } = vi.hoisted(() => ({
  classifyActionable: vi.fn(),
  gatherContext: vi.fn(),
  draftSuggestions: vi.fn(),
  dedupAndPersist: vi.fn(),
}))

vi.mock('../prefilter', () => ({ classifyActionable }))
vi.mock('../context', () => ({ gatherContext }))
vi.mock('../draft', () => ({ draftSuggestions }))
vi.mock('../persist', () => ({ dedupAndPersist }))

import { runCopilotPass } from '../run'

// Supabase stub: copilot_enabled flag + latest-inbound-message check.
function fakeSupabase(opts: { enabled: boolean; latestInboundId: string }) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tenants') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { copilot_enabled: opts.enabled } }) }) }) }
      }
      if (table === 'messages') {
        return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [{ id: opts.latestInboundId }] }) }) }) }) }) }
      }
      throw new Error('unexpected table ' + table)
    }),
  }
}

const params = { tenantId: 't', conversationId: 'c', customerId: 'cust', messageId: 'm1' }

beforeEach(() => {
  classifyActionable.mockReset(); gatherContext.mockReset(); draftSuggestions.mockReset(); dedupAndPersist.mockReset()
  gatherContext.mockResolvedValue({ messages: [{ direction: 'inbound', content: 'x', sent_at: 't' }] })
})

describe('runCopilotPass', () => {
  it('does nothing when the tenant has copilot disabled', async () => {
    const supabase = fakeSupabase({ enabled: false, latestInboundId: 'm1' })
    await runCopilotPass(supabase as never, params)
    expect(classifyActionable).not.toHaveBeenCalled()
  })

  it('skips when a newer inbound message exists (debounce)', async () => {
    const supabase = fakeSupabase({ enabled: true, latestInboundId: 'm2' })
    await runCopilotPass(supabase as never, params)
    expect(classifyActionable).not.toHaveBeenCalled()
  })

  it('stops after pre-filter when not actionable', async () => {
    const supabase = fakeSupabase({ enabled: true, latestInboundId: 'm1' })
    classifyActionable.mockResolvedValue({ actionable: false, signals: [] })
    await runCopilotPass(supabase as never, params)
    expect(draftSuggestions).not.toHaveBeenCalled()
  })

  it('runs the full pipeline when actionable', async () => {
    const supabase = fakeSupabase({ enabled: true, latestInboundId: 'm1' })
    classifyActionable.mockResolvedValue({ actionable: true, signals: ['price_question'] })
    draftSuggestions.mockResolvedValue([{ kind: 'quote', payload: {}, confidence: 0.9, reasoning: '', dedupKey: 'quote' }])
    dedupAndPersist.mockResolvedValue(1)
    await runCopilotPass(supabase as never, params)
    expect(dedupAndPersist).toHaveBeenCalledOnce()
  })

  it('never throws when a stage errors', async () => {
    const supabase = fakeSupabase({ enabled: true, latestInboundId: 'm1' })
    classifyActionable.mockRejectedValue(new Error('boom'))
    await expect(runCopilotPass(supabase as never, params)).resolves.toBeUndefined()
  })
})
