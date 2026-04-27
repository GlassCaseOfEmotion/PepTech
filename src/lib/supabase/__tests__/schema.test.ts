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

describe('messages table', () => {
  it('rejects duplicate external_id per tenant', async () => {
    const { data: tenant } = await supabase
      .from('tenants')
      .insert({ name: 'T2', slug: `t2-${Date.now()}` })
      .select().single()

    const { data: customer } = await supabase
      .from('customers')
      .insert({ tenant_id: tenant!.id, display_name: 'Bob' })
      .select().single()

    const { data: conv } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenant!.id,
        customer_id: customer!.id,
        channel_type: 'telegram',
        channel_identifier: '@bob',
      })
      .select().single()

    const extId = `msg-dedup-${Date.now()}`

    await supabase.from('messages').insert({
      tenant_id: tenant!.id,
      conversation_id: conv!.id,
      direction: 'inbound',
      content: 'first',
      external_id: extId,
    })

    const { error: dupError } = await supabase.from('messages').insert({
      tenant_id: tenant!.id,
      conversation_id: conv!.id,
      direction: 'inbound',
      content: 'duplicate',
      external_id: extId,
    })

    expect(dupError).not.toBeNull()
    expect(dupError?.message).toMatch(/unique/i)
  })

  it('rejects invalid status', async () => {
    const { data: tenant } = await supabase
      .from('tenants')
      .insert({ name: 'T3', slug: `t3-${Date.now()}` })
      .select().single()

    const { data: customer } = await supabase
      .from('customers')
      .insert({ tenant_id: tenant!.id, display_name: 'Carl' })
      .select().single()

    const { data: conv } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenant!.id,
        customer_id: customer!.id,
        channel_type: 'email',
        channel_identifier: 'carl@example.com',
      })
      .select().single()

    const { error } = await supabase.from('messages').insert({
      tenant_id: tenant!.id,
      conversation_id: conv!.id,
      direction: 'inbound',
      content: 'test',
      status: 'bounced',
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/check/i)
  })
})

describe('RLS tenant isolation', () => {
  it('anon client cannot read customers', async () => {
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await anonClient.from('customers').select('*')
    // RLS should return empty array (not an error, but no rows visible)
    expect(data).toEqual([])
  })
})
