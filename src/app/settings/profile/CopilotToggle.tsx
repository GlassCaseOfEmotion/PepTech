'use client'

import { useState, useTransition } from 'react'
import { setCopilotEnabled } from './actions'

export function CopilotToggle({ enabled }: { enabled: boolean }) {
  const [value, setValue] = useState(enabled)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const handleToggle = () => {
    const next = !value
    setValue(next)
    setError('')
    startTransition(async () => {
      const res = await setCopilotEnabled(next)
      if ('error' in res) {
        setValue(!next)
        setError(res.error)
      }
    })
  }

  return (
    <div className="pt-st-field">
      <div className="pt-st-field-l">
        <label>AI Copilot</label>
      </div>
      <div className="pt-st-field-r">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className={`pt-st-toggle ${value ? 'is-on' : ''}`}
            onClick={handleToggle}
            disabled={pending}
            title={value ? 'Copilot enabled — click to disable' : 'Copilot disabled — click to enable'}
          />
          <span style={{ fontSize: 12.5, color: 'var(--pt-fg-3)' }}>
            {value ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 6 }}>
          Draft cross-sells, quotes, and replies as conversations progress (you approve everything before it sends).
        </p>
        {error && <p style={{ fontSize: 12, color: 'var(--pt-danger)', marginTop: 6 }}>{error}</p>}
      </div>
    </div>
  )
}
