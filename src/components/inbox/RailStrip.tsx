'use client'

import { useEffect, useRef, useState } from 'react'
import { Icons } from '@/lib/icons'
import { useInbox } from './InboxProvider'

export type RailPanel = 'contact' | 'ai' | 'notes' | 'activity' | 'order'

const ITEMS: { panel: RailPanel; label: string; icon: React.FC<{ size?: number }> }[] = [
  { panel: 'contact',  label: 'Contact',      icon: Icons.user },
  { panel: 'ai',       label: 'AI assistant', icon: Icons.spark },
  { panel: 'notes',    label: 'Notes',        icon: Icons.pencil },
  { panel: 'activity', label: 'Activity',     icon: Icons.clock },
  { panel: 'order',    label: 'Create order', icon: Icons.box },
]

export function RailStrip({ active, onSelect }: {
  active: RailPanel | null
  onSelect: (p: RailPanel) => void
}) {
  // Open AI-copilot suggestions for the active conversation drive a count
  // badge + a brief pulse when a new one arrives, so the AI panel is
  // discoverable even while it's closed.
  const { suggestions } = useInbox()
  const count = suggestions.length
  const [pulse, setPulse] = useState(false)
  const prevCount = useRef(count)
  useEffect(() => {
    if (count > prevCount.current) {
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 2000)
      prevCount.current = count
      return () => clearTimeout(t)
    }
    prevCount.current = count
  }, [count])

  return (
    <div className="pt-ix-strip" role="tablist" aria-orientation="vertical">
      {ITEMS.map(({ panel, label, icon: Icon }) => {
        const showBadge = panel === 'ai' && count > 0
        return (
          <button
            key={panel}
            type="button"
            role="tab"
            aria-selected={active === panel}
            aria-label={showBadge ? `${label} (${count} new suggestion${count === 1 ? '' : 's'})` : label}
            title={showBadge ? `${count} live suggestion${count === 1 ? '' : 's'}` : label}
            className={`pt-ix-strip-btn ${active === panel ? 'is-on' : ''}${showBadge && pulse ? ' is-pulsing' : ''}`}
            onClick={() => onSelect(panel)}
          >
            <Icon size={16} />
            {showBadge && <span className="pt-ix-strip-badge">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
