'use client'

import { useState, useEffect } from 'react'
import { Icons } from '@/lib/icons'

export function NotificationBell() {
  const [count, setCount] = useState(0)
  const [animKey, setAnimKey] = useState(0)

  useEffect(() => {
    const handler = () => {
      setCount(c => c + 1)
      setAnimKey(k => k + 1)
    }
    window.addEventListener('pt:new-message', handler)
    return () => window.removeEventListener('pt:new-message', handler)
  }, [])

  const clear = () => setCount(0)

  return (
    <button
      className={`pt-iconbtn${count > 0 ? ' has-notif' : ''}`}
      title={count > 0 ? `${count} new message${count === 1 ? '' : 's'}` : 'Notifications'}
      onClick={clear}
    >
      <Icons.bell size={14} />
      {count > 0 && (
        <span key={animKey} className="pt-iconbtn-dot pt-notif-dot">
          {count > 1 ? (count > 9 ? '9+' : String(count)) : ''}
        </span>
      )}
    </button>
  )
}
