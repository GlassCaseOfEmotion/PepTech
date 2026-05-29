'use client'

import { Icons } from '@/lib/icons'
import { useInbox } from './InboxProvider'

type ViewDef = { id: string; label: string; icon: React.FC<{ size?: number }>; iconClass?: string }

const LIFECYCLE: ViewDef[] = [
  { id: 'lead',     label: 'New leads', icon: Icons.user,  iconClass: 'pt-vi-lead' },
  { id: 'customer', label: 'Customers', icon: Icons.users, iconClass: 'pt-vi-customer' },
]
const CHANNELS: ViewDef[] = [
  { id: 'wa', label: 'WhatsApp', icon: Icons.wa, iconClass: 'pt-ch-wa' },
  { id: 'tg', label: 'Telegram', icon: Icons.tg, iconClass: 'pt-ch-tg' },
  { id: 'em', label: 'Email',    icon: Icons.em, iconClass: 'pt-ch-em' },
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

  const Row = ({ id, label, icon: Icon, iconClass }: ViewDef) => (
    <button
      className={`pt-ix-view ${view === id ? 'is-on' : ''}`}
      onClick={() => setView(id)}
    >
      <span className="pt-ix-view-label">
        <span className={`pt-ix-view-icon ${iconClass ?? ''}`}><Icon size={14} /></span>
        {label}
      </span>
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
        <Row id="all" label="All" icon={Icons.inbox} iconClass="pt-vi-all" />
        <div className="pt-ix-views-sec">Lifecycle</div>
        {LIFECYCLE.map(v => <Row key={v.id} {...v} />)}
        <div className="pt-ix-views-sec">Channels</div>
        {CHANNELS.map(v => <Row key={v.id} {...v} />)}
      </div>
    </aside>
  )
}
