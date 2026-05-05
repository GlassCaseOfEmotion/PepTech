import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase.storage.from('coa').createSignedUrl(path, 3600)
  if (error || !data) return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}
