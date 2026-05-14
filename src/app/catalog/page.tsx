export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CatalogView } from '@/components/catalog/CatalogView'
import { dbProductToDisplay } from '@/types/catalog'
import type { DbProduct, DbBatch } from '@/types/catalog'
import type { ProductProtocol } from '@/types/protocols'

export default async function CatalogPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString()

  const [{ data: products }, { data: batches }, { data: protocols }, { data: tenantRow }, { data: recentOrders }] = await Promise.all([
    supabase.from('products').select('*').eq('is_active', true).order('product_family').order('name'),
    supabase.from('batches').select('*').order('created_at', { ascending: false }),
    supabase.from('product_protocols').select('*'),
    supabase.from('tenants').select('base_currency').single(),
    supabase
      .from('orders')
      .select('created_at, order_items(product_id, qty)')
      .in('status', ['packing', 'shipped', 'delivered'])
      .gte('created_at', sevenDaysAgo),
  ])

  // Build velocity map: productId → [day0…day6] units, oldest first
  const now = Date.now()
  const velocityMap: Record<string, number[]> = {}
  for (const order of (recentOrders ?? [])) {
    const daysAgo = Math.floor((now - new Date(order.created_at).getTime()) / 86400_000)
    if (daysAgo < 0 || daysAgo > 6) continue
    const slot = 6 - daysAgo // slot 0 = 6 days ago, slot 6 = today
    const items = (order.order_items ?? []) as { product_id: string; qty: number }[]
    for (const item of items) {
      if (!velocityMap[item.product_id]) velocityMap[item.product_id] = [0, 0, 0, 0, 0, 0, 0]
      velocityMap[item.product_id][slot] += item.qty
    }
  }

  const batchesByProduct = ((batches ?? []) as DbBatch[]).reduce<Record<string, DbBatch[]>>((acc, b) => {
    if (!acc[b.product_id]) acc[b.product_id] = []
    acc[b.product_id].push(b)
    return acc
  }, {})

  const catalogProducts = ((products ?? []) as DbProduct[]).map(p => ({
    ...dbProductToDisplay(p, batchesByProduct[p.id] ?? []),
    velocity7d: velocityMap[p.id] ?? [0, 0, 0, 0, 0, 0, 0],
  }))

  const baseCurrency = (tenantRow?.base_currency as string | null) ?? 'USD'

  return (
    <Shell section="Catalog">
      <CatalogView products={catalogProducts} protocols={(protocols ?? []) as ProductProtocol[]} baseCurrency={baseCurrency} />
    </Shell>
  )
}
