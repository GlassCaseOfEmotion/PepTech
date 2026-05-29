'use client'

import { useState, useEffect } from 'react'
import { SuggestionCard } from './SuggestionCard'
import type { SuggestionRow } from '@/types/copilot'

export function CopilotSuggestions({ suggestions, variant }: {
  suggestions: SuggestionRow[]
  variant: 'inline' | 'panel'
}) {
  // Local removal so a dismissed/sent card disappears immediately,
  // even before the realtime UPDATE round-trips.
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  useEffect(() => { setRemoved(new Set()) }, [suggestions.length])

  const visible = suggestions.filter(s => !removed.has(s.id))
  if (visible.length === 0) {
    return variant === 'panel'
      ? <div className="pt-sug-empty">No live suggestions yet. They appear as the conversation progresses.</div>
      : null
  }

  return (
    <div className={`pt-sug-list pt-sug-list-${variant}`}>
      {visible.map(s => (
        <SuggestionCard
          key={s.id}
          suggestion={s}
          onRemove={(id) => setRemoved(prev => new Set(prev).add(id))}
        />
      ))}
    </div>
  )
}
