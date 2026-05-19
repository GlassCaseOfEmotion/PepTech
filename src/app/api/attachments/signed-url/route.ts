import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow || !path.startsWith(`${userRow.tenant_id}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const widthParam = searchParams.get('width')
  const width = widthParam ? parseInt(widthParam, 10) : undefined
  const transform = width && !isNaN(width) ? { width, quality: 80, resize: 'cover' as const } : undefined

  const { data, error } = await supabase.storage
    .from('media')
    .createSignedUrl(path, 3600, transform ? { transform } : undefined)
  if (error || !data) return NextResponse.json({ error: error?.message }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}
