export type ProductMediaItem = {
  id: string
  label: string
  type: 'image' | 'video'
  storage_path: string
  sort_order: number
  thumbnailUrl?: string
}

export type DbProduct = {
  id: string
  tenant_id: string
  sku: string
  name: string
  product_family: string
  unit_price: number
  cost_price: number | null
  description: string | null
  is_active: boolean
  created_at: string
  resources: { label: string; url: string }[]
}

export type DbBatch = {
  id: string
  tenant_id: string
  product_id: string
  batch_number: string
  coa_path: string | null
  stock: number
  expires_at: string | null
  created_at: string
}

export type CatalogProduct = {
  id: string
  sku: string
  name: string
  productFamily: string
  unitPrice: number
  costPrice: number | null
  description: string | null
  isActive: boolean
  resources: { label: string; url: string }[]
  media: ProductMediaItem[]
  batches: DbBatch[]
  totalStock: number
  velocity7d: number[]   // 7 daily unit totals, oldest→newest (sparkline)
  velocity30dTotal: number // total units in last 30 days (cover denominator)
}

export function dbProductToDisplay(
  product: DbProduct,
  batches: DbBatch[],
  media: ProductMediaItem[] = [],
): CatalogProduct {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    productFamily: product.product_family,
    unitPrice: product.unit_price,
    costPrice: product.cost_price ?? null,
    description: product.description,
    isActive: product.is_active,
    resources: product.resources,
    media,
    batches,
    totalStock: batches.reduce((sum, b) => sum + b.stock, 0),
    velocity7d: [0, 0, 0, 0, 0, 0, 0],
    velocity30dTotal: 0,
  }
}

export function grossMargin(unitPrice: number, costPrice: number | null): number | null {
  if (costPrice === null || costPrice <= 0 || unitPrice <= 0) return null
  return ((unitPrice - costPrice) / unitPrice) * 100
}
