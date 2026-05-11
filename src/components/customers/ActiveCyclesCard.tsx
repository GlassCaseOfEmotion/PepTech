'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { upsertProtocolOverride } from '@/app/customers/actions'
import { isCycle, FREQUENCY_LABELS, FREQUENCY_OPTIONS } from '@/types/protocols'
import type { CycleEntry, ActiveCycle, Frequency } from '@/types/protocols'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function DaysLabel({ cycle }: { cycle: ActiveCycle }) {
  if (cycle.status === 'critical') {
    return <span className="pt-cu-supply-days is-critical">Supply elapsed</span>
  }
  return (
    <span className={`pt-cu-supply-days is-${cycle.status}`}>
      {Math.max(0, Math.round(cycle.daysRemaining))} days left
    </span>
  )
}

function CycleRow({ cycle, customerId }: { cycle: ActiveCycle; customerId: string }) {
  const router = useRouter()
  const [showOverride, setShowOverride] = useState(false)
  const [drawMl, setDrawMl] = useState(cycle.effectiveDrawMl.toString())
  const [freq, setFreq] = useState<Frequency>(cycle.effectiveFrequency)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const pct = Math.max(0, Math.min(100, cycle.pctRemaining * 100))

  const saveOverride = () => {
    setError('')
    const drawVolumeMl = parseFloat(drawMl)
    if (isNaN(drawVolumeMl) || drawVolumeMl <= 0) { setError('Draw volume must be greater than 0'); return }
    startTransition(async () => {
      const result = await upsertProtocolOverride({
        customerId,
        productId: cycle.productId,
        drawVolumeMl,
        frequency: freq,
        notes: notes || null,
      })
      if ('error' in result) { setError(result.error); return }
      setShowOverride(false)
      router.refresh()
    })
  }

  return (
    <li className="pt-cu-cycle-row">
      <div className="pt-cu-cycle-top">
        <span className="pt-cu-cycle-name">{cycle.productName}</span>
        <span className="pt-cu-cycle-badge">
          {cycle.effectiveDrawMl}ml · {FREQUENCY_LABELS[cycle.effectiveFrequency]}
          {cycle.hasOverride && <span className="pt-cu-cycle-custom"> ★ custom</span>}
        </span>
        <DaysLabel cycle={cycle} />
        <button
          className="pt-cu-cycle-edit"
          title="Customise dose for this customer"
          onClick={() => setShowOverride(v => !v)}
        >
          ✎
        </button>
      </div>
      <div className="pt-cu-cycle-bar">
        <div className={`pt-cu-cycle-fill is-${cycle.status}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="pt-cu-cycle-meta">
        <span>Ordered {fmtDate(cycle.orderDate)} · {cycle.unitsOrdered} vial{cycle.unitsOrdered !== 1 ? 's' : ''} · {Math.round(cycle.totalDays)} day supply</span>
        {cycle.status === 'low' && <span className="pt-cu-cycle-warn">⚠ Running low · reorder soon</span>}
        {cycle.status === 'critical' && <span className="pt-cu-cycle-warn is-critical">● Likely needs reorder</span>}
        {cycle.status === 'ok' && <span style={{ color: 'var(--pt-fg-4)' }}>Est. end {fmtDate(cycle.estimatedEndDate)}</span>}
      </div>
      {showOverride && (
        <div className="pt-cu-cycle-override">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 3 }}>Draw volume (mL)</div>
              <input className="pt-input mono" style={{ fontSize: 12 }} value={drawMl} onChange={e => setDrawMl(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 3 }}>Frequency</div>
              <select className="pt-input" style={{ fontSize: 12 }} value={freq} onChange={e => setFreq(e.target.value as Frequency)}>
                {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 3 }}>Notes (optional)</div>
              <input className="pt-input" style={{ fontSize: 12 }} placeholder="e.g. uses 0.2ml, high bodyweight" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          {error && <div style={{ fontSize: 11, color: 'var(--pt-danger)', marginTop: 6 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={saveOverride} disabled={pending}>
              {pending ? 'Saving…' : 'Save override'}
            </button>
            <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowOverride(false)}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  )
}

export function ActiveCyclesCard({ cycles, customerId }: { cycles: CycleEntry[]; customerId: string }) {
  if (cycles.length === 0) {
    return (
      <section className="pt-card">
        <header className="pt-card-hd">
          <div><h3>Active cycles</h3><p>Derived from order history + configured protocols</p></div>
        </header>
        <div className="pt-card-body">
          <div style={{ fontSize: 12, color: 'var(--pt-fg-4)' }}>No orders yet</div>
        </div>
      </section>
    )
  }

  return (
    <section className="pt-card">
      <header className="pt-card-hd">
        <div><h3>Active cycles</h3><p>Derived from order history + configured protocols</p></div>
      </header>
      <div className="pt-card-body" style={{ padding: 0 }}>
        <ul className="pt-cu-cycles-list">
          {cycles.map(entry =>
            isCycle(entry)
              ? <CycleRow key={entry.productId} cycle={entry} customerId={customerId} />
              : (
                <li key={entry.productId} className="pt-cu-cycle-row pt-cu-cycle-no-protocol">
                  <span className="pt-cu-cycle-name" style={{ color: 'var(--pt-fg-3)' }}>{entry.productName}</span>
                  <span style={{ fontSize: 11, color: 'var(--pt-fg-4)' }}>No protocol configured</span>
                  <Link href="/catalog" className="pt-link" style={{ fontSize: 11 }}>Set up in Catalog →</Link>
                </li>
              )
          )}
        </ul>
      </div>
    </section>
  )
}
