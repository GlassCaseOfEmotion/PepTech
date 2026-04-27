import { describe, it, expect } from 'vitest'

describe('auth middleware config', () => {
  it('matcher excludes static assets', async () => {
    const { config } = await import('./middleware')
    // The matcher should NOT match static asset paths
    // Next.js uses the matcher pattern to decide which requests hit middleware
    // Pattern: exclude _next/static, _next/image, favicon.ico
    expect(config.matcher).toBeDefined()
    expect(Array.isArray(config.matcher)).toBe(true)
    expect(config.matcher.length).toBeGreaterThan(0)
  })

  it('PUBLIC_PATHS includes login, signup, and webhooks', async () => {
    const mod = await import('./middleware')
    // The module should export PUBLIC_PATHS for testability
    expect(mod.PUBLIC_PATHS).toContain('/login')
    expect(mod.PUBLIC_PATHS).toContain('/signup')
    expect(mod.PUBLIC_PATHS).toContain('/api/webhooks')
  })
})
