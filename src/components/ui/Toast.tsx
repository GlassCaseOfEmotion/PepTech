'use client'

import { useState, useCallback } from 'react'
import { Icons } from '@/lib/icons'

export type ToastKind = 'ok' | 'err'

export interface ToastState {
  text: string
  kind: ToastKind
  id: number
}

export function useToast(durationMs = 2400) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const showToast = useCallback((text: string, kind: ToastKind = 'ok') => {
    setToast({ text, kind, id: Date.now() })
    setTimeout(() => setToast(null), durationMs)
  }, [durationMs])
  return { toast, showToast }
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null
  return (
    <div className={`pt-toast pt-toast-${toast.kind}`} key={toast.id} role="status" aria-live="polite">
      {toast.kind === 'err' ? <Icons.x size={12} /> : <Icons.check size={12} />}
      <span>{toast.text}</span>
    </div>
  )
}
