'use client'

import { useState, useTransition } from 'react'
import { createWaTemplate, updateWaTemplate, deleteWaTemplate } from './actions'

interface WaTemplate {
  id: string
  name: string
  body: string
  variables: { key: string; label: string }[]
  content_sid: string | null
  status: string
  created_at: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

const STATUS_COLORS: Record<string, string> = {
  draft:    'var(--pt-fg-4)',
  pending:  '#d97706',
  approved: 'var(--pt-ok)',
  rejected: 'var(--pt-danger)',
}

const inputStyle = {
  height: 32, padding: '0 10px', borderRadius: 'var(--pt-radius-sm)',
  border: '0.5px solid var(--pt-line)', background: 'var(--pt-bg)',
  font: 'inherit', fontSize: 12.5, color: 'var(--pt-fg)', outline: 'none', width: '100%',
} as const

const taStyle = {
  width: '100%', boxSizing: 'border-box' as const,
  background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)',
  borderRadius: 6, padding: '7px 9px', font: 'inherit', fontSize: 12.5,
  color: 'var(--pt-fg)', resize: 'vertical' as const, outline: 'none', lineHeight: 1.45,
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 99,
      fontSize: 11, fontWeight: 500, letterSpacing: '0.01em',
      background: 'color-mix(in srgb, ' + STATUS_COLORS[status] + ' 15%, transparent)',
      color: STATUS_COLORS[status] ?? 'var(--pt-fg-4)',
      border: '0.5px solid color-mix(in srgb, ' + STATUS_COLORS[status] + ' 30%, transparent)',
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function TemplateRow({ template }: { template: WaTemplate }) {
  const [contentSid, setContentSid] = useState(template.content_sid ?? '')
  const [status, setStatus] = useState(template.status)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const saveChanges = () => {
    setSaved(false); setError('')
    start(async () => {
      const res = await updateWaTemplate(template.id, {
        content_sid: contentSid || undefined,
        status,
      })
      if (res.error) { setError(res.error); return }
      setSaved(true)
    })
  }

  const handleDelete = () => {
    if (!confirm(`Delete template "${template.name}"?`)) return
    start(async () => {
      await deleteWaTemplate(template.id)
    })
  }

  const dirty = contentSid !== (template.content_sid ?? '') || status !== template.status

  return (
    <li className="pt-tpl-settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div className="pt-tpl-settings-info" style={{ flex: 1 }}>
          <div className="pt-tpl-settings-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {template.name}
            <StatusBadge status={status} />
          </div>
          <div className="pt-tpl-settings-body">
            {template.body.slice(0, 120)}{template.body.length > 120 ? '…' : ''}
          </div>
        </div>
        <button
          className="pt-st-mini pt-st-mini-warn"
          onClick={handleDelete}
          disabled={pending}
          style={{ flexShrink: 0, marginTop: 2 }}
        >
          Delete
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={contentSid}
          onChange={e => { setContentSid(e.target.value); setSaved(false) }}
          placeholder="Content SID (HX…)"
          style={{ ...inputStyle, maxWidth: 220 }}
        />
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setSaved(false) }}
          style={{ ...inputStyle, maxWidth: 130 }}
        >
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button
          className="pt-btn pt-btn-primary"
          style={{ fontSize: 12, height: 32, padding: '0 14px' }}
          onClick={saveChanges}
          disabled={pending || !dirty}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span style={{ fontSize: 12, color: 'var(--pt-ok)' }}>Saved.</span>}
        {error && <span style={{ fontSize: 12, color: 'var(--pt-danger)' }}>{error}</span>}
      </div>
    </li>
  )
}

function NewTemplateForm() {
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [variables, setVariables] = useState<{ key: string; label: string }[]>([])
  const [varKey, setVarKey] = useState('')
  const [varLabel, setVarLabel] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const addVar = () => {
    const k = varKey.trim()
    const l = varLabel.trim()
    if (!k || !l) return
    setVariables(v => [...v, { key: k, label: l }])
    setVarKey(''); setVarLabel('')
  }

  const removeVar = (i: number) => setVariables(v => v.filter((_, idx) => idx !== i))

  const submit = () => {
    const n = name.trim(); const b = body.trim()
    if (!n || !b) { setError('Name and body are required.'); return }
    setError('')
    start(async () => {
      const res = await createWaTemplate({ name: n, body: b, variables })
      if (res.error) { setError(res.error); return }
      setName(''); setBody(''); setVariables([])
    })
  }

  return (
    <section className="pt-card pt-st-card">
      <header className="pt-card-hd pt-st-card-hd">
        <div><h3>New template</h3></div>
      </header>
      <div className="pt-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Template name (e.g. order_confirmation)"
          style={inputStyle}
        />
        <div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Template body — use {{1}}, {{2}} etc. for variables"
            rows={4}
            style={taStyle}
          />
          <p style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 4 }}>
            Use <code style={{ fontFamily: 'monospace', background: 'var(--pt-line)', padding: '1px 4px', borderRadius: 3 }}>{'{{1}}'}</code>{' '}
            syntax for variable placeholders (Twilio / Meta standard).
          </p>
        </div>

        {/* Variable labels */}
        <div>
          <p style={{ fontSize: 12, color: 'var(--pt-fg-3)', marginBottom: 6 }}>Variable labels (optional — for your reference)</p>
          {variables.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {variables.map((v, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <code style={{ fontFamily: 'monospace', background: 'var(--pt-line)', padding: '1px 5px', borderRadius: 3 }}>{v.key}</code>
                  <span style={{ color: 'var(--pt-fg-3)' }}>=</span>
                  <span>{v.label}</span>
                  <button
                    type="button"
                    onClick={() => removeVar(i)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--pt-fg-4)', cursor: 'pointer', padding: '2px 4px', fontSize: 11 }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={varKey}
              onChange={e => setVarKey(e.target.value)}
              placeholder="{{1}}"
              style={{ ...inputStyle, maxWidth: 80 }}
            />
            <input
              value={varLabel}
              onChange={e => setVarLabel(e.target.value)}
              placeholder="Label (e.g. Customer name)"
              onKeyDown={e => e.key === 'Enter' && addVar()}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              className="pt-btn pt-btn-ghost"
              style={{ fontSize: 12, height: 32, padding: '0 12px', flexShrink: 0 }}
              onClick={addVar}
            >
              Add
            </button>
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: 'var(--pt-danger)' }}>{error}</p>}

        <button
          className="pt-btn pt-btn-primary"
          style={{ alignSelf: 'flex-start', fontSize: 12 }}
          onClick={submit}
          disabled={pending}
        >
          {pending ? 'Creating…' : 'Create template'}
        </button>
      </div>
    </section>
  )
}

export function WaTemplatesForm({ templates }: { templates: WaTemplate[] }) {
  return (
    <>
      <section className="pt-card pt-st-card">
        <header className="pt-card-hd pt-st-card-hd">
          <div>
            <h3>Your templates</h3>
            <p>{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
          </div>
        </header>
        <div className="pt-card-body" style={{ padding: 0 }}>
          <ul className="pt-tpl-settings-list">
            {templates.map(t => <TemplateRow key={t.id} template={t} />)}
            {templates.length === 0 && (
              <li style={{ padding: '12px 16px', color: 'var(--pt-fg-4)', fontSize: 12 }}>
                No templates yet — create one below.
              </li>
            )}
          </ul>
        </div>
      </section>
      <NewTemplateForm />
    </>
  )
}
