'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setAcquisitionSource, type AcquisitionSource } from '@/app/contacts/actions'

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
  initialReferredBy: string | null
}

export function AcquisitionSourceCard({ customerId, initialSource, initialNote, initialReferredBy }: Props) {
  const [source, setSource] = useState<AcquisitionSource | null>(initialSource)
  const [note, setNote]     = useState(initialNote ?? '')
  const [referredBy, setReferredBy] = useState(initialReferredBy ?? '')
  const [pending, start]    = useTransition()
  const router = useRouter()

  function save(nextSource: AcquisitionSource | null) {
    start(async () => {
      const result = await setAcquisitionSource(customerId, {
        source: nextSource,
        note: nextSource === 'other' ? note : null,
        referredByCustomerId: nextSource === 'referral' ? (referredBy || null) : null,
      })
      if ('error' in result) {
        alert(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="pt-card">
      <header className="pt-card-hd">
        <div><h3 className="pt-card__title">Acquisition source</h3></div>
      </header>
      <div className="pt-card-body">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(Object.keys(SOURCE_LABELS) as AcquisitionSource[]).map(s => (
            <button
              key={s}
              type="button"
              className={`pt-chip${source === s ? ' is-on' : ''}`}
              disabled={pending}
              onClick={() => {
                setSource(s)
                save(s)
              }}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
          {source && (
            <button
              type="button"
              className="pt-btn pt-btn-ghost"
              style={{ height: 26, padding: '0 8px', fontSize: 11 }}
              disabled={pending}
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
            onBlur={() => save('other')}
          />
        )}
        {source === 'referral' && (
          <input
            type="text"
            placeholder="Referred by (customer id, optional)"
            className="pt-input"
            style={{ marginTop: 8, width: '100%', boxSizing: 'border-box' }}
            value={referredBy}
            onChange={e => setReferredBy(e.target.value)}
            onBlur={() => save('referral')}
          />
        )}
      </div>
    </section>
  )
}
