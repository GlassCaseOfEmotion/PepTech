'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatProductInfo } from '@/lib/product-info'
import type { ProductInfoIncludes } from '@/lib/product-info'
import type { ProductProtocol } from '@/types/protocols'

type Resource = { label: string; url: string }
type PickerProduct = {
  id: string
  name: string
  sku: string
  product_family: string
  description: string | null
  resources: Resource[]
  protocol: ProductProtocol | null
  coa_path: string | null
}

export function ProductInfoPicker({
  onInsert,
  onAttachCoa,
  onClose,
}: {
  onInsert: (text: string) => void
  onAttachCoa: (storagePath: string) => void
  onClose: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [products, setProducts] = useState<PickerProduct[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PickerProduct | null>(null)
  const [include, setInclude] = useState<ProductInfoIncludes>({
    description: false,
    protocol: true,
    resources: true,
  })

  useEffect(() => {
    supabase
      .from('products')
      .select(`
        id, name, sku, product_family, description, resources,
        product_protocols(id, tenant_id, product_id, vial_strength, reconstitution_ml, draw_volume_ml, frequency, timing, cycle_length_weeks, storage, notes, created_at, updated_at),
        batches(coa_path)
      `)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (!data) return
        setProducts(
          (data as Record<string, unknown>[]).map((p) => ({
            id: p.id as string,
            name: p.name as string,
            sku: p.sku as string,
            product_family: p.product_family as string,
            description: p.description as string | null,
            resources: (p.resources as Resource[]) ?? [],
            protocol:
              Array.isArray(p.product_protocols) && p.product_protocols.length > 0
                ? (p.product_protocols[0] as ProductProtocol)
                : null,
            coa_path:
              Array.isArray(p.batches)
                ? ((p.batches as Record<string, unknown>[]).find(b => b.coa_path)?.coa_path as string | null) ?? null
                : null,
          }))
        )
      })
  }, [supabase])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const filtered = products.filter(
    p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase())
  )

  const preview = selected ? formatProductInfo(selected, selected.protocol, include) : ''

  function handleInsert() {
    if (!selected || !preview) return
    onInsert(preview)
    onClose()
  }

  function handleAttachCoa() {
    if (selected?.coa_path) {
      onAttachCoa(selected.coa_path)
      onClose()
    }
  }

  return (
    <div className="pt-tpl-picker">
      <div style={{ display: 'flex', borderBottom: '0.5px solid var(--pt-line-soft)' }}>
        <input
          className="pt-tpl-search"
          autoFocus
          placeholder="Search products…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button className="pt-iconbtn" style={{ margin: '0 8px' }} onClick={onClose} title="Close">✕</button>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: product list */}
        <div className="pt-tpl-list" style={{ width: 220, flexShrink: 0 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--pt-fg-4)' }}>
              {query ? `No products match "${query}"` : 'No products'}
            </div>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              className={`pt-tpl-item ${selected?.id === p.id ? 'is-selected' : ''}`}
              onClick={() => { setSelected(p); setInclude({ description: !!p.description, protocol: !!p.protocol, resources: p.resources.length > 0 }) }}
            >
              <div style={{ fontWeight: 600, fontSize: 12 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: 'var(--pt-fg-4)' }}>{p.sku} · {p.product_family}</div>
            </button>
          ))}
        </div>

        {/* Right: toggles + preview */}
        {selected && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 14px', gap: 10, minWidth: 0, borderLeft: '0.5px solid var(--pt-line-soft)' }}>
            {/* Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selected.description && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={include.description} onChange={e => setInclude(v => ({ ...v, description: e.target.checked }))} />
                  Description
                </label>
              )}
              {selected.protocol && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={include.protocol} onChange={e => setInclude(v => ({ ...v, protocol: e.target.checked }))} />
                  Protocol (dosing instructions)
                </label>
              )}
              {selected.resources.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={include.resources} onChange={e => setInclude(v => ({ ...v, resources: e.target.checked }))} />
                  Resources ({selected.resources.length} link{selected.resources.length !== 1 ? 's' : ''})
                </label>
              )}
            </div>

            {/* Preview */}
            {preview && (
              <div style={{ flex: 1, overflow: 'auto', fontSize: 11.5, color: 'var(--pt-fg-3)', background: 'var(--pt-bg)', borderRadius: 'var(--pt-radius)', padding: '8px 10px', whiteSpace: 'pre-wrap', fontFamily: 'var(--pt-mono)', lineHeight: 1.5 }}>
                {preview.length > 400 ? preview.slice(0, 400) + '…' : preview}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              {selected.coa_path && (
                <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={handleAttachCoa}>
                  Attach COA PDF
                </button>
              )}
              <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={handleInsert} disabled={!preview}>
                Insert into message →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
