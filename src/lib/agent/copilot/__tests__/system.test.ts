import { describe, it, expect } from 'vitest'
import { buildCopilotSystem } from '../system'

describe('buildCopilotSystem', () => {
  it('explains the three voices and the watch/narrate job', () => {
    const s = buildCopilotSystem()
    expect(s).toMatch(/\[CUSTOMER\]/)
    expect(s).toMatch(/\[SENT\]/)
    expect(s).toMatch(/\[OPERATOR\]/)
    expect(s).toMatch(/post_commentary/)
    expect(s).toMatch(/never sees|internal/i)
  })
})
