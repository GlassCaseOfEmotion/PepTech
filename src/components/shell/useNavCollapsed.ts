'use client'

import { useEffect, useState } from 'react'

const KEY = 'pt-nav-collapsed'

function applyClass(collapsed: boolean) {
  const root = document.querySelector('.pt-root')
  if (!root) return
  root.classList.toggle('pt-nav-collapsed', collapsed)
}

/** Collapsed boolean for the global nav rail. Defaults to collapsed (thin
 * icon rail); persists the user's choice in localStorage and mirrors it onto
 * the .pt-root element so CSS can react. Mirrors the useTheme pattern in
 * Sidebar.tsx. */
export function useNavCollapsed() {
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(KEY)
    const next = stored === '0' ? false : true
    setCollapsed(next)
    applyClass(next)
  }, [])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(KEY, next ? '1' : '0')
      applyClass(next)
      return next
    })
  }

  return { collapsed, toggle }
}
