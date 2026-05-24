'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setLifecycleStage } from '@/app/contacts/actions'

export function RowMenu({ customerId, currentStage }: {
  customerId: string
  currentStage: 'lead' | 'customer'
}) {
  const [pending, setPending] = useState(false)
  const router = useRouter()

  const targetStage: 'lead' | 'customer' = currentStage === 'lead' ? 'customer' : 'lead'
  const label = currentStage === 'lead' ? 'Mark as customer' : 'Mark as lead'

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (targetStage === 'lead' && !confirm('Mark this customer as a lead?')) return
    setPending(true)
    const result = await setLifecycleStage(customerId, targetStage)
    setPending(false)
    if ('error' in result) {
      alert(result.error)
      return
    }
    router.refresh()
  }

  return (
    <button
      type="button"
      className="pt-btn pt-btn-ghost"
      style={{ fontSize: 11 }}
      disabled={pending}
      onClick={handleClick}
    >
      {label}
    </button>
  )
}
