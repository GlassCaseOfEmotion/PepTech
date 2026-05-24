'use client'

import { useEffect, useState, useTransition } from 'react'
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
  currentSource: AcquisitionSource | null
  lifecycleStage?: 'lead' | 'customer'
}

export function AcquisitionSourceBanner({
  customerId,
  currentSource,
  lifecycleStage = 'lead',
}: Props) {
  const [demoted, setDemoted] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  useEffect(() => {
    if (currentSource !== null || lifecycleStage !== 'lead' || demoted) return
    const t = setTimeout(() => setDemoted(true), 10_000)
    return () => clearTimeout(t)
  }, [currentSource, lifecycleStage, demoted])

  if (currentSource !== null) return null
  if (lifecycleStage !== 'lead') return null

  function pick(source: AcquisitionSource) {
    start(async () => {
      const result = await setAcquisitionSource(customerId, {
        source,
        note: source === 'other' ? '' : null,
      })
      if ('error' in result) return
      router.refresh()
    })
  }

  if (demoted) {
    return (
      <button
        type="button"
        className="pt-banner__link"
        onClick={() => setDemoted(false)}
      >
        Set source
      </button>
    )
  }

  return (
    <div className="pt-banner pt-banner--soft" role="region" aria-label="Acquisition source prompt">
      <span className="pt-banner__label">Where&apos;d they find you?</span>
      {(Object.keys(SOURCE_LABELS) as AcquisitionSource[]).map(s => (
        <button
          key={s}
          type="button"
          className="pt-chip pt-chip--sm"
          disabled={pending}
          onClick={() => pick(s)}
        >
          {SOURCE_LABELS[s]}
        </button>
      ))}
      <button
        type="button"
        className="pt-banner__skip"
        onClick={() => setDemoted(true)}
      >
        skip
      </button>
    </div>
  )
}
