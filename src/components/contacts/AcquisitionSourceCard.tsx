'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setAcquisitionSource, type AcquisitionSource } from '@/app/contacts/actions'
import { useToast, Toast } from '@/components/ui/Toast'
import { CustomerPicker, type PickedCustomer } from '@/components/ui/CustomerPicker'

const SOURCE_LABELS: Record<AcquisitionSource, string> = {
  referral:   'Referral',
  community:  'Community',
  group_chat: 'Group chat',
  direct:     'Direct',
  other:      'Other',
}

interface Props {
  customerId: string
  initialSource: AcquisitionSource | null
  initialNote: string | null
  initialReferredBy: PickedCustomer | null
}

export function AcquisitionSourceCard({ customerId, initialSource, initialNote, initialReferredBy }: Props) {
  const [source, setSource] = useState<AcquisitionSource | null>(initialSource)
  const [note, setNote]     = useState(initialNote ?? '')
  const [referredBy, setReferredBy] = useState<PickedCustomer | null>(initialReferredBy)
  const [, start]           = useTransition()
  const router = useRouter()
  const { toast, showToast } = useToast()
  const reqIdRef = useRef(0)
  const lastCommittedRef = useRef<AcquisitionSource | null>(initialSource)

  function save(nextSource: AcquisitionSource | null, nextReferrer: PickedCustomer | null = referredBy) {
    const myReq = ++reqIdRef.current
    const prev = lastCommittedRef.current
    start(async () => {
      const result = await setAcquisitionSource(customerId, {
        source: nextSource,
        note: nextSource === 'other' ? note : null,
        referredByCustomerId: nextSource === 'referral' ? (nextReferrer?.id ?? null) : null,
      })
      if (myReq !== reqIdRef.current) return
      if ('error' in result) {
        setSource(prev)
        showToast(result.error, 'err')
        return
      }
      lastCommittedRef.current = nextSource
      router.refresh()
    })
  }

  function pickSource(s: AcquisitionSource | null) {
    setSource(s)
    if (s === 'other') return // defer until note typed
    save(s)
  }

  function saveOther() {
    if (!note.trim()) return
    save('other')
  }

  function pickReferrer(c: PickedCustomer | null) {
    setReferredBy(c)
    save('referral', c)
  }

  return (
    <section className="pt-card" style={{ marginBottom: 12 }}>
      <header className="pt-card-hd">
        <div><h3>Acquisition source</h3></div>
      </header>
      <div className="pt-card-body">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(Object.keys(SOURCE_LABELS) as AcquisitionSource[]).map(s => (
            <button
              key={s}
              type="button"
              className={`pt-chip${source === s ? ' is-on' : ''}`}
              onClick={() => pickSource(s)}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
          {source && (
            <button
              type="button"
              className="pt-btn pt-btn-ghost"
              style={{ height: 26, padding: '0 8px', fontSize: 11 }}
              onClick={() => {
                setSource(null)
                save(null)
              }}
            >
              Clear
            </button>
          )}
        </div>

        {source === 'other' && (
          <input
            type="text"
            placeholder="Where from?"
            className="pt-input"
            style={{ marginTop: 8, width: '100%', boxSizing: 'border-box' }}
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={saveOther}
          />
        )}
        {source === 'referral' && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginBottom: 4 }}>Referred by (optional)</div>
            <CustomerPicker
              value={referredBy}
              onChange={pickReferrer}
              excludeId={customerId}
              placeholder="Search customers…"
            />
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </section>
  )
}
