'use client'

import { useEffect, useState } from 'react'

const KEY = 'pt-views-collapsed'

/** Collapsed boolean for the inbox views column. Defaults to expanded (the
 * lens is useful at a glance); persists the user's choice in localStorage.
 * Unlike useNavCollapsed this does NOT touch the DOM — InboxLayout owns the
 * grid element and applies the class in React. */
export function useViewsCollapsed() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem(KEY) === '1')
  }, [])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(KEY, next ? '1' : '0')
      return next
    })
  }

  return { collapsed, toggle }
}
