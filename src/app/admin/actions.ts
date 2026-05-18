'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getServerUser, createServiceClient, createClient } from '@/lib/supabase/server'

async function assertPlatformAdmin() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data } = await supabase.from('platform_admins').select('id').eq('id', user.id).single()
  if (!data) redirect('/')
  return user
}

export async function setTenantActive(tenantId: string, isActive: boolean) {
  await assertPlatformAdmin()
  const svc = createServiceClient()
  await svc.from('tenants').update({ is_active: isActive }).eq('id', tenantId)
  revalidatePath('/admin')
  revalidatePath(`/admin/tenants/${tenantId}`)
}

export async function deleteTenant(tenantId: string) {
  await assertPlatformAdmin()
  const svc = createServiceClient()
  const { data: tenantUsers } = await svc.from('users').select('id').eq('tenant_id', tenantId)
  // Delete auth users first (parallel), then tenant cascade cleans public.users
  await Promise.all((tenantUsers ?? []).map(u => svc.auth.admin.deleteUser(u.id)))
  await svc.from('tenants').delete().eq('id', tenantId)
  revalidatePath('/admin')
  redirect('/admin')
}

export async function createTenant(formData: FormData) {
  await assertPlatformAdmin()
  const svc = createServiceClient()
  const name    = formData.get('name') as string
  const email   = formData.get('email') as string
  const password = formData.get('password') as string
  const plan    = (formData.get('plan') as string) || 'starter'
  const slug    = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now()

  const { data: tenant, error: tenantErr } = await svc
    .from('tenants').insert({ name, slug, plan }).select('id').single()
  if (tenantErr || !tenant) throw new Error('Failed to create tenant: ' + tenantErr?.message)

  const { data: authUser, error: authErr } = await svc.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (authErr || !authUser.user) {
    await svc.from('tenants').delete().eq('id', tenant.id)
    throw new Error('Failed to create user: ' + authErr?.message)
  }

  await svc.from('users').insert({
    id: authUser.user.id, tenant_id: tenant.id,
    role: 'owner', display_name: name, email,
  })

  try {
    await svc.rpc('seed_default_automations', { p_tenant_id: tenant.id })
  } catch (err) {
    console.error('seed_default_automations failed for tenant', tenant.id, err)
  }

  revalidatePath('/admin')
  redirect(`/admin/tenants/${tenant.id}`)
}

export async function grantPlatformAdmin(formData: FormData) {
  const admin = await assertPlatformAdmin()
  const email = formData.get('email') as string
  const svc = createServiceClient()
  const { data: authData } = await svc.auth.admin.listUsers()
  const target = authData?.users.find(u => u.email === email)
  if (!target) throw new Error('No user found with that email')
  await svc.from('platform_admins').insert({ id: target.id, granted_by: admin.id })
  revalidatePath('/admin/platform-admins')
}

export async function revokePlatformAdmin(userId: string) {
  await assertPlatformAdmin()
  const svc = createServiceClient()
  await svc.from('platform_admins').delete().eq('id', userId)
  revalidatePath('/admin/platform-admins')
}
