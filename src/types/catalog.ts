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
  batches: DbBatch[]
  totalStock: number
  velocity7d: number[] // 7 daily unit totals, oldest→newest
}

export function dbProductToDisplay(product: DbProduct, batches: DbBatch[]): CatalogProduct {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    productFamily: product.product_family,
    unitPrice: product.unit_price,
    costPrice: product.cost_price ?? null,
    description: product.description,
    isActive: product.is_active,
    batches,
    totalStock: batches.reduce((sum, b) => sum + b.stock, 0),
    velocity7d: [0, 0, 0, 0, 0, 0, 0],
  }
}

export function grossMargin(unitPrice: number, costPrice: number | null): number | null {
  if (costPrice === null || costPrice <= 0 || unitPrice <= 0) return null
  return ((unitPrice - costPrice) / unitPrice) * 100
}
