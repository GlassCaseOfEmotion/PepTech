import { NextResponse } from 'next/server'
import { getServerUser, createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })

  const supabase = await createClient()
  const svc = createServiceClient()

  // Decode the actual access token to see its claims
  const { data: { session } } = await supabase.auth.getSession()
  let tokenClaims: Record<string, unknown> = {}
  if (session?.access_token) {
    try {
      tokenClaims = JSON.parse(atob(session.access_token.split('.')[1]))
    } catch { /* ignore */ }
  }

  const { data: userRow } = await supabase
    .from('users').select('id, tenant_id, role').eq('id', user.id).single()

  const { count: convCountRLS } = await supabase
    .from('conversations').select('id', { count: 'exact', head: true })

  const { count: convCountSvc } = await svc
    .from('conversations').select('id', { count: 'exact', head: true })
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')

  return NextResponse.json({
    userId: user.id,
    userRow,
    tokenClaims,
    conversationCountViaRLS: convCountRLS,
    conversationCountServiceRole: convCountSvc,
  })
}
