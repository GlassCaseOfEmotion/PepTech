import { describe, it, expect } from 'vitest'
import { mapAgentRow, upsertMessage, type CopilotMsg } from '../timeline'

describe('mapAgentRow', () => {
  it('maps a raw agent_messages row to a CopilotMsg', () => {
    const row = { id: 'm1', role: 'assistant', content: 'Added 2x Reta.', tool_calls: [{ id: 't1', name: 'update_draft_order', input: {}, output: null, status: 'complete' }], created_at: '2026-05-29T10:00:00Z' }
    expect(mapAgentRow(row as never)).toEqual({
      id: 'm1', role: 'assistant', content: 'Added 2x Reta.',
      toolCalls: [{ id: 't1', name: 'update_draft_order', input: {}, output: null, status: 'complete' }],
      createdAt: '2026-05-29T10:00:00Z',
    })
  })
  it('defaults null tool_calls to []', () => {
    expect(mapAgentRow({ id: 'm2', role: 'user', content: '[CUSTOMER] hi', tool_calls: null, created_at: 't' } as never).toolCalls).toEqual([])
  })
})

describe('upsertMessage', () => {
  it('appends a new message', () => {
    const a: CopilotMsg = { id: 'm1', role: 'assistant', content: 'a', toolCalls: [], createdAt: 't1' }
    const b: CopilotMsg = { id: 'm2', role: 'assistant', content: 'b', toolCalls: [], createdAt: 't2' }
    expect(upsertMessage([a], b)).toEqual([a, b])
  })
  it('replaces an existing message by id (e.g. tool_calls status update)', () => {
    const a: CopilotMsg = { id: 'm1', role: 'assistant', content: 'a', toolCalls: [{ id: 't1', name: 'finalize_order', input: {}, output: null, status: 'pending' }], createdAt: 't1' }
    const updated: CopilotMsg = { ...a, toolCalls: [{ id: 't1', name: 'finalize_order', input: {}, output: { ok: true }, status: 'complete' }] }
    expect(upsertMessage([a], updated)).toEqual([updated])
  })
})
