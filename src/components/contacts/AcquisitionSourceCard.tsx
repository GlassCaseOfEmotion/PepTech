'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setAcquisitionSource, type AcquisitionSource } from '@/app/contacts/actions'
import { useToast, Toast } from '@/components/ui/Toast'

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
  const { toast, showToast } = useToast()

  function save(nextSource: AcquisitionSource | null) {
    start(async () => {
      const result = await setAcquisitionSource(customerId, {
        source: nextSource,
        note: nextSource === 'other' ? note : null,
        referredByCustomerId: nextSource === 'referral' ? (referredBy || null) : null,
      })
      if ('error' in result) {
        showToast(result.error, 'err')
        return
      }
      router.refresh()
    })
  }

  function pickSource(s: AcquisitionSource | null) {
    setSource(s)
    // Defer save for 'other' until note is typed and blurred
    if (s === 'other') return
    save(s)
  }

  function saveOther() {
    if (!note.trim()) return
    save('other')
  }

  return (
    <section className="pt-card">
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
              disabled={pending}
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
            onBlur={saveOther}
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
      <Toast toast={toast} />
    </section>
  )
}
