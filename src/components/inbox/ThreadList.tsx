'use client'

import { useState } from 'react'
import { Icons } from '@/lib/icons'
import { ThreadRow } from './ThreadRow'
import type { ConversationWithCustomer } from '@/types/inbox'

interface ThreadListProps {
  conversations: ConversationWithCustomer[]
  activeId: string | null
  onSelect: (id: string) => void
}

const FILTERS = [
  { id: 'all',         label: 'All' },
  { id: 'needs_reply', label: 'Needs reply' },
  { id: 'new',         label: 'New' },
  { id: 'snoozed',     label: 'Snoozed' },
] as const

export function ThreadList({ conversations, activeId, onSelect }: ThreadListProps) {
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const filtered = conversations.filter((c) => {
    if (filter !== 'all' && c.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = c.customers?.display_name?.toLowerCase() ?? ''
      const snippet = c.last_message_snippet?.toLowerCase() ?? ''
      if (!name.includes(q) && !snippet.includes(q)) return false
    }
    return true
  })

  return (
    <div className="pt-ix-list">
      <div className="pt-ix-list-hd">
        <span className="pt-ix-list-title">Inbox</span>
        <button className="pt-iconbtn" title="Filter"><Icons.filter size={13} /></button>
        <button className="pt-iconbtn" title="Compose"><Icons.plus size={13} /></button>
      </div>

      <div className="pt-ix-search">
        <Icons.search size={12} />
        <input
          placeholder="Search threads…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="pt-ix-filters">
        {FILTERS.map((f) => {
          const count = f.id === 'all'
            ? conversations.length
            : conversations.filter((c) => c.status === f.id).length
          return (
            <button
              key={f.id}
              className={`pt-pill ${filter === f.id ? 'is-on' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="pt-pill-num">{count}</span>
            </button>
          )
        })}
      </div>

      <ul className="pt-ix-threads">
        {filtered.map((c) => (
          <ThreadRow
            key={c.id}
            conv={c}
            active={c.id === activeId}
            onClick={() => onSelect(c.id)}
          />
        ))}
        {filtered.length === 0 && (
          <li style={{ padding: '24px 12px', color: 'var(--pt-fg-4)', fontSize: 12, textAlign: 'center' }}>
            No threads
          </li>
        )}
      </ul>
    </div>
  )
}
