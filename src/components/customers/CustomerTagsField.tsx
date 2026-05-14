'use client'

import { useState, useEffect, useRef } from 'react'
import { addCustomerTag, removeCustomerTag } from '@/app/customers/actions'

export function AddTagHeaderButton() {
  return (
    <button className="pt-btn pt-btn-ghost" onClick={() => {
      window.dispatchEvent(new CustomEvent('open-customer-tags'))
      document.getElementById('details-tags')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }}>
      Add tag
    </button>
  )
}

export function CustomerTagsField({ customerId, initialTags }: { customerId: string; initialTags: string[] }) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = () => { setAdding(true); setError('') }
    window.addEventListener('open-customer-tags', handler)
    return () => window.removeEventListener('open-customer-tags', handler)
  }, [])

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const submit = async () => {
    const normalized = input.trim().toLowerCase()
    if (!normalized) return
    if (tags.includes(normalized)) { setError('Already exists'); return }
    const result = await addCustomerTag(customerId, normalized)
    if ('error' in result) { setError(result.error); return }
    setTags(prev => [...prev, normalized])
    setInput('')
    setAdding(false)
    setError('')
  }

  const remove = async (tag: string) => {
    const result = await removeCustomerTag(customerId, tag)
    if ('error' in result) return
    setTags(prev => prev.filter(t => t !== tag))
  }

  return (
    <dd className="pt-cu-tags" id="details-tags">
      {tags.map(tg => (
        <span key={tg} className="pt-tag pt-tag-soft pt-tag-removable" title="Remove tag"
          onClick={() => remove(tg)}>
          {tg} <span className="pt-tag-x">×</span>
        </span>
      ))}
      {adding ? (
        <span className="pt-tag-input-wrap">
          <input
            ref={inputRef}
            className="pt-tag-input"
            value={input}
            onChange={e => { setInput(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setAdding(false); setInput(''); setError('') } }}
            placeholder="new tag…"
            maxLength={32}
          />
          <button className="pt-cu-add-tag" onClick={submit}>✓</button>
          <button className="pt-cu-add-tag" style={{ opacity: 0.5 }} onClick={() => { setAdding(false); setInput(''); setError('') }}>✕</button>
          {error && <span style={{ fontSize: 11, color: 'var(--pt-danger)', marginLeft: 4 }}>{error}</span>}
        </span>
      ) : (
        <button className="pt-cu-add-tag" onClick={() => { setAdding(true); setError('') }}>+</button>
      )}
      {tags.length === 0 && !adding && <span style={{ color: 'var(--pt-fg-4)', fontSize: 12 }}>None</span>}
    </dd>
  )
}
