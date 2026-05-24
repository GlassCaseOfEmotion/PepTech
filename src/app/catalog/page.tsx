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
      .from('media_product_tags')
      .select('product_id, media_items!inner(id, label, type, storage_path, sort_order)'),
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

  // Sign all image thumbnails server-side in parallel — no client round trips needed.
  // Filter out rows where storage_path is null (upload not yet confirmed) and sort by sort_order.
  const allMediaRows = ((allMedia ?? []) as {
    product_id: string
    media_items: { id: string; label: string; type: string; storage_path: string | null; sort_order: number }
  }[]).filter(row => row.media_items.storage_path)
    .sort((a, b) => a.media_items.sort_order - b.media_items.sort_order)

  const imageMediaItems = allMediaRows.filter(row => row.media_items.type === 'image')
  const thumbnailUrlMap: Record<string, string> = {}
  if (imageMediaItems.length > 0) {
    const signed = await Promise.all(
      imageMediaItems.map(row =>
        supabase.storage.from('product-media')
          .createSignedUrl(row.media_items.storage_path!, 3600, { transform: { width: 400, quality: 80, resize: 'contain' } })
          .then(({ data }) => data ? { path: row.media_items.storage_path!, url: data.signedUrl } : null)
      )
    )
    for (const item of signed) {
      if (item) thumbnailUrlMap[item.path] = item.url
    }
  }

  const mediaByProduct = allMediaRows.reduce<Record<string, ProductMediaItem[]>>((acc, row) => {
    const m = row.media_items
    if (!acc[row.product_id]) acc[row.product_id] = []
    acc[row.product_id].push({
      id: m.id,
      label: m.label,
      type: m.type as 'image' | 'video' | 'pdf',
      storage_path: m.storage_path!,
      sort_order: m.sort_order,
      thumbnailUrl: thumbnailUrlMap[m.storage_path!],
    })
    return acc
  }, {})

  const catalogProducts = ((products ?? []) as unknown as DbProduct[]).map(p => ({
    ...dbProductToDisplay(p, batchesByProduct[p.id] ?? [], mediaByProduct[p.id] ?? []),
    velocity7d: velocity7dMap[p.id] ?? [0, 0, 0, 0, 0, 0, 0],
    velocity30dTotal: velocity30dMap[p.id] ?? 0,
  }))

  // Co-product affinity — computed from the already-fetched recentOrders, no extra DB query.
  // For each order, every pair of products in it gets a co-occurrence count.
  const coFreq: Record<string, Record<string, number>> = {}
  for (const order of (recentOrders ?? [])) {
    const ids = ((order.order_items ?? []) as { product_id: string }[]).map(i => i.product_id)
    for (const pid of ids) {
      for (const other of ids) {
        if (pid === other) continue
        if (!coFreq[pid]) coFreq[pid] = {}
        coFreq[pid][other] = (coFreq[pid][other] ?? 0) + 1
      }
    }
  }
  const coProductsByProductId: Record<string, { productId: string; count: number }[]> = {}
  for (const [pid, freq] of Object.entries(coFreq)) {
    coProductsByProductId[pid] = Object.entries(freq)
      .map(([productId, count]) => ({ productId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }

  const baseCurrency = (tenantRow?.base_currency as string | null) ?? 'USD'

  return (
    <Shell section="Catalog">
      <CatalogView
        products={catalogProducts}
        protocols={(protocols ?? []) as ProductProtocol[]}
        baseCurrency={baseCurrency}
        coProductsByProductId={coProductsByProductId}
      />
    </Shell>
  )
}
