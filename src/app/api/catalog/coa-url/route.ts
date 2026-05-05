import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  if (path.includes('..')) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })

  const supabase = await createClient()

  // Resolve caller's tenant_id and verify the path is scoped to their tenant
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!path.startsWith(`${userRow.tenant_id}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase.storage.from('coa').createSignedUrl(path, 3600)
  if (error || !data) return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}
