import { describe, it, expect, vi } from 'vitest'
import { classifyActionable } from '../prefilter'

const transcript = [
  { direction: 'inbound', content: 'do you have RETA-10 in stock and how much?', sent_at: '2026-05-29T10:00:00Z' },
]

describe('classifyActionable', () => {
  it('returns actionable=true with signals when the model says so', async () => {
    const complete = vi.fn().mockResolvedValue('{"actionable":true,"signals":["price_question","stock_question"]}')
    const result = await classifyActionable(transcript, { complete })
    expect(result.actionable).toBe(true)
    expect(result.signals).toContain('price_question')
    expect(complete).toHaveBeenCalledOnce()
  })

  it('returns actionable=false for chit-chat', async () => {
    const complete = vi.fn().mockResolvedValue('{"actionable":false,"signals":[]}')
    const result = await classifyActionable(
      [{ direction: 'inbound', content: 'thanks, have a good weekend!', sent_at: '2026-05-29T10:00:00Z' }],
      { complete },
    )
    expect(result.actionable).toBe(false)
  })

  it('fails closed (actionable=false) when the model returns garbage', async () => {
    const complete = vi.fn().mockResolvedValue('not json')
    const result = await classifyActionable(transcript, { complete })
    expect(result.actionable).toBe(false)
    expect(result.signals).toEqual([])
  })
})
