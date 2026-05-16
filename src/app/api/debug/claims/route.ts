import { NextResponse } from 'next/server'
import { getServerUser, createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })

  const supabase = await createClient()
  const svc = createServiceClient()

  // What does the user-scoped client see for their own row?
  const { data: userRow } = await supabase
    .from('users').select('id, tenant_id, role').eq('id', user.id).single()

  // What does the user-scoped client see for conversations? (RLS applied)
  const { count: convCount } = await supabase
    .from('conversations').select('id', { count: 'exact', head: true })

  // What does the service client see? (no RLS)
  const { count: convCountSvc } = await svc
    .from('conversations').select('id', { count: 'exact', head: true })
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')

  // Read auth_tenant_id() via a raw SQL select
  const { data: tenantIdRow } = await supabase
    .rpc('get_auth_tenant_id' as never)

  return NextResponse.json({
    userId: user.id,
    userEmail: user.email,
    userRow,
    conversationCountViaRLS: convCount,
    conversationCountServiceRole: convCountSvc,
    authTenantId: tenantIdRow,
  })
}
