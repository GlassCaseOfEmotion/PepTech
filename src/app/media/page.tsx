export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { MediaLibraryView } from '@/components/media/MediaLibraryView'
import type { MediaItem } from '@/types/media'

export default async function MediaPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: rawItems }, { data: products }] = await Promise.all([
    supabase
      .from('media_items')
      .select('id, label, type, storage_path, sort_order, created_at, media_product_tags(product_id, products(name))')
      .not('storage_path', 'is', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
  ])

  // Sign image thumbnails server-side
  const imageItems = (rawItems ?? []).filter(m => m.type === 'image')
  const thumbnailMap: Record<string, string> = {}
  if (imageItems.length > 0) {
    const signed = await Promise.all(
      imageItems.map(m =>
        supabase.storage.from('product-media')
          .createSignedUrl(m.storage_path!, 3600, { transform: { width: 400, quality: 80, resize: 'contain' } })
          .then(({ data }) => data ? { path: m.storage_path!, url: data.signedUrl } : null)
      )
    )
    for (const s of signed) {
      if (s) thumbnailMap[s.path] = s.url
    }
  }

  const items: MediaItem[] = (rawItems ?? []).map(m => ({
    id: m.id,
    label: m.label,
    type: m.type as MediaItem['type'],
    storagePath: m.storage_path!,
    sortOrder: m.sort_order,
    createdAt: m.created_at,
    productTags: ((m.media_product_tags ?? []) as { product_id: string; products: { name: string } | null }[]).map(t => ({
      productId: t.product_id,
      productName: t.products?.name ?? '',
    })),
    thumbnailUrl: thumbnailMap[m.storage_path!],
  }))

  return (
    <Shell section="Media">
      <MediaLibraryView
        items={items}
        products={(products ?? []) as { id: string; name: string }[]}
      />
    </Shell>
  )
}
