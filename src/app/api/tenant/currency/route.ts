import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'

export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createClient()
  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: tenant } = await supabase
    .from('tenants').select('base_currency').eq('id', userRow.tenant_id).single()
  return NextResponse.json({ base_currency: tenant?.base_currency ?? 'USD' })
}
