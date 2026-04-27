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

describe('customer_channels table', () => {
  it('rejects duplicate channel+identifier per tenant', async () => {
    const { data: tenant } = await supabase
      .from('tenants')
      .insert({ name: 'T1', slug: `t1-${Date.now()}` })
      .select()
      .single()

    const { data: customer } = await supabase
      .from('customers')
      .insert({ tenant_id: tenant!.id, display_name: 'Alice' })
      .select()
      .single()

    await supabase.from('customer_channels').insert({
      tenant_id: tenant!.id,
      customer_id: customer!.id,
      channel_type: 'whatsapp',
      identifier: '+15005550001',
      display_handle: '+1 500 555 0001',
    })

    const { error } = await supabase.from('customer_channels').insert({
      tenant_id: tenant!.id,
      customer_id: customer!.id,
      channel_type: 'whatsapp',
      identifier: '+15005550001',
      display_handle: '+1 500 555 0001',
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/unique/i)
  })
})
