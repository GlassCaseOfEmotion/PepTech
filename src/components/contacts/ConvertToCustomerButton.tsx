'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setLifecycleStage } from '@/app/contacts/actions'
import { useToast, Toast } from '@/components/ui/Toast'

interface Props {
  customerId: string
  currentStage: 'lead' | 'customer'
}

export function ConvertToCustomerButton({ customerId, currentStage }: Props) {
  const [pending, start] = useTransition()
  const router = useRouter()
  const { toast, showToast } = useToast()

  if (currentStage === 'customer') return null

  return (
    <>
      <button
        type="button"
        className="pt-btn pt-btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await setLifecycleStage(customerId, 'customer')
            if ('error' in result) {
              showToast(result.error, 'err')
              return
            }
            router.refresh()
          })
        }
      >
        {pending ? 'Converting…' : 'Convert to customer'}
      </button>
      <Toast toast={toast} />
    </>
  )
}
