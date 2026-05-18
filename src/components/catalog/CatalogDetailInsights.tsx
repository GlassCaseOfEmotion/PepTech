'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatAmount } from '@/lib/currency'
import type { CatalogProduct } from '@/types/catalog'
import { stockFlag } from '@/lib/catalog-utils'

export function CatalogDetailInsights({ product, products, baseCurrency }: {
  product: CatalogProduct
  products: CatalogProduct[]
  baseCurrency: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [coProducts, setCoProducts] = useState<{ product: CatalogProduct; count: number }[]>([])
  const [coLoading, setCoLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setCoLoading(true)
    setCoProducts([])
    async function load() {
      const { data: orderRows } = await supabase
        .from('order_items')
        .select('order_id')
        .eq('product_id', product.id)
      if (cancelled || !orderRows || orderRows.length === 0) {
        if (!cancelled) setCoLoading(false)
        return
      }
      const orderIds = [...new Set(orderRows.map(r => r.order_id))]
      const { data: coRows } = await supabase
        .from('order_items')
        .select('product_id')
        .in('order_id', orderIds)
        .neq('product_id', product.id)
      if (cancelled || !coRows) {
        if (!cancelled) setCoLoading(false)
        return
      }
      const freq: Record<string, number> = {}
      for (const row of coRows) {
        freq[row.product_id] = (freq[row.product_id] ?? 0) + 1
      }
      const sorted = Object.entries(freq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
      const result = sorted
        .map(([id, count]) => {
          const p = products.find(p => p.id === id)
          return p ? { product: p, count } : null
        })
        .filter((x): x is { product: CatalogProduct; count: number } => x !== null)
      if (!cancelled) { setCoProducts(result); setCoLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [product.id, supabase, products])

  if (coLoading) return null

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
