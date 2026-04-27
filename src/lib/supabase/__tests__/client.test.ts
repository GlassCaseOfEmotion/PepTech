import { describe, it, expect } from 'vitest'
import { createClient } from '../client'

describe('createClient', () => {
  it('creates a browser client without throwing', () => {
    expect(() => createClient()).not.toThrow()
  })

  it('returns a client with a from() method', () => {
    const client = createClient()
    expect(typeof client.from).toBe('function')
  })
})
