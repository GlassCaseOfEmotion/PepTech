export type MediaItemType = 'image' | 'video' | 'pdf'

// Display-layer type (camelCase) — analogous to CatalogProduct vs DbProduct.
// Consumed by /media page, MediaLibraryView, and MediaItemModal.
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
