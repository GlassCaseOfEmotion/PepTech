'use client'

import { useState, useTransition } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { upsertProtocol } from '@/app/catalog/actions'
import { FREQUENCY_LABELS, FREQUENCY_OPTIONS } from '@/types/protocols'
import type { ProductProtocol, Frequency } from '@/types/protocols'

function ProtocolSection({ productId, protocol }: { productId: string; protocol: ProductProtocol | null }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    vialStrength: protocol?.vial_strength ?? '',
    reconstitutionMl: protocol?.reconstitution_ml?.toString() ?? '',
    drawVolumeMl: protocol?.draw_volume_ml?.toString() ?? '',
    frequency: (protocol?.frequency ?? 'once_daily') as Frequency,
    timing: protocol?.timing ?? '',
    cycleLengthWeeks: protocol?.cycle_length_weeks?.toString() ?? '',
    storage: protocol?.storage ?? '',
    notes: protocol?.notes ?? '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const recon = parseFloat(form.reconstitutionMl)
  const draw = parseFloat(form.drawVolumeMl)
  const dosesPerVial = !isNaN(recon) && !isNaN(draw) && draw > 0 ? Math.round(recon / draw) : null

  const startEdit = () => {
    setForm({
      vialStrength: protocol?.vial_strength ?? '',
      reconstitutionMl: protocol?.reconstitution_ml?.toString() ?? '',
      drawVolumeMl: protocol?.draw_volume_ml?.toString() ?? '',
      frequency: (protocol?.frequency ?? 'once_daily') as Frequency,
      timing: protocol?.timing ?? '',
      cycleLengthWeeks: protocol?.cycle_length_weeks?.toString() ?? '',
      storage: protocol?.storage ?? '',
      notes: protocol?.notes ?? '',
    })
    setError('')
    setEditing(true)
  }

  const save = () => {
    setError('')
    const reconstitutionMl = parseFloat(form.reconstitutionMl)
    const drawVolumeMl = parseFloat(form.drawVolumeMl)
    if (isNaN(reconstitutionMl) || reconstitutionMl <= 0) { setError('Reconstitution volume is required'); return }
    if (isNaN(drawVolumeMl) || drawVolumeMl <= 0) { setError('Draw volume is required'); return }
    startTransition(async () => {
      const result = await upsertProtocol({
        productId,
        vialStrength: form.vialStrength || undefined,
        reconstitutionMl,
        drawVolumeMl,
        frequency: form.frequency,
        timing: form.timing || undefined,
        cycleLengthWeeks: form.cycleLengthWeeks ? parseInt(form.cycleLengthWeeks) : null,
        storage: form.storage || undefined,
        notes: form.notes || undefined,
      })
      if ('error' in result) { setError(result.error); return }
      setEditing(false)
    })
  }

  return (
    <section className="pt-card pt-cat-section">
      <header className="pt-card-hd">
        <div>
          <h3>Protocol</h3>
          <p>Dosage &amp; usage instructions</p>
        </div>
        {!editing && (
          <button className="pt-link" onClick={startEdit}>
            {protocol ? 'Edit' : '+ Add protocol'}
          </button>
        )}
      </header>
      <div className="pt-card-body" style={{ padding: editing ? '12px 14px' : 0 }}>
        {!protocol && !editing && (
          <EmptyState
            size="sm"
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                <circle cx="12" cy="12" r="9"/>
                <line x1="12" y1="8" x2="12" y2="13"/>
                <circle cx="12" cy="16" r="0.8" fill="currentColor" stroke="none"/>
              </svg>
            }
            title="No protocol configured"
            body="Add a protocol to enable automatic reorder signals."
          />
        )}
        {protocol && !editing && (
          <dl className="pt-cat-proto-dl">
            {protocol.vial_strength && <><dt>Vial strength</dt><dd className="mono">{protocol.vial_strength}</dd></>}
            <dt>Reconstitution</dt><dd className="mono">{protocol.reconstitution_ml} mL</dd>
            <dt>Draw volume</dt>
            <dd className="mono">
              {protocol.draw_volume_ml} mL
              <span className="pt-cat-proto-derived"> → {Math.round(protocol.reconstitution_ml / protocol.draw_volume_ml)} doses/vial</span>
            </dd>
            <dt>Frequency</dt><dd>{FREQUENCY_LABELS[protocol.frequency as Frequency] ?? protocol.frequency}</dd>
            {protocol.timing && <><dt>Timing</dt><dd style={{ color: 'var(--pt-fg-3)' }}>{protocol.timing}</dd></>}
            {protocol.cycle_length_weeks && <><dt>Cycle</dt><dd style={{ color: 'var(--pt-fg-3)' }}>{protocol.cycle_length_weeks} weeks</dd></>}
            {protocol.storage && <><dt>Storage</dt><dd style={{ color: 'var(--pt-fg-3)' }}>{protocol.storage}</dd></>}
            {protocol.notes && <><dt>Notes</dt><dd style={{ color: 'var(--pt-fg-3)' }}>{protocol.notes}</dd></>}
          </dl>
        )}
        {editing && (
          <div className="pt-cat-proto-form">
            <div className="pt-cat-proto-grid">
              <div>
                <label className="pt-sku-lbl">Vial strength</label>
                <input className="pt-input" placeholder="e.g. 5mg" value={form.vialStrength} onChange={set('vialStrength')} />
              </div>
              <div>
                <label className="pt-sku-lbl">Frequency <span style={{ color: 'var(--pt-danger)' }}>*</span></label>
                <select className="pt-input" value={form.frequency} onChange={set('frequency')}>
                  {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                </select>
              </div>
              <div>
                <label className="pt-sku-lbl">Reconstitution volume (mL) <span style={{ color: 'var(--pt-danger)' }}>*</span></label>
                <input className="pt-input" type="number" step="0.1" min="0" placeholder="e.g. 2.0" value={form.reconstitutionMl} onChange={set('reconstitutionMl')} />
              </div>
              <div>
                <label className="pt-sku-lbl">Draw volume per injection (mL) <span style={{ color: 'var(--pt-danger)' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <input className="pt-input" type="number" step="0.01" min="0" placeholder="e.g. 0.1" value={form.drawVolumeMl} onChange={set('drawVolumeMl')} />
                  {dosesPerVial !== null && (
                    <span className="pt-cat-proto-derived" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      → {dosesPerVial} doses/vial
                    </span>
                  )}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="pt-sku-lbl">Timing</label>
                <input className="pt-input" placeholder="e.g. nightly, empty stomach" value={form.timing} onChange={set('timing')} />
              </div>
              <div>
                <label className="pt-sku-lbl">Cycle length (weeks)</label>
                <input className="pt-input" type="number" min="1" placeholder="e.g. 12" value={form.cycleLengthWeeks} onChange={set('cycleLengthWeeks')} />
              </div>
              <div>
                <label className="pt-sku-lbl">Storage</label>
                <input className="pt-input" placeholder="e.g. refrigerate after reconstituting" value={form.storage} onChange={set('storage')} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="pt-sku-lbl">Usage notes</label>
                <textarea className="pt-input" rows={2} placeholder="Needle type, preloading tips, etc." value={form.notes} onChange={set('notes')} style={{ resize: 'vertical' }} />
              </div>
            </div>
            {error && <div className="pt-cat-form-err" style={{ marginTop: 8 }}>{error}</div>}
            <div className="pt-cat-form-actions">
              <button className="pt-btn pt-btn-ghost" onClick={() => setEditing(false)} disabled={pending}>Cancel</button>
              <button className="pt-btn pt-btn-primary" onClick={save} disabled={pending}>
                {pending ? 'Saving…' : 'Save protocol'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export { ProtocolSection as CatalogDetailProtocol }
