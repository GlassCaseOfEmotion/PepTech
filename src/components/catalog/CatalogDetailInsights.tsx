'use client'

import { formatAmount } from '@/lib/currency'
import type { CatalogProduct } from '@/types/catalog'
import { stockFlag } from '@/lib/catalog-utils'

export function CatalogDetailInsights({ products, baseCurrency, coProductIds }: {
  products: CatalogProduct[]
  baseCurrency: string
  coProductIds: { productId: string; count: number }[]
}) {
  const coProducts = coProductIds
    .map(({ productId, count }) => {
      const p = products.find(p => p.id === productId)
      return p ? { product: p, count } : null
    })
    .filter((x): x is { product: CatalogProduct; count: number } => x !== null)

  return (
    <section className="pt-card pt-cat-section">
      <header className="pt-card-hd">
        <div>
          <h3>Frequently ordered together</h3>
          <p>Based on order history</p>
        </div>
      </header>
      {coProducts.length === 0 ? (
        <div style={{ padding: '14px 14px 16px', color: 'var(--pt-fg-4)', fontSize: 12 }}>
          No data yet — will populate as orders come in.
        </div>
      ) : (
        <div className="pt-cat-affinity-body">
          {coProducts.map(({ product: p, count }) => {
            const pFlag = stockFlag(p.totalStock)
            return (
              <div key={p.id} className="pt-cat-aff">
                <span className="pt-cat-cat-pill" data-cat={p.productFamily}>{p.productFamily}</span>
                <div>
                  <div className="pt-cat-aff-name">{p.name}</div>
                  <div className="pt-cat-aff-sub mono">{p.sku} · {formatAmount(p.unitPrice, baseCurrency)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                  <div className={`pt-cat-aff-stock mono ${pFlag ? 'is-low' : ''}`}>{p.totalStock}</div>
                  <div style={{ fontSize: 10, color: 'var(--pt-fg-4)' }}>{count}×</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
