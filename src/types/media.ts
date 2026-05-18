export type MediaItemType = 'image' | 'video' | 'pdf'

export type MediaItem = {
  id: string
  label: string
  type: MediaItemType
  storagePath: string
  sortOrder: number
  createdAt: string
  productTags: { productId: string; productName: string }[]
  thumbnailUrl?: string
}
