'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { formatAmount } from '@/lib/currency'
import { initials, type InboxThread } from '@/types/inbox'
import { useInbox } from './InboxProvider'
import { CopilotPanel } from './copilot/CopilotPanel'
import { OrderRail } from './OrderRail'
import type { RailPanel } from './RailStrip'
import { CH_NAMES, fmtRelative, actBullet, actDetail, type ActivityItem } from './inbox-shared'

const TITLES: Record<RailPanel, string> = {
  contact: 'Contact', ai: 'Copilot', notes: 'Notes', activity: 'Activity', order: 'Create order',
}

export function RailPanelHost({ panel, thread, baseCurrency, onClose }: {
  panel: RailPanel
  thread: InboxThread
  baseCurrency: string
  onClose: () => void
}) {
  const { notes, addNote } = useInbox()
  const [addingNote, setAddingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const trustCls = thread.trust >= 85 ? 'hi' : thread.trust >= 65 ? 'md' : 'lo'
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (panel !== 'activity' || !thread.customerId) return
    supabase
      .from('customer_activity')
      .select('id, source, label, ref_number, amount, note, created_at')
      .eq('customer_id', thread.customerId)
      .order('created_at', { ascending: false })
      .limit(15)
      .then(({ data }) => { if (data) setActivity(data as ActivityItem[]) })
  }, [supabase, thread.customerId, panel])

  const submitNote = async () => {
    if (!noteText.trim()) return
    await addNote(noteText)
    setNoteText('')
    setAddingNote(false)
  }

  if (panel === 'order') {
    return (
      <OrderRail
        customerId={thread.customerId}
        customerName={thread.name}
        conversationId={thread.id}
        onClose={onClose}
      />
    )
  }

  return (
    <aside className="pt-ix-rail">
      <div className="pt-ix-panel-hd">
        <span>{TITLES[panel]}</span>
        <button className="pt-ix-panel-close" aria-label="Close panel" onClick={onClose}>
          <Icons.x size={13} />
        </button>
      </div>

      {panel === 'contact' && (
        <div className="pt-cust">
          <Link href={`/contacts/${thread.customerId}`} className="pt-cust-hd" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="pt-cust-av" data-channel={thread.channel}>{initials(thread.name)}</div>
            <div className="pt-cust-id">
              <div className="pt-cust-name">{thread.name}</div>
              <div className="pt-cust-handle mono">{thread.handle}</div>
            </div>
            <div className={`pt-trust pt-trust-${trustCls}`}>
              <div className="pt-trust-num">{thread.trust}</div>
              <div className="pt-trust-lbl">trust</div>
            </div>
          </Link>
          <div className="pt-cust-stats">
            <div><div className="lbl">LTV</div><div className="val mono">{formatAmount(thread.ltv, baseCurrency)}</div></div>
            <div><div className="lbl">Channel</div><div className="val">{CH_NAMES[thread.channel]}</div></div>
          </div>
          <div className="pt-cust-tags">
            {thread.tags.map(tag => <span key={tag} className="pt-tag pt-tag-soft">{tag}</span>)}
          </div>
        </div>
      )}

      {panel === 'ai' && thread.id && thread.customerId && (
        <CopilotPanel conversationId={thread.id} customerName={thread.name} />
      )}

      {panel === 'notes' && (
        <div className="pt-right-section">
          <div className="pt-right-hd">
            <span>Notes</span>
            <button className="pt-right-add" onClick={() => { setAddingNote(v => !v); setNoteText('') }}>
              <Icons.plus size={11} />
            </button>
          </div>
          {addingNote && (
            <div className="pt-note-form">
              <textarea className="pt-note-input" placeholder="Add an internal note…" value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} autoFocus />
              <div className="pt-note-actions">
                <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => { setAddingNote(false); setNoteText('') }}>Cancel</button>
                <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={submitNote} disabled={!noteText.trim()}>Save</button>
              </div>
            </div>
          )}
          {notes.map(note => (
            <div key={note.id} className="pt-rail-note">
              <div className="pt-rail-note-meta">{fmtRelative(note.created_at)}</div>
              <div>{note.content}</div>
            </div>
          ))}
        </div>
      )}

      {panel === 'activity' && (
        <div className="pt-right-section">
          {activity.length === 0
            ? <div className="pt-right-hd"><span>No activity yet</span></div>
            : (
              <ul className="pt-rail-activity">
                {activity.map(item => (
                  <li key={item.id}>
                    <i className={`pt-act-dot ${actBullet(item)}`} />
                    <div>
                      <b>{item.label}</b>{actDetail(item, baseCurrency)}
                      <div className="pt-act-time">{fmtRelative(item.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </aside>
  )
}
