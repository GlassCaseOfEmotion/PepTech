export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CatalogView } from '@/components/catalog/CatalogView'
import { dbProductToDisplay } from '@/types/catalog'
import type { DbProduct, DbBatch } from '@/types/catalog'

export default async function CatalogPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any

  const [{ data: products }, { data: batches }] = await Promise.all([
    supabaseAny.from('products').select('*').eq('is_active', true).order('product_family').order('name'),
    supabaseAny.from('batches').select('*').order('created_at', { ascending: false }),
  ])

  const batchesByProduct = ((batches ?? []) as DbBatch[]).reduce<Record<string, DbBatch[]>>((acc, b) => {
    if (!acc[b.product_id]) acc[b.product_id] = []
    acc[b.product_id].push(b)
    return acc
  }, {})

  const catalogProducts = ((products ?? []) as DbProduct[]).map(p =>
    dbProductToDisplay(p, batchesByProduct[p.id] ?? [])
  )

  return (
    <Shell section="Catalog">
      <CatalogView products={catalogProducts} />
    </Shell>
  )
}
