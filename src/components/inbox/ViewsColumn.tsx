'use client'

import { Icons } from '@/lib/icons'
import { useInbox } from './InboxProvider'

const LIFECYCLE: { id: string; label: string }[] = [
  { id: 'lead',     label: 'New leads' },
  { id: 'customer', label: 'Customers' },
]
const CHANNELS: { id: string; label: string }[] = [
  { id: 'wa', label: 'WhatsApp' },
  { id: 'tg', label: 'Telegram' },
  { id: 'em', label: 'Email' },
]

export function ViewsColumn({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { threads, view, setView } = useInbox()

  // Counts ignore the status filter — they reflect how many active (non-resolved)
  // threads fall in each lens, so the numbers are stable as you change status.
  const active = threads.filter(t => t.status !== 'resolved')
  const countFor = (id: string): number => {
    if (id === 'all') return active.length
    if (id === 'lead' || id === 'customer') return active.filter(t => t.lifecycleStage === id).length
    return active.filter(t => t.channel === id).length
  }

  if (collapsed) {
    return (
      <aside className="pt-ix-views is-collapsed">
        <button className="pt-ix-views-toggle" title="Expand views" aria-label="Expand views" onClick={onToggle}>
          <Icons.arrowL size={13} />
        </button>
      </aside>
    )
  }

  const Row = ({ id, label }: { id: string; label: string }) => (
    <button
      className={`pt-ix-view ${view === id ? 'is-on' : ''}`}
      onClick={() => setView(id)}
    >
      <span className="pt-ix-view-label">{label}</span>
      <span className="pt-ix-view-count">{countFor(id)}</span>
    </button>
  )

  return (
    <aside className="pt-ix-views">
      <div className="pt-ix-views-hd">
        <span>Views</span>
        <button className="pt-ix-views-toggle" title="Collapse views" aria-label="Collapse views" onClick={onToggle}>
          <Icons.arrowL size={13} />
        </button>
      </div>
      <div className="pt-ix-views-body">
        <Row id="all" label="All" />
        <div className="pt-ix-views-sec">Lifecycle</div>
        {LIFECYCLE.map(v => <Row key={v.id} {...v} />)}
        <div className="pt-ix-views-sec">Channels</div>
        {CHANNELS.map(v => <Row key={v.id} {...v} />)}
      </div>
    </aside>
  )
}
