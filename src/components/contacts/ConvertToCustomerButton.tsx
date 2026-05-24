'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setLifecycleStage } from '@/app/contacts/actions'

interface Props {
  customerId: string
  currentStage: 'lead' | 'customer'
}

export function ConvertToCustomerButton({ customerId, currentStage }: Props) {
  const [pending, start] = useTransition()
  const router = useRouter()

  if (currentStage === 'customer') return null

  return (
    <button
      type="button"
      className="pt-btn pt-btn-primary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await setLifecycleStage(customerId, 'customer')
          if ('error' in result) {
            alert(result.error)
            return
          }
          router.refresh()
        })
      }
    >
      {pending ? 'Converting…' : 'Convert to customer'}
    </button>
  )
}
