'use client'

import { useEffect, useState } from 'react'

const KEY = 'pt-nav-collapsed'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

function applyClass(collapsed: boolean) {
  const root = document.querySelector('.pt-root')
  if (!root) return
  root.classList.toggle('pt-nav-collapsed', collapsed)
}

/** Collapsed boolean for the global nav rail. The server already applied
 * the right class to .pt-root from the cookie (see src/lib/nav-state.ts),
 * so initial render matches SSR — no FOUC. Toggles write both the cookie
 * (so the next SSR is correct) and localStorage (legacy / quick read). */
export function useNavCollapsed(initial: boolean = true) {
  const [collapsed, setCollapsed] = useState(initial)

  useEffect(() => {
    // Reconcile with localStorage in case the cookie was lost / desynced.
    const stored = localStorage.getItem(KEY)
    if (stored !== null) {
      const next = stored === '0' ? false : true
      if (next !== collapsed) {
        setCollapsed(next)
        applyClass(next)
      }
    }
    // Run once on mount — intentionally not depending on `collapsed`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      const val = next ? '1' : '0'
      try { localStorage.setItem(KEY, val) } catch { /* ignore */ }
      // Cookie drives server-rendered class on next request — kills FOUC.
      document.cookie = `${KEY}=${val}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
      applyClass(next)
      return next
    })
  }

  return { collapsed, toggle }
}
