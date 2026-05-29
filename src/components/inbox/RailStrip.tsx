'use client'

import { Icons } from '@/lib/icons'

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
  return (
    <div className="pt-ix-strip" role="tablist" aria-orientation="vertical">
      {ITEMS.map(({ panel, label, icon: Icon }) => (
        <button
          key={panel}
          type="button"
          role="tab"
          aria-selected={active === panel}
          aria-label={label}
          title={label}
          className={`pt-ix-strip-btn ${active === panel ? 'is-on' : ''}`}
          onClick={() => onSelect(panel)}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  )
}
