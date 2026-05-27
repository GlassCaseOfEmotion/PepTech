'use client'

import { useEffect, useId, useState } from 'react'
import { Icons } from '@/lib/icons'

interface Props {
  count: number
  children: React.ReactNode
}

const STORAGE_KEY = 'pt-pending-approvals-collapsed'

export function CollapsiblePendingApprovals({ count, children }: Props) {
  // Default collapsed. Hydrate from localStorage in an effect so SSR markup
  // matches client (otherwise React 18 throws a hydration mismatch when the
  // stored preference is "expanded").
  const [collapsed, setCollapsed] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const bodyId = useId()

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === '0') setCollapsed(false)
    } catch { /* ignore — private mode, etc. */ }
    setHydrated(true)
  }, [])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div className={`pt-pending-section is-collapsible${collapsed ? ' is-collapsed' : ''}${hydrated ? '' : ' is-pre-hydrate'}`}>
      <button
        type="button"
        className="pt-pending-section-toggle"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
      >
        <span className="pt-pending-section-toggle-label">Pending approvals</span>
        <span className="pt-nav-badge">{count}</span>
        <span className="pt-pending-section-chevron" aria-hidden>
          <Icons.arrowDn size={12} />
        </span>
      </button>
      <div
        id={bodyId}
        className="pt-pending-section-body"
        aria-hidden={collapsed}
      >
        <div className="pt-pending-section-body-inner">
          {children}
        </div>
      </div>
    </div>
  )
}
