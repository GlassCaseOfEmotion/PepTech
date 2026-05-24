import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient, getServerUser } from '@/lib/supabase/server'

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = userRow.tenant_id

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: `Unsupported type: ${file.type}` }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })

  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin'
  const objectName = `${tenantId}/${randomUUID()}.${ext}`

  const { error: upErr } = await supabase.storage.from('onboarding-uploads').upload(objectName, file, {
    contentType: file.type, upsert: false,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({
    file_ref:   objectName,
    filename:   file.name,
    mime_type:  file.type,
    size:       file.size,
  })
}
