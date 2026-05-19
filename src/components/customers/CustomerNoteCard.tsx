'use client'

import { useState, useEffect } from 'react'
import { addCustomerNote } from '@/app/customers/actions'

type Note = { id: string; content: string; created_at: string }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function AddNoteHeaderButton() {
  return (
    <button className="pt-btn pt-btn-ghost" onClick={() => {
      window.dispatchEvent(new CustomEvent('open-customer-notes'))
      document.getElementById('notes')?.scrollIntoView({ behavior: 'smooth' })
    }}>
      Add note
    </button>
  )
}

export function CustomerNoteCard({ customerId, initialNotes }: { customerId: string; initialNotes: Note[] }) {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = () => { setAdding(true); setError('') }
    window.addEventListener('open-customer-notes', handler)
    return () => window.removeEventListener('open-customer-notes', handler)
  }, [])

  const submit = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    setError('')
    const result = await addCustomerNote(customerId, text)
    setSaving(false)
    if ('error' in result) { setError(result.error); return }
    setNotes(prev => [result.note, ...prev])
    setText('')
    setAdding(false)
  }

  return (
    <section className="pt-card" id="notes">
      <header className="pt-card-hd">
        <div><h3>Notes</h3><p>Internal — never sent to customer</p></div>
        <button className="pt-link" onClick={() => { setAdding(v => !v); setText(''); setError('') }}>
          + Add note
        </button>
      </header>
      <div className="pt-card-body" style={{ padding: 0 }}>
        {adding && (
          <div className="pt-note-form" style={{ padding: '10px 14px 2px' }}>
            <textarea
              className="pt-note-input"
              placeholder="Add an internal note…"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={3}
              autoFocus
            />
            {error && <p style={{ fontSize: 11, color: 'var(--pt-danger)', margin: '4px 12px 0' }}>{error}</p>}
            <div className="pt-note-actions">
              <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }}
                onClick={() => { setAdding(false); setText(''); setError('') }}>
                Cancel
              </button>
              <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }}
                onClick={submit} disabled={!text.trim() || saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
        <ul className="pt-cu-notes">
          {notes.length > 0 ? notes.map(n => (
            <li key={n.id}>
              <div className="pt-cu-note-at mono">{fmtDate(n.created_at)}</div>
              <div className="pt-cu-note-text">{n.content}</div>
            </li>
          )) : (
            !adding && <li style={{ padding: '12px 14px', color: 'var(--pt-fg-4)', fontSize: 12 }}>No notes yet</li>
          )}
        </ul>
      </div>
    </section>
  )
}
