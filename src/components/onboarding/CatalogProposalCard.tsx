'use client'

import { useMemo, useState } from 'react'
import {
  CANONICAL_FAMILIES,
  PRESENTATION_OPTIONS,
  type ExtractedProduct,
  type ExtractionResult,
  type Presentation,
} from '@/lib/catalog/extraction/types'

interface EditableRow extends ExtractedProduct {
  user_edited: boolean
  removed: boolean
}

interface Props {
  initial: ExtractionResult
  onImport: (rows: Array<ExtractedProduct & { user_edited: boolean }>) => void
  onCancel: () => void
  status: 'idle' | 'importing' | 'done' | 'cancelled'
  /** Tenant's business type — drives the canonical family dropdown. */
  businessType: 'peptides' | 'nootropics' | 'sarms' | 'general' | null
}

function familySortKey(canonical: string[]): (f: string | null) => number {
  return (f) => {
    if (!f) return canonical.length + 1
    const i = canonical.indexOf(f)
    return i === -1 ? canonical.length : i
  }
}

function formatPrice(value: number, currency: string | null): string {
  // Locale-aware grouping; show no decimals for IDR (which uses dots as
  // thousands and rarely has fractional units anyway) and 2 decimals
  // elsewhere unless the value is an integer.
  if (currency === 'IDR') {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  const isInt = Number.isInteger(value)
  return value.toLocaleString('en-US', { minimumFractionDigits: isInt ? 0 : 2, maximumFractionDigits: 2 })
}

export function CatalogProposalCard({ initial, onImport, onCancel, status, businessType }: Props) {
  const families = businessType ? CANONICAL_FAMILIES[businessType] : ['OTHER']
  const sortKey = familySortKey(families)

  const [rows, setRows] = useState<EditableRow[]>(() =>
    initial.products.map(p => ({ ...p, user_edited: false, removed: false }))
  )

  // Group by family, in canonical order. Rows whose family no longer matches
  // any canonical slug fall under "Other".
  const grouped = useMemo(() => {
    const m = new Map<string, EditableRow[]>()
    for (const r of rows) {
      if (r.removed) continue
      const key = r.family ?? 'OTHER'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(r)
    }
    return [...m.entries()].sort((a, b) => sortKey(a[0]) - sortKey(b[0]))
  }, [rows, sortKey])

  const visibleRows = rows.filter(r => !r.removed)
  const visibleCount = visibleRows.length
  const totalStock = visibleRows.reduce((s, r) => s + (r.stock || 0), 0)

  function updateRow(index: number, patch: Partial<EditableRow>) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch, user_edited: true } : r))
  }
  function removeRow(index: number) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, removed: true } : r))
  }

  function commit() {
    const payload = rows
      .filter(r => !r.removed)
      .map(({ removed: _removed, user_edited, ...rest }) => ({ ...rest, user_edited }))
    onImport(payload)
  }

  if (status === 'done') {
    return (
      <div className="pt-proposal pt-proposal-done">
        <span className="pt-proposal-done-check" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <polyline points="2,7 6,11 12,3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        Imported {visibleCount} product{visibleCount === 1 ? '' : 's'}.
      </div>
    )
  }
  if (status === 'cancelled') {
    return <div className="pt-proposal pt-proposal-cancelled">Import cancelled.</div>
  }

  const importing = status === 'importing'

  return (
    <div className={`pt-proposal${importing ? ' is-importing' : ''}`}>
      <div className="pt-proposal-hd">
        <strong>{visibleCount} products extracted</strong>
        {initial.detected_currency && <span className="pt-proposal-cur">· {initial.detected_currency}</span>}
        <span className="pt-proposal-cur">· {totalStock} units on hand</span>
        <span className="pt-proposal-hint">Click a cell to edit · change family to reorganise.</span>
      </div>

      {grouped.map(([family, items]) => (
        <div key={family} className="pt-proposal-group">
          <div className="pt-proposal-group-hd">
            <span className={`pt-proposal-family-chip pt-fam-${family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{family}</span>
            <span className="pt-proposal-group-count">{items.length} product{items.length === 1 ? '' : 's'}</span>
          </div>
          <table className="pt-proposal-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>SKU</th>
                <th className="pt-proposal-th-name">Name</th>
                <th style={{ width: 90 }}>Format</th>
                <th style={{ width: 120, textAlign: 'right' }}>Price</th>
                <th style={{ width: 70, textAlign: 'right' }}>Stock</th>
                <th style={{ width: 100 }}>Family</th>
                <th style={{ width: 32 }} aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(r => {
                const idx = rows.indexOf(r)
                return (
                  <tr key={idx} className={r.confidence < 0.6 ? 'is-low-confidence' : undefined}>
                    <td>
                      <input
                        className="pt-proposal-cell pt-proposal-cell-sku mono"
                        value={r.sku}
                        onChange={e => updateRow(idx, { sku: e.target.value.toUpperCase() })}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      <input
                        className="pt-proposal-cell"
                        value={r.name}
                        onChange={e => updateRow(idx, { name: e.target.value })}
                        title={r.raw_name !== r.name ? `Source: ${r.raw_name}` : undefined}
                      />
                    </td>
                    <td>
                      <select
                        className="pt-proposal-cell pt-proposal-select"
                        value={r.presentation ?? ''}
                        onChange={e => updateRow(idx, { presentation: (e.target.value || null) as Presentation | null })}
                      >
                        <option value="">—</option>
                        {PRESENTATION_OPTIONS.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        className="pt-proposal-cell pt-proposal-cell-num mono"
                        type="number"
                        min={0}
                        value={r.unit_price}
                        onChange={e => updateRow(idx, { unit_price: Number(e.target.value) || 0 })}
                        title={initial.detected_currency
                          ? `${formatPrice(r.unit_price, initial.detected_currency)} ${initial.detected_currency}`
                          : undefined}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        className="pt-proposal-cell pt-proposal-cell-num mono"
                        type="number"
                        min={0}
                        step={1}
                        value={r.stock}
                        onChange={e => updateRow(idx, { stock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                      />
                    </td>
                    <td>
                      <select
                        className="pt-proposal-cell pt-proposal-select"
                        value={r.family ?? 'OTHER'}
                        onChange={e => updateRow(idx, { family: e.target.value })}
                      >
                        {families.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="pt-proposal-rm"
                        onClick={() => removeRow(idx)}
                        aria-label="Remove row"
                      >×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {initial.tenant_notes.length > 0 && (
        <div className="pt-proposal-notes">
          <strong>Notes from the supplier:</strong>
          <ul>{initial.tenant_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}

      {importing ? (
        <div className="pt-proposal-importing">
          <div className="pt-proposal-importing-row">
            <span className="pt-proposal-importing-label">
              Importing {visibleCount} product{visibleCount === 1 ? '' : 's'}…
            </span>
          </div>
          <div className="pt-proposal-progress" role="progressbar" aria-busy="true" aria-label="Importing products" />
        </div>
      ) : (
        <div className="pt-proposal-foot">
          <button className="pt-btn pt-btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="pt-btn pt-btn-primary"
            onClick={commit}
            disabled={visibleCount === 0}
          >
            {`Looks good — import ${visibleCount} →`}
          </button>
        </div>
      )}
    </div>
  )
}
