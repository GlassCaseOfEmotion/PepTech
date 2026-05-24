'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type PickedCustomer = { id: string; display_name: string }

interface Props {
  value: PickedCustomer | null
  onChange: (c: PickedCustomer | null) => void
  excludeId?: string
  placeholder?: string
  autoFocus?: boolean
}

export function CustomerPicker({ value, onChange, excludeId, placeholder = 'Search customers…', autoFocus }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickedCustomer[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, display_name')
        .ilike('display_name', `%${query}%`)
        .limit(8)
      const hits = (data ?? []) as PickedCustomer[]
      setResults(excludeId ? hits.filter(h => h.id !== excludeId) : hits)
    }, 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, supabase, excludeId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (value) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px 4px 7px', borderRadius: 20, background: 'oklch(from var(--pt-accent) l c h / 0.15)', border: '0.5px solid oklch(from var(--pt-accent) l c h / 0.4)', fontSize: 13 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--pt-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>
          {value.display_name.slice(0, 2).toUpperCase()}
        </div>
        <span>{value.display_name}</span>
        <button type="button" onClick={() => onChange(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pt-fg-4)', fontSize: 13, padding: 0 }}>✕</button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        className="pt-input"
        placeholder={placeholder}
        value={query}
        autoFocus={autoFocus}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        style={{ width: '100%', boxSizing: 'border-box' }}
      />
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--pt-bg-side)', border: '0.5px solid var(--pt-line)', borderRadius: 6, marginTop: 2, overflow: 'hidden' }}>
          {results.map(c => (
            <div
              key={c.id}
              style={{ padding: '9px 12px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}
              onMouseDown={e => {
                e.preventDefault()
                onChange(c)
                setQuery('')
                setResults([])
                setOpen(false)
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'oklch(from var(--pt-fg) l c h / 0.06)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
            >
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--pt-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                {c.display_name.slice(0, 2).toUpperCase()}
              </div>
              <span style={{ fontWeight: 500 }}>{c.display_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
