import { createClient } from '@supabase/supabase-js'
import { describe, it, expect } from 'vitest'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

describe('tenants table', () => {
  it('rejects an invalid plan value', async () => {
    const { error } = await supabase
      .from('tenants')
      .insert({ name: 'Test', slug: 'test-invalid-plan', plan: 'invalid' })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/check/i)
  })
})

describe('users table', () => {
  it('rejects an invalid role value', async () => {
    const { error } = await supabase
      .from('users')
      .insert({
        id: '00000000-0000-0000-0000-000000000001',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        role: 'superadmin',
        email: 'x@x.com',
      })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/check/i)
  })
})
