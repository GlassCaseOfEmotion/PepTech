'use client'

import { useMemo, useState } from 'react'
import type { ExtractedProduct, ExtractionResult } from '@/lib/catalog/extraction/types'

interface EditableRow extends ExtractedProduct {
  user_edited: boolean
  removed: boolean
}

export function CatalogProposalCard({
  initial,
  onImport,
  onCancel,
  status,
}: {
  initial: ExtractionResult
  onImport: (rows: Array<ExtractedProduct & { user_edited: boolean }>) => void
  onCancel: () => void
  status: 'idle' | 'importing' | 'done' | 'cancelled'
}) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    initial.products.map(p => ({ ...p, user_edited: false, removed: false }))
  )

  const grouped = useMemo(() => {
    const m = new Map<string, EditableRow[]>()
    for (const r of rows) {
      if (r.removed) continue
      const key = r.category ?? 'Uncategorised'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(r)
    }
    return [...m.entries()]
  }, [rows])

  const visibleCount = rows.filter(r => !r.removed).length

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
        <span className="pt-proposal-hint">Click any cell to edit. Remove rows you don&apos;t want.</span>
      </div>

      {grouped.map(([category, items]) => (
        <div key={category} className="pt-proposal-group">
          <div className="pt-proposal-group-hd">{category}</div>
          <table className="pt-proposal-table">
            <thead>
              <tr><th>Name</th><th style={{ width: 120 }}>Price</th><th style={{ width: 56 }}></th></tr>
            </thead>
            <tbody>
              {items.map(r => {
                const idx = rows.indexOf(r)
                return (
                  <tr key={idx}>
                    <td>
                      <input
                        className="pt-proposal-cell"
                        value={r.name}
                        onChange={e => updateRow(idx, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="pt-proposal-cell"
                        type="number"
                        value={r.unit_price}
                        onChange={e => updateRow(idx, { unit_price: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td>
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
