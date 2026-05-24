'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setAcquisitionSource, type AcquisitionSource } from '@/app/contacts/actions'
import { useToast, Toast } from '@/components/ui/Toast'

type QuickSource = Exclude<AcquisitionSource, 'other'>

const SOURCE_LABELS: Record<QuickSource, string> = {
  referral:   'Referral',
  community:  'Community',
  group_chat: 'Group chat',
  direct:     'Direct',
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
  const [demoted, setDemoted] = useState<boolean>(() =>
    typeof window !== 'undefined'
    && sessionStorage.getItem('pt:acq_src_dismissed:' + customerId) === '1'
  )
  const [pending, setPending] = useState(false)
  const router = useRouter()
  const { toast, showToast } = useToast()

  useEffect(() => {
    if (currentSource !== null || lifecycleStage !== 'lead' || demoted) return
    const t = setTimeout(() => {
      sessionStorage.setItem('pt:acq_src_dismissed:' + customerId, '1')
      setDemoted(true)
    }, 10_000)
    return () => clearTimeout(t)
  }, [currentSource, lifecycleStage, demoted, customerId])

  if (currentSource !== null) return null
  if (lifecycleStage !== 'lead') return null

  async function pick(source: QuickSource) {
    setPending(true)
    const result = await setAcquisitionSource(customerId, { source, note: null })
    setPending(false)
    if ('error' in result) {
      showToast(result.error, 'err')
      return
    }
    router.refresh()
  }

  if (demoted) {
    return (
      <>
        <button
          type="button"
          className="pt-banner__link"
          onClick={() => {
            sessionStorage.removeItem('pt:acq_src_dismissed:' + customerId)
            setDemoted(false)
          }}
        >
          Set source
        </button>
        <Toast toast={toast} />
      </>
    )
  }

  return (
    <div className="pt-banner pt-banner--soft" role="region" aria-label="Acquisition source prompt">
      <span className="pt-banner__label">Where&apos;d they find you?</span>
      {(Object.keys(SOURCE_LABELS) as QuickSource[]).map(s => (
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
        onClick={() => {
          sessionStorage.setItem('pt:acq_src_dismissed:' + customerId, '1')
          setDemoted(true)
        }}
      >
        skip
      </button>
      <Toast toast={toast} />
    </div>
  )
}
