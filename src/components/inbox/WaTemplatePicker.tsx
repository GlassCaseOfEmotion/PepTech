'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useInbox } from './InboxProvider'
import type { DbWaTemplate } from '@/types/inbox'

export function WaTemplatePicker({ onClose }: { onClose: () => void }) {
  const { sendTemplate, isSending } = useInbox()
  const supabase = useMemo(() => createClient(), [])
  const [templates, setTemplates] = useState<DbWaTemplate[]>([])
  const [selected, setSelected] = useState<DbWaTemplate | null>(null)
  const [vars, setVars] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const [sendError, setSendError] = useState('')

  useEffect(() => {
    supabase.from('whatsapp_templates')
      .select('id, name, body, variables, content_sid, status, created_at')
      .eq('status', 'approved').not('content_sid', 'is', null)
      .then(({ data, error }) => {
        if (error) { console.error('Failed to load templates:', error); setLoaded(true); return }
        setTemplates((data ?? []) as DbWaTemplate[])
        setLoaded(true)
      })
  }, [supabase])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const selectTemplate = (t: DbWaTemplate) => {
    setSelected(t)
    setVars({})
  }

  const send = async () => {
    if (!selected) return
    setSendError('')
    try {
      await sendTemplate(selected.id, vars)
      onClose()
    } catch {
      setSendError('Failed to send. Please try again.')
    }
  }

  return (
    <div className="pt-tpl-picker pt-wa-picker">
      <div className="pt-tpl-search">
        <span style={{ fontWeight: 600, fontSize: 13 }}>Send WhatsApp Template</span>
        <button className="pt-tpl-close" onClick={onClose}>✕</button>
      </div>

      {!loaded && (
        <div className="pt-tpl-empty">Loading templates…</div>
      )}

      {loaded && templates.length === 0 && (
        <div className="pt-tpl-empty">
          No approved templates yet — go to Settings → WhatsApp Templates to create one.
        </div>
      )}

      {loaded && templates.length > 0 && (
        <div className="pt-wa-picker-body">
          <ul className="pt-tpl-list pt-wa-picker-list">
            {templates.map(t => (
              <li
                key={t.id}
                className={`pt-tpl-item ${selected?.id === t.id ? 'is-selected' : ''}`}
                onClick={() => selectTemplate(t)}
              >
                <div className="pt-tpl-title">{t.name}</div>
                <div className="pt-tpl-preview">{t.body.slice(0, 80)}{t.body.length > 80 ? '…' : ''}</div>
              </li>
            ))}
          </ul>

          {selected && (
            <div className="pt-wa-picker-vars">
              {selected.variables.length > 0 ? (
                <>
                  <div className="pt-wa-picker-vars-title">Fill in variables</div>
                  {selected.variables.map(v => (
                    <div key={v.key} className="pt-wa-picker-var-row">
                      <label className="pt-wa-picker-var-label">{v.label}</label>
                      <input
                        className="pt-input"
                        placeholder={v.key}
                        value={vars[v.key] ?? ''}
                        onChange={e => setVars(prev => ({ ...prev, [v.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </>
              ) : (
                <div className="pt-wa-picker-vars-title">No variables required</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="pt-wa-picker-actions">
        {sendError && <p style={{ color: 'var(--pt-danger)', fontSize: 11, margin: 0 }}>{sendError}</p>}
        <button className="pt-btn pt-btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="pt-btn pt-btn-primary"
          disabled={!selected || isSending}
          onClick={() => void send()}
        >
          {isSending ? 'Sending…' : 'Send Template'}
        </button>
      </div>
    </div>
  )
}
