import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  const supabase = await createClient()

  let query = supabase
    .from('products')
    .select('id, sku, name, product_family, unit_price')
    .eq('is_active', true)
    .order('product_family')
    .order('name')
    .limit(20)

  if (q) {
    query = query.or(`sku.ilike.%${q}%,name.ilike.%${q}%,product_family.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
