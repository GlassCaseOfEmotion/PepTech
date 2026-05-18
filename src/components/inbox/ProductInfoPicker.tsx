'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatProductInfo } from '@/lib/product-info'
import type { ProductInfoIncludes } from '@/lib/product-info'
import type { ProductProtocol } from '@/types/protocols'
import type { ProductMediaItem } from '@/types/catalog'

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
  media: ProductMediaItem[]
}

const FAMILY_COLORS: Record<string, string> = {
  peptide:    '#10b981',
  semaglutide:'#6366f1',
  hormone:    '#f59e0b',
  sermorelin: '#06b6d4',
  supplement: '#8b5cf6',
}
function familyColor(family: string): string {
  const key = family?.toLowerCase().split(' ')[0]
  return FAMILY_COLORS[key] ?? 'var(--pt-fg-4)'
}

export function ProductInfoPicker({
  onInsert,
  onAttachFile,
  onClose,
}: {
  onInsert: (text: string) => void
  onAttachFile: (storagePath: string, label: string, bucket: 'coa' | 'product-media') => void
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
  const [selectedMedia, setSelectedMedia] = useState<ProductMediaItem | null>(null)
  const [mediaThumbnails, setMediaThumbnails] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'product' | 'library'>('product')
  const [libraryItems, setLibraryItems] = useState<{ id: string; label: string; type: string; storage_path: string }[]>([])
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryTypeFilter, setLibraryTypeFilter] = useState<'all' | 'image' | 'video' | 'pdf'>('all')
  const [libraryLoaded, setLibraryLoaded] = useState(false)

  useEffect(() => {
    supabase
      .from('products')
      .select(`
        id, name, sku, product_family, description, resources,
        product_protocols(id, tenant_id, product_id, vial_strength, reconstitution_ml, draw_volume_ml, frequency, timing, cycle_length_weeks, storage, notes, created_at, updated_at),
        batches(coa_path),
        media_product_tags(media_items(id, label, type, storage_path, sort_order))
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
            media: Array.isArray(p.media_product_tags)
              ? (p.media_product_tags as { media_items: ProductMediaItem }[])
                  .map(t => t.media_items)
                  .filter(m => m.storage_path)
                  .sort((a, b) => a.sort_order - b.sort_order)
              : [],
          }))
        )
      })
  }, [supabase])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!selected || selected.media.length === 0) return
    setMediaThumbnails(current => {
      const images = selected.media.filter(m => m.type === 'image' && !current[m.id])
      if (images.length === 0) return current
      void Promise.all(
        images.map(async m => {
          const res = await fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(m.storage_path)}&width=200`)
          if (!res.ok) return null
          const { url } = await res.json() as { url: string }
          return { id: m.id, url }
        })
      ).then(results => {
        const updates: Record<string, string> = {}
        for (const r of results) { if (r) updates[r.id] = r.url }
        if (Object.keys(updates).length > 0) {
          setMediaThumbnails(prev => ({ ...prev, ...updates }))
        }
      })
      return current
    })
  }, [selected])

  useEffect(() => {
    if (activeTab !== 'library' || libraryLoaded) return
    supabase
      .from('media_items')
      .select('id, label, type, storage_path')
      .not('storage_path', 'is', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setLibraryItems(data as { id: string; label: string; type: string; storage_path: string }[])
        setLibraryLoaded(true)
      })
  }, [activeTab, libraryLoaded, supabase])

  const filtered = products.filter(
    p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase())
  )

  const preview = selected ? formatProductInfo(selected, selected.protocol, include) : ''

  function selectProduct(p: PickerProduct) {
    setSelected(p)
    setSelectedMedia(null)
    setInclude({ description: !!p.description, protocol: !!p.protocol, resources: p.resources.length > 0 })
  }

  function handleInsert() {
    if (!selected) return
    if (preview) onInsert(preview)
    if (selectedMedia) onAttachFile(selectedMedia.storage_path, selectedMedia.label, 'product-media')
    onClose()
  }

  function handleAttachCoa() {
    if (selected?.coa_path) {
      onAttachFile(selected.coa_path, 'COA PDF', 'coa')
      onClose()
    }
  }

  return (
    <div className="pt-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pt-pip" role="dialog" aria-modal="true" aria-label="Insert product info">

        {/* Header */}
        <div className="pt-pip-hd">
          <div className="pt-pip-hd-title">
            <span className="pt-pip-hd-icon">⬡</span>
            Product Info
          </div>
          <div className="pt-pip-tabs">
            <button
              className={`pt-pip-tab${activeTab === 'product' ? ' is-on' : ''}`}
              onClick={() => setActiveTab('product')}
            >
              Product
            </button>
            <button
              className={`pt-pip-tab${activeTab === 'library' ? ' is-on' : ''}`}
              onClick={() => setActiveTab('library')}
            >
              Browse library
            </button>
          </div>
          <button className="pt-pip-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pt-pip-body">
          {activeTab === 'product' ? (
            <>
          {/* Left: search + product list */}
          <div className="pt-pip-sidebar">
            <div className="pt-pip-search-wrap">
              <span className="pt-pip-search-icon">⌕</span>
              <input
                className="pt-pip-search"
                autoFocus
                placeholder="Search by name or SKU…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>

            <div className="pt-pip-list">
              {filtered.length === 0 ? (
                <div className="pt-pip-empty">
                  {query ? `No match for "${query}"` : 'No active products'}
                </div>
              ) : filtered.map(p => (
                <button
                  key={p.id}
                  className={`pt-pip-item${selected?.id === p.id ? ' is-selected' : ''}`}
                  onClick={() => selectProduct(p)}
                >
                  <span
                    className="pt-pip-family-dot"
                    style={{ background: familyColor(p.product_family) }}
                  />
                  <div className="pt-pip-item-info">
                    <div className="pt-pip-item-name">{p.name}</div>
                    <div className="pt-pip-item-meta">{p.sku}</div>
                  </div>
                  {selected?.id === p.id && (
                    <span className="pt-pip-item-check">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right: content builder + preview */}
          <div className="pt-pip-detail">
            {!selected ? (
              <div className="pt-pip-detail-empty">
                <div className="pt-pip-detail-empty-icon">◈</div>
                <div className="pt-pip-detail-empty-text">Select a product to build your message</div>
              </div>
            ) : (
              <>
                {/* Product identity */}
                <div className="pt-pip-product-hd">
                  <div className="pt-pip-product-name">{selected.name}</div>
                  <div className="pt-pip-product-tags">
                    <span className="pt-pip-tag">{selected.sku}</span>
                    <span
                      className="pt-pip-tag"
                      style={{ background: familyColor(selected.product_family) + '18', color: familyColor(selected.product_family) }}
                    >
                      {selected.product_family}
                    </span>
                  </div>
                </div>

                {/* Include toggles */}
                <div className="pt-pip-section-label">Include in message</div>
                <div className="pt-pip-toggles">
                  {selected.description && (
                    <button
                      className={`pt-pip-toggle${include.description ? ' is-on' : ''}`}
                      onClick={() => setInclude(v => ({ ...v, description: !v.description }))}
                    >
                      <span className="pt-pip-toggle-icon">≡</span>
                      <div className="pt-pip-toggle-info">
                        <div className="pt-pip-toggle-name">Description</div>
                        <div className="pt-pip-toggle-hint">Product overview text</div>
                      </div>
                      <span className="pt-pip-toggle-check">{include.description ? '✓' : '+'}</span>
                    </button>
                  )}
                  {selected.protocol && (
                    <button
                      className={`pt-pip-toggle${include.protocol ? ' is-on' : ''}`}
                      onClick={() => setInclude(v => ({ ...v, protocol: !v.protocol }))}
                    >
                      <span className="pt-pip-toggle-icon">⊕</span>
                      <div className="pt-pip-toggle-info">
                        <div className="pt-pip-toggle-name">Protocol</div>
                        <div className="pt-pip-toggle-hint">Dosing, frequency &amp; storage</div>
                      </div>
                      <span className="pt-pip-toggle-check">{include.protocol ? '✓' : '+'}</span>
                    </button>
                  )}
                  {selected.resources.length > 0 && (
                    <button
                      className={`pt-pip-toggle${include.resources ? ' is-on' : ''}`}
                      onClick={() => setInclude(v => ({ ...v, resources: !v.resources }))}
                    >
                      <span className="pt-pip-toggle-icon">⊘</span>
                      <div className="pt-pip-toggle-info">
                        <div className="pt-pip-toggle-name">Resources</div>
                        <div className="pt-pip-toggle-hint">
                          {selected.resources.length} link{selected.resources.length !== 1 ? 's' : ''}
                          {selected.resources[0] && ` · ${selected.resources[0].label}`}
                        </div>
                      </div>
                      <span className="pt-pip-toggle-check">{include.resources ? '✓' : '+'}</span>
                    </button>
                  )}
                  {selected.media.length > 0 && (
                    <button
                      className={`pt-pip-toggle${selectedMedia ? ' is-on' : ''}`}
                      onClick={() => setSelectedMedia(selectedMedia ? null : selected.media[0])}
                    >
                      <span className="pt-pip-toggle-icon">◈</span>
                      <div className="pt-pip-toggle-info">
                        <div className="pt-pip-toggle-name">Media</div>
                        <div className="pt-pip-toggle-hint">
                          {selected.media.length} item{selected.media.length !== 1 ? 's' : ''}
                          {selectedMedia ? ` · ${selectedMedia.label} selected` : ' · tap to pick one'}
                        </div>
                      </div>
                      <span className="pt-pip-toggle-check">{selectedMedia ? '✓' : '+'}</span>
                    </button>
                  )}
                </div>

              {selected.media.length > 0 && (
                <div className="pt-pip-media-grid">
                  {selected.media.map(m => (
                    <button
                      key={m.id}
                      className={`pt-pip-media-tile${selectedMedia?.id === m.id ? ' is-selected' : ''}`}
                      onClick={() => setSelectedMedia(prev => prev?.id === m.id ? null : m)}
                      title={m.label}
                    >
                      {m.type === 'image' && mediaThumbnails[m.id] ? (
                        <img src={mediaThumbnails[m.id]} alt={m.label} className="pt-pip-media-img" loading="lazy" />
                      ) : (
                        <div className="pt-pip-media-video"><span style={{ fontSize: 14 }}>▶</span></div>
                      )}
                      <div className="pt-pip-media-label">{m.label}</div>
                    </button>
                  ))}
                </div>
              )}

                {/* Preview bubble */}
                {preview && (
                  <>
                    <div className="pt-pip-section-label">Preview</div>
                    <div className="pt-pip-preview-wrap">
                      <div className="pt-pip-bubble">{preview}</div>
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="pt-pip-actions">
                  {selected.coa_path && (
                    <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={handleAttachCoa}>
                      Attach COA PDF
                    </button>
                  )}
                  <button
                    className="pt-btn pt-btn-primary"
                    style={{ fontSize: 11 }}
                    onClick={handleInsert}
                    disabled={!preview && !selectedMedia}
                  >
                    {preview && selectedMedia
                      ? 'Insert & attach media →'
                      : selectedMedia
                        ? `Attach ${selectedMedia.label} →`
                        : 'Insert into message →'}
                  </button>
                </div>
              </>
            )}
          </div>
            </>
          ) : (
            <div className="pt-pip-library">
              <div style={{ display: 'flex', gap: 6, padding: '0 0 10px', flexWrap: 'wrap' }}>
                <input
                  className="pt-pip-search"
                  placeholder="Search…"
                  value={libraryQuery}
                  onChange={e => setLibraryQuery(e.target.value)}
                  autoFocus
                />
                {(['all', 'image', 'video', 'pdf'] as const).map(t => (
                  <button
                    key={t}
                    className={`pt-media-lib-pill${libraryTypeFilter === t ? ' is-on' : ''}`}
                    onClick={() => setLibraryTypeFilter(t)}
                  >
                    {t === 'all' ? 'All' : t === 'image' ? 'Images' : t === 'video' ? 'Videos' : 'PDFs'}
                  </button>
                ))}
              </div>
              <div className="pt-pip-lib-grid">
                {libraryItems
                  .filter(m =>
                    (libraryTypeFilter === 'all' || m.type === libraryTypeFilter) &&
                    m.label.toLowerCase().includes(libraryQuery.toLowerCase())
                  )
                  .map(m => (
                    <button
                      key={m.id}
                      className="pt-pip-lib-tile"
                      onClick={() => {
                        onAttachFile(m.storage_path, m.label, 'product-media')
                        onClose()
                      }}
                    >
                      <div className="pt-pip-lib-tile-icon">
                        {m.type === 'image' ? '🖼' : m.type === 'video' ? '▶' : '📄'}
                      </div>
                      <div className="pt-pip-lib-tile-label">{m.label}</div>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
