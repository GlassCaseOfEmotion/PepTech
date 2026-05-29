import { describe, it, expect, vi } from 'vitest'
import { getOrCreateCopilotSession } from '../session'

describe('getOrCreateCopilotSession', () => {
  it('returns the existing copilot session for the conversation if present', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'sess1' } }) }) }) }) }),
      }),
    }
    const id = await getOrCreateCopilotSession(supabase as never, 't1', 'conv1')
    expect(id).toBe('sess1')
  })

  it('creates a new copilot session (trigger=copilot, trigger_ref=conversationId) if none exists', async () => {
    const insertSpy = vi.fn().mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: 'new1' } }) }) })
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
        insert: insertSpy,
      }),
    }
    const id = await getOrCreateCopilotSession(supabase as never, 't1', 'conv1')
    expect(id).toBe('new1')
    expect(insertSpy).toHaveBeenCalledWith({ tenant_id: 't1', trigger: 'copilot', trigger_ref: 'conv1' })
  })
})
