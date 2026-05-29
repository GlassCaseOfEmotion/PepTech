import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getOrCreateCopilotSession, executeAgentTurn } = vi.hoisted(() => ({
  getOrCreateCopilotSession: vi.fn(),
  executeAgentTurn: vi.fn(),
}))

vi.mock('../session', () => ({ getOrCreateCopilotSession }))
vi.mock('../../executor', () => ({ executeAgentTurn }))

import { runCopilotWatch } from '../watch'

function fakeSupabase(opts: { enabled: boolean; latestInboundId: string; content?: string }) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tenants') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { copilot_enabled: opts.enabled } }) }) }) }
      }
      if (table === 'messages') {
        return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [{ id: opts.latestInboundId, content: opts.content ?? 'hi' }] }) }) }) }) }) }) }
      }
      throw new Error('unexpected table ' + table)
    }),
  }
}

const params = { tenantId: 't', conversationId: 'c', customerId: 'cust', messageId: 'm1' }

beforeEach(() => { getOrCreateCopilotSession.mockReset(); executeAgentTurn.mockReset() })

describe('runCopilotWatch', () => {
  it('does nothing when copilot is disabled', async () => {
    await runCopilotWatch(fakeSupabase({ enabled: false, latestInboundId: 'm1' }) as never, params)
    expect(executeAgentTurn).not.toHaveBeenCalled()
  })

  it('skips when a newer inbound exists (debounce)', async () => {
    await runCopilotWatch(fakeSupabase({ enabled: true, latestInboundId: 'm2' }) as never, params)
    expect(executeAgentTurn).not.toHaveBeenCalled()
  })

  it('runs a headless turn with the tagged inbound message', async () => {
    getOrCreateCopilotSession.mockResolvedValue('sess1')
    await runCopilotWatch(fakeSupabase({ enabled: true, latestInboundId: 'm1', content: 'how much is RETA-10?' }) as never, params)
    expect(executeAgentTurn).toHaveBeenCalledOnce()
    const [sid, message] = executeAgentTurn.mock.calls[0]
    expect(sid).toBe('sess1')
    expect(message).toBe('[CUSTOMER] how much is RETA-10?')
  })

  it('never throws when a stage errors', async () => {
    getOrCreateCopilotSession.mockRejectedValue(new Error('boom'))
    await expect(runCopilotWatch(fakeSupabase({ enabled: true, latestInboundId: 'm1' }) as never, params)).resolves.toBeUndefined()
  })
})
