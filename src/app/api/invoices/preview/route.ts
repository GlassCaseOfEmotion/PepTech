import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  const supabase = await createClient()

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify the path belongs to this tenant via the invoices record
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('tenant_id', userRow.tenant_id)
    .eq('pdf_path', path)
    .single()
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase.storage.from('invoices').createSignedUrl(path, 300)
  if (error || !data) return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}
