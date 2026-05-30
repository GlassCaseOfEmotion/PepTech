import { describe, it, expect } from 'vitest'
import { buildCopilotSystem } from '../system'

describe('buildCopilotSystem', () => {
  it('explains the three voices and the watch/narrate job', () => {
    const s = buildCopilotSystem({ conversationId: 'conv1', customerId: 'cust1', baseCurrency: 'USD' })
    expect(s).toMatch(/\[CUSTOMER\]/)
    expect(s).toMatch(/\[SENT\]/)
    expect(s).toMatch(/\[OPERATOR\]/)
    expect(s).toMatch(/post_commentary/)
    expect(s).toMatch(/never sees|internal/i)
  })

  it('embeds the conversation + customer ids for the commerce tools', () => {
    const s = buildCopilotSystem({ conversationId: 'conv-abc', customerId: 'cust-xyz', baseCurrency: 'USD' })
    expect(s).toContain('conv-abc')
    expect(s).toContain('cust-xyz')
    expect(s).toMatch(/update_draft_order/)
  })

  it('teaches the agent to use send_message', () => {
    const s = buildCopilotSystem({ conversationId: 'conv-abc', customerId: 'cust-xyz', baseCurrency: 'USD' })
    expect(s).toMatch(/send_message/)
  })

  it('injects the tenant currency so drafts don\'t default to USD', () => {
    const s = buildCopilotSystem({ conversationId: 'c', customerId: 'k', baseCurrency: 'IDR' })
    expect(s).toContain('IDR')
    expect(s).toMatch(/never default to USD/)
  })
})
