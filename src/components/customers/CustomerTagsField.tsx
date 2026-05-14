'use client'

import { useState, useEffect, useRef } from 'react'
import { addCustomerTag, removeCustomerTag } from '@/app/customers/actions'

const TAG_CLASS: Record<string, string> = {
  vip:      'pt-tag-vip',
  new:      'pt-tag-new',
  payment:  'pt-tag-warn',
  waitlist: 'pt-tag',
  repeat:   'pt-tag-soft',
  referred: 'pt-tag-soft',
  shipping: 'pt-tag-soft',
  reorder:  'pt-tag-soft',
}

const PRESET_TAGS = ['vip', 'repeat', 'new', 'waitlist', 'payment', 'referred', 'shipping', 'reorder']

function tagClass(tag: string) {
  return TAG_CLASS[tag] ?? 'pt-tag-soft'
}

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

  const open = () => { setAdding(true); setError('') }
  const close = () => { setAdding(false); setInput(''); setError('') }

  const applyTag = async (tag: string) => {
    const normalized = tag.trim().toLowerCase()
    if (!normalized || tags.includes(normalized)) return
    setTags(prev => [...prev, normalized])
    setInput('')
    setError('')
    const result = await addCustomerTag(customerId, normalized)
    if ('error' in result) {
      setTags(prev => prev.filter(t => t !== normalized))
      setError(result.error)
    }
  }

  const submitInput = () => applyTag(input).then(() => { if (!error) close() })

  const remove = async (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag))
    const result = await removeCustomerTag(customerId, tag)
    if ('error' in result) setTags(prev => [...prev, tag])
  }

  const visiblePresets = PRESET_TAGS.filter(t => !tags.includes(t))

  return (
    <dd className="pt-cu-tags" id="details-tags">
      {tags.map(tg => (
        <span key={tg} className={`pt-tag ${tagClass(tg)} pt-tag-removable`}
          title="Click to remove" onClick={() => remove(tg)}>
          {tg}<span className="pt-tag-x">×</span>
        </span>
      ))}

      {adding ? (
        <span className="pt-tag-input-wrap">
          <input
            ref={inputRef}
            className="pt-tag-input"
            value={input}
            onChange={e => { setInput(e.target.value); setError('') }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); applyTag(input) }
              if (e.key === 'Escape') close()
            }}
            placeholder="type a tag…"
            maxLength={32}
          />
          <button className="pt-cu-add-tag" title="Confirm" onClick={() => applyTag(input)}>✓</button>
          <button className="pt-cu-add-tag" title="Cancel" style={{ opacity: 0.5 }} onClick={close}>✕</button>
          {error && <span style={{ fontSize: 11, color: 'var(--pt-danger)', marginLeft: 2 }}>{error}</span>}
          {visiblePresets.length > 0 && (
            <div className="pt-tag-suggestions">
              {visiblePresets.map(t => (
                <span key={t} className={`pt-tag ${tagClass(t)} pt-tag-suggestion`}
                  onClick={() => applyTag(t)}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </span>
      ) : (
        <button className="pt-cu-add-tag" title="Add tag" onClick={open}>+</button>
      )}

      {tags.length === 0 && !adding && (
        <span style={{ color: 'var(--pt-fg-4)', fontSize: 12 }}>None</span>
      )}
    </dd>
  )
}
