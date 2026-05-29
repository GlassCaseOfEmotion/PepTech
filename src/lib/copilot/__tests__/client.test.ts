import { describe, it, expect, vi } from 'vitest'
import { parseJsonContent } from '../client'

describe('parseJsonContent', () => {
  it('parses a clean JSON object', () => {
    expect(parseJsonContent('{"actionable":true}')).toEqual({ actionable: true })
  })

  it('strips ```json fences before parsing', () => {
    const fenced = '```json\n{"a":1}\n```'
    expect(parseJsonContent(fenced)).toEqual({ a: 1 })
  })

  it('throws a descriptive error on non-JSON', () => {
    expect(() => parseJsonContent('not json')).toThrow(/copilot: could not parse/i)
  })

  it('throws on empty content', () => {
    expect(() => parseJsonContent('')).toThrow(/copilot: empty completion/i)
  })
})
