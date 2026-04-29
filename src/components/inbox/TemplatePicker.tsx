'use client'

import { useState } from 'react'
import type { DbTemplate } from '@/types/inbox'

interface Props {
  templates: DbTemplate[]
  onSelect: (content: string) => void
  onClose: () => void
}

export function TemplatePicker({ templates, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('')
  const filtered = templates.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.content.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="pt-tpl-picker">
      <div className="pt-tpl-search">
        <input
          autoFocus
          placeholder="Search templates…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="pt-tpl-close" onClick={onClose}>✕</button>
      </div>
      <ul className="pt-tpl-list">
        {filtered.map(t => (
          <li key={t.id} className="pt-tpl-item" onClick={() => { onSelect(t.content); onClose() }}>
            <div className="pt-tpl-title">{t.title}</div>
            <div className="pt-tpl-preview">{t.content.slice(0, 80)}{t.content.length > 80 ? '…' : ''}</div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="pt-tpl-empty">No templates match &ldquo;{search}&rdquo;</li>
        )}
      </ul>
    </div>
  )
}
