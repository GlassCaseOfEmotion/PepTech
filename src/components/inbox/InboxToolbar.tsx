'use client'

import { useEffect, useRef, useState } from 'react'
import { Icons } from '@/lib/icons'

export interface InboxToolbarCounts {
  all: number
  needs_reply: number
  new: number
  snoozed: number
  resolved: number
}

type FilterId = keyof InboxToolbarCounts

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all',         label: 'All' },
  { id: 'needs_reply', label: 'Needs reply' },
  { id: 'new',         label: 'New' },
  { id: 'snoozed',     label: 'Snoozed' },
  { id: 'resolved',    label: 'Resolved' },
]

interface Props {
  filter: string
  setFilter: (f: string) => void
  counts: InboxToolbarCounts
  search: string
  setSearch: (s: string) => void
  pendingCount: number
  pendingOnly: boolean
  setPendingOnly: (b: boolean) => void
  /** Optional. When the views column is collapsed, a leading toggle
   * appears here so the user can re-expand it without an empty side strip. */
  viewsCollapsed?: boolean
  onExpandViews?: () => void
}

/** Single-row toolbar: status dropdown · pending toggle · search takeover.
 * Search expands to cover the whole row when active; chips fade out underneath
 * and are not clickable through the overlay. */
export function InboxToolbar({
  filter, setFilter, counts,
  search, setSearch,
  pendingCount, pendingOnly, setPendingOnly,
  viewsCollapsed, onExpandViews,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)

  // ⌘F / Ctrl-F → open search takeover
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearching(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Focus the input when the takeover opens.
  useEffect(() => {
    if (searching) inputRef.current?.focus()
  }, [searching])

  // Close the status menu on outside click.
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!statusRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const active = FILTERS.find(f => f.id === filter) ?? FILTERS[0]
  const activeCount = counts[active.id]

  function closeSearch() {
    setSearch('')
    setSearching(false)
  }

  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      if (search) setSearch('')
      else closeSearch()
    }
  }

  function onSearchBlur() {
    // Persistence rule: stay open while there's text in the field.
    if (!search) setSearching(false)
  }

  return (
    <div className={`pt-ix-toolbar${searching ? ' is-searching' : ''}`}>
      <div className="pt-ix-toolbar-chips">
        {viewsCollapsed && onExpandViews && (
          <button
            type="button"
            className="pt-ix-views-expand"
            onClick={onExpandViews}
            aria-label="Expand views"
            title="Expand views"
          >
            <Icons.panelLeft size={14} />
          </button>
        )}
        <div ref={statusRef} className="pt-ix-status">
          <button
            type="button"
            className={`pt-ix-status-btn${menuOpen ? ' is-open' : ''}`}
            onClick={() => setMenuOpen(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
          >
            <span className="pt-ix-status-label">{active.label}</span>
            <span className="pt-ix-status-count">{activeCount}</span>
            <span className="pt-ix-status-chev" aria-hidden><Icons.arrowDn size={11} /></span>
          </button>
          {menuOpen && (
            <div className="pt-ix-status-menu" role="listbox">
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  role="option"
                  aria-selected={filter === f.id}
                  className={`pt-ix-status-menu-item${filter === f.id ? ' is-active' : ''}`}
                  onClick={() => { setFilter(f.id); setMenuOpen(false) }}
                >
                  <span className="pt-ix-status-menu-dot" aria-hidden />
                  <span className="pt-ix-status-menu-label">{f.label}</span>
                  <span className="pt-ix-status-menu-count">{counts[f.id]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {pendingCount > 0 && (
          <button
            type="button"
            className={`pt-ix-pending-chip${pendingOnly ? ' is-on' : ''}`}
            onClick={() => setPendingOnly(!pendingOnly)}
            aria-pressed={pendingOnly}
            title={pendingOnly ? 'Showing conversations with pending approvals' : 'Show only conversations with pending approvals'}
          >
            <Icons.zap size={12} />
            <span>Pending</span>
            <span className="pt-ix-pending-count">{pendingCount}</span>
          </button>
        )}

        <div className="pt-ix-toolbar-spacer" />

        <button
          type="button"
          className="pt-ix-search-btn"
          onClick={() => setSearching(true)}
          aria-label="Search threads"
          title="Search threads (⌘F)"
        >
          <Icons.search size={13} />
        </button>
      </div>

      <div className="pt-ix-search-overlay" aria-hidden={!searching}>
        <span className="pt-ix-search-overlay-icon" aria-hidden><Icons.search size={13} /></span>
        <input
          ref={inputRef}
          className="pt-ix-search-overlay-input"
          placeholder="Search threads"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={onSearchKeyDown}
          onBlur={onSearchBlur}
          tabIndex={searching ? 0 : -1}
        />
        <button
          type="button"
          className="pt-ix-search-close"
          onClick={closeSearch}
          aria-label="Close search"
          tabIndex={searching ? 0 : -1}
        >
          <Icons.x size={12} />
        </button>
      </div>
    </div>
  )
}
