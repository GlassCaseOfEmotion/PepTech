export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CatalogView } from '@/components/catalog/CatalogView'
import { dbProductToDisplay } from '@/types/catalog'
import type { DbProduct, DbBatch, ProductMediaItem } from '@/types/catalog'
import type { ProductProtocol } from '@/types/protocols'

export default async function CatalogPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString()

  const [
    { data: products },
    { data: batches },
    { data: protocols },
    { data: tenantRow },
    { data: recentOrders },
    { data: allMedia },
  ] = await Promise.all([
    supabase.from('products').select('*').eq('is_active', true).order('product_family').order('name'),
    supabase.from('batches').select('*').order('created_at', { ascending: false }),
    supabase.from('product_protocols').select('*'),
    supabase.from('tenants').select('base_currency').single(),
    supabase
      .from('orders')
      .select('created_at, order_items(product_id, qty)')
      .in('status', ['packing', 'shipped', 'delivered'])
      .gte('created_at', thirtyDaysAgo),
    supabase
      .from('product_media')
      .select('id, product_id, label, type, storage_path, sort_order')
      .not('storage_path', 'is', null)
      .order('sort_order', { ascending: true }),
  ])

  const now = Date.now()
  const velocity7dMap: Record<string, number[]> = {}
  const velocity30dMap: Record<string, number> = {}

  for (const order of (recentOrders ?? [])) {
    const daysAgo = Math.floor((now - new Date(order.created_at).getTime()) / 86400_000)
    if (daysAgo < 0 || daysAgo > 29) continue
    const items = (order.order_items ?? []) as { product_id: string; qty: number }[]
    for (const item of items) {
      velocity30dMap[item.product_id] = (velocity30dMap[item.product_id] ?? 0) + item.qty
      if (daysAgo <= 6) {
        const slot = 6 - daysAgo
        if (!velocity7dMap[item.product_id]) velocity7dMap[item.product_id] = [0, 0, 0, 0, 0, 0, 0]
        velocity7dMap[item.product_id][slot] += item.qty
      }
    }
  }

  const batchesByProduct = ((batches ?? []) as DbBatch[]).reduce<Record<string, DbBatch[]>>((acc, b) => {
    if (!acc[b.product_id]) acc[b.product_id] = []
    acc[b.product_id].push(b)
    return acc
  }, {})

  const mediaByProduct = ((allMedia ?? []) as (ProductMediaItem & { product_id: string })[])
    .reduce<Record<string, ProductMediaItem[]>>((acc, m) => {
      if (!acc[m.product_id]) acc[m.product_id] = []
      acc[m.product_id].push({
        id: m.id,
        label: m.label,
        type: m.type as 'image' | 'video',
        storage_path: m.storage_path,
        sort_order: m.sort_order,
      })
      return acc
    }, {})

  const catalogProducts = ((products ?? []) as DbProduct[]).map(p => ({
    ...dbProductToDisplay(p, batchesByProduct[p.id] ?? [], mediaByProduct[p.id] ?? []),
    velocity7d: velocity7dMap[p.id] ?? [0, 0, 0, 0, 0, 0, 0],
    velocity30dTotal: velocity30dMap[p.id] ?? 0,
  }))

  const baseCurrency = (tenantRow?.base_currency as string | null) ?? 'USD'

  return (
    <Shell section="Catalog">
      <CatalogView products={catalogProducts} protocols={(protocols ?? []) as ProductProtocol[]} baseCurrency={baseCurrency} />
    </Shell>
  )
}
