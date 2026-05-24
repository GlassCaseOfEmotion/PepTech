'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * When the dashboard loads with ?tour=1 in the URL (e.g. right after the
 * agent-driven onboarding completes), wait for the layout to settle and
 * then fire the same window event the manual "Take a tour" button uses.
 * The URL param is cleaned afterward so a refresh doesn't re-trigger it.
 */
export function TourAutostart() {
  const router = useRouter()
  const params = useSearchParams()
  const shouldStart = params.get('tour') === '1'

  useEffect(() => {
    if (!shouldStart) return
    // Give the dashboard a moment to mount data-tour anchors before measuring
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('pt:tour:open'))
      router.replace('/', { scroll: false })
    }, 450)
    return () => clearTimeout(t)
  }, [shouldStart, router])

  return null
}
