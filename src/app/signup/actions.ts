'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { redirect } from 'next/navigation'

export async function signupAction(formData: FormData) {
  const businessName = formData.get('businessName') as string
  const email        = formData.get('email') as string
  const password     = formData.get('password') as string

  // Service role client bypasses RLS to create tenant + user rows
  const service = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 1. Create auth user
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return redirect(`/signup?error=${encodeURIComponent(authError?.message ?? 'Signup failed')}`)
  }

  // 2. Create tenant — slug derived from business name + timestamp for uniqueness
  const slug = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${Date.now()}`

  const { data: tenant, error: tenantError } = await service
    .from('tenants')
    .insert({ name: businessName, slug })
    .select()
    .single()

  if (tenantError || !tenant) {
    // Clean up the auth user we just created
    await service.auth.admin.deleteUser(authData.user.id)
    return redirect('/signup?error=Could+not+create+workspace')
  }

  // 3. Create user record linked to tenant
  const { error: userError } = await service.from('users').insert({
    id: authData.user.id,
    tenant_id: tenant.id,
    role: 'owner',
    email,
    display_name: email.split('@')[0],
  })

  if (userError) {
    await service.auth.admin.deleteUser(authData.user.id)
    return redirect('/signup?error=Could+not+create+user+record')
  }

  // 4. Sign them in with a session cookie
  const supabase = await createClient()
  await supabase.auth.signInWithPassword({ email, password })

  redirect('/inbox')
}
