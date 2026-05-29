import { describe, it, expect } from 'vitest'
import { toolsForMode, openAiToolsForMode, TOOL_MAP } from '../index'
import { postCommentary } from '../copilot'

describe('copilot mode tool set', () => {
  it('exposes read tools + post_commentary, and no write/confirm tools', () => {
    const names = toolsForMode('copilot').map(t => t.name)
    expect(names).toContain('post_commentary')
    expect(names).toContain('query_catalog')
    expect(names).toContain('get_conversation_messages')
    expect(names).not.toContain('create_order')
    expect(names).not.toContain('send_message')
  })

  it('post_commentary is auto-execute and registered in TOOL_MAP', () => {
    expect(postCommentary.requiresConfirmation).toBe(false)
    expect(TOOL_MAP['post_commentary']).toBe(postCommentary)
  })

  it('openAiToolsForMode("copilot") returns function schemas', () => {
    const tools = openAiToolsForMode('copilot')
    expect(tools.find(t => t.function.name === 'post_commentary')).toBeTruthy()
  })

  it('includes the draft-order commerce tools', () => {
    const names = toolsForMode('copilot').map(t => t.name)
    for (const n of ['get_peptide_reference', 'get_draft_order', 'update_draft_order', 'set_shipping_address', 'set_payment_asset', 'finalize_order']) {
      expect(names).toContain(n)
    }
  })

  it('finalize_order is resolvable in TOOL_MAP and confirm-gated', () => {
    expect(TOOL_MAP['finalize_order']?.requiresConfirmation).toBe(true)
  })
})
