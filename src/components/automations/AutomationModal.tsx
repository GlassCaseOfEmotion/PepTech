'use client'

import { useState } from 'react'
import type { Automation, TriggerType, ActionType, Condition } from '@/types/automations'
import { createAutomation, updateAutomation } from '@/app/automations/actions'

type Props = {
  mode: 'create' | 'edit'
  automation?: Automation
  onClose: () => void
}

const ICON_OPTIONS = ['send', 'bell', 'zap', 'star', 'clock', 'shield', 'tag', 'user']

const ORDER_STATUSES = ['awaiting', 'confirming', 'packing', 'shipped', 'delivered', 'disputed']

const CONDITION_TYPES: { value: Condition['type']; label: string }[] = [
  { value: 'trust_score',             label: 'Trust score'              },
  { value: 'ltv',                     label: 'Lifetime value'           },
  { value: 'last_message_hours',      label: 'Hours since last message' },
  { value: 'is_new_customer',         label: 'Is new customer'         },
  { value: 'protocol_days_remaining', label: 'Days remaining in cycle'  },
  { value: 'days_since_last_order',   label: 'Days since last order'    },
  { value: 'has_tag',                 label: 'Customer has tag'         },
  { value: 'cooldown_days',           label: "Don't re-fire within"     },
]
const CONDITION_OPERATORS: { value: Extract<Condition, { operator: string }>['operator']; label: string }[] = [
  { value: 'gte', label: 'is greater than or equal to' },
  { value: 'lte', label: 'is less than or equal to'    },
  { value: 'eq',  label: 'is equal to'                 },
]

export default function AutomationModal({ mode, automation, onClose }: Props) {
  const [name, setName]               = useState(automation?.name ?? '')
  const [icon, setIcon]               = useState(automation?.icon ?? 'send')
  const [triggerType, setTriggerType] = useState<TriggerType>(automation?.trigger_type ?? 'new_thread')
  const [triggerParams, setTriggerParams] = useState<Record<string, unknown>>(automation?.trigger_params ?? {})
  const [conditions, setConditions]   = useState<Condition[]>(automation?.conditions ?? [])
  const [actionType, setActionType]   = useState<ActionType>(automation?.action_type ?? 'send_dm')
  const [actionParams, setActionParams] = useState<Record<string, unknown>>(automation?.action_params ?? {})
  const [saving, setSaving]           = useState(false)

  // ── Trigger param helpers ────────────────────────────────────────────────────

  function handleTriggerTypeChange(t: TriggerType) {
    setTriggerType(t)
    setTriggerParams({})
  }

  function renderTriggerParams() {
    switch (triggerType) {
      case 'protocol_progress': {
        const val = (triggerParams.days_before_end as number | undefined) ?? ''
        return (
          <div className="pt-au-modal-field">
            <label className="pt-au-modal-field-label">Days before cycle end</label>
            <input
              type="number"
              className="pt-input"
              min={1}
              value={val}
              onChange={e => setTriggerParams({ days_before_end: Number(e.target.value) })}
            />
          </div>
        )
      }
      case 'schedule': {
        const cron  = (triggerParams.cron  as string | undefined) ?? '0 9 * * *'
        const scope = (triggerParams.scope as string | undefined) ?? 'tenant'
        const hour  = parseInt(cron.split(' ')[1] ?? '9', 10)
        return (
          <>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Hour (every day)</label>
              <select
                className="pt-input"
                value={hour}
                onChange={e => setTriggerParams(prev => ({ ...prev, cron: `0 ${e.target.value} * * *` }))}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Who does this apply to?</label>
              <select
                className="pt-input"
                value={scope}
                onChange={e => setTriggerParams(prev => ({ ...prev, scope: e.target.value }))}
              >
                <option value="tenant">The whole account</option>
                <option value="customers">Each customer individually</option>
              </select>
            </div>
            {scope === 'customers' && (
              <p className="pt-au-modal-hint">
                Evaluates conditions for every customer individually. Add a <b>Don&apos;t re-fire within</b> condition to prevent repeated sends.
              </p>
            )}
          </>
        )
      }
      case 'new_thread':
        return (
          <>
            <p className="pt-au-modal-hint">When a new inbound thread opens</p>
            <div style={{ marginTop: 10 }}>
              <div className="pt-modal-label" style={{ marginBottom: 4 }}>
                Delay <span style={{ color: 'var(--pt-fg-4)', fontWeight: 400 }}>(optional)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  className="pt-input"
                  type="number"
                  min="0"
                  max="365"
                  style={{ width: 72 }}
                  placeholder="0"
                  value={(triggerParams.delay_days as number | undefined) ?? ''}
                  onChange={e => {
                    const val = parseInt(e.target.value, 10)
                    setTriggerParams(prev => ({
                      ...prev,
                      delay_days: isNaN(val) || val <= 0 ? undefined : val,
                    }))
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--pt-fg-3)' }}>days after trigger</span>
              </div>
              {(triggerParams.delay_days as number) > 0 && (
                <p style={{ fontSize: 11.5, color: 'var(--pt-fg-4)', marginTop: 4, marginBottom: 0 }}>
                  Action will fire {triggerParams.delay_days as number} day{(triggerParams.delay_days as number) !== 1 ? 's' : ''} after the event. Disable the automation before then to cancel it.
                </p>
              )}
            </div>
          </>
        )
      case 'order_state': {
        const status = (triggerParams.to_status as string | undefined) ?? 'shipped'
        return (
          <>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Order moves to</label>
              <select
                className="pt-input"
                value={status}
                onChange={e => setTriggerParams(prev => ({ ...prev, to_status: e.target.value }))}
              >
                {ORDER_STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="pt-modal-label" style={{ marginBottom: 4 }}>
                Delay <span style={{ color: 'var(--pt-fg-4)', fontWeight: 400 }}>(optional)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  className="pt-input"
                  type="number"
                  min="0"
                  max="365"
                  style={{ width: 72 }}
                  placeholder="0"
                  value={(triggerParams.delay_days as number | undefined) ?? ''}
                  onChange={e => {
                    const val = parseInt(e.target.value, 10)
                    setTriggerParams(prev => ({
                      ...prev,
                      delay_days: isNaN(val) || val <= 0 ? undefined : val,
                    }))
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--pt-fg-3)' }}>days after trigger</span>
              </div>
              {(triggerParams.delay_days as number) > 0 && (
                <p style={{ fontSize: 11.5, color: 'var(--pt-fg-4)', marginTop: 4, marginBottom: 0 }}>
                  Action will fire {triggerParams.delay_days as number} day{(triggerParams.delay_days as number) !== 1 ? 's' : ''} after the event. Disable the automation before then to cancel it.
                </p>
              )}
            </div>
          </>
        )
      }
    }
  }

  // ── Condition helpers ────────────────────────────────────────────────────────

  function addCondition() {
    setConditions(prev => [...prev, { type: 'trust_score', operator: 'gte', value: 0 } as Condition])
  }

  function removeCondition(i: number) {
    setConditions(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateCondition(i: number, patch: Partial<Record<string, unknown>>) {
    setConditions(prev => prev.map((c, idx) => {
      if (idx !== i) return c
      const next = { ...c, ...patch } as Condition
      if (patch.type !== undefined && patch.type !== c.type) {
        const t = patch.type as Condition['type']
        if (t === 'is_new_customer') return { type: t, operator: 'eq', value: false } as Condition
        if (t === 'has_tag') return { type: t, operator: 'eq', value: '' } as Condition
        if (t === 'cooldown_days') return { type: t, value: 30 } as Condition
        return { type: t, operator: 'gte', value: 0 } as Condition
      }
      return next
    }))
  }

  // ── Action param helpers ─────────────────────────────────────────────────────

  function handleActionTypeChange(t: ActionType) {
    setActionType(t)
    setActionParams({})
  }

  function renderActionParams() {
    switch (actionType) {
      case 'send_dm': {
        const message = (actionParams.message as string | undefined) ?? ''
        const review  = (actionParams.review_required as boolean | undefined) ?? true
        return (
          <>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Message</label>
              <textarea
                className="pt-input"
                rows={4}
                value={message}
                onChange={e => setActionParams(p => ({ ...p, message: e.target.value }))}
              />
            </div>
            <label className="pt-au-modal-check-row">
              <input
                type="checkbox"
                checked={review}
                onChange={e => setActionParams(p => ({ ...p, review_required: e.target.checked }))}
              />
              <span>Require review before sending</span>
            </label>
          </>
        )
      }
      case 'operator_alert': {
        const message  = (actionParams.message as string | undefined) ?? ''
        const severity = (actionParams.severity as string | undefined) ?? 'info'
        return (
          <>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Message</label>
              <input
                type="text"
                className="pt-input"
                value={message}
                onChange={e => setActionParams(p => ({ ...p, message: e.target.value }))}
              />
            </div>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Severity</label>
              <select
                className="pt-input"
                value={severity}
                onChange={e => setActionParams(p => ({ ...p, severity: e.target.value }))}
              >
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="err">Error</option>
              </select>
            </div>
          </>
        )
      }
      case 'score_adjust': {
        const delta  = (actionParams.delta as number | undefined) ?? 0
        const reason = (actionParams.reason as string | undefined) ?? ''
        return (
          <>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Score delta</label>
              <input
                type="number"
                className="pt-input"
                value={delta}
                onChange={e => setActionParams(p => ({ ...p, delta: Number(e.target.value) }))}
              />
            </div>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Reason</label>
              <input
                type="text"
                className="pt-input"
                value={reason}
                onChange={e => setActionParams(p => ({ ...p, reason: e.target.value }))}
              />
            </div>
          </>
        )
      }
      case 'operator_task': {
        const title = (actionParams.title as string | undefined) ?? ''
        return (
          <div className="pt-au-modal-field">
            <label className="pt-au-modal-field-label">Task title</label>
            <input
              type="text"
              className="pt-input"
              value={title}
              onChange={e => setActionParams(p => ({ ...p, title: e.target.value }))}
            />
          </div>
        )
      }
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    const data = {
      name,
      icon,
      trigger_type: triggerType,
      trigger_params: triggerParams,
      conditions,
      action_type: actionType,
      action_params: actionParams,
    }
    if (mode === 'create') {
      await createAutomation(data)
    } else {
      await updateAutomation(automation!.id, data)
    }
    setSaving(false)
    onClose()
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="pt-lightbox" onClick={onClose}>
      <div className="pt-card pt-au-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="pt-card-hd">
          <h3>{mode === 'create' ? 'New Automation' : 'Edit Automation'}</h3>
          <button className="pt-au-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Scrollable body */}
        <div className="pt-card-body pt-au-modal-body">

          {/* Name + Icon */}
          <div className="pt-au-modal-name-row">
            <div className="pt-au-modal-field" style={{ flex: 1 }}>
              <label className="pt-au-modal-field-label">Name</label>
              <input
                type="text"
                className="pt-input"
                placeholder="Automation name"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Icon</label>
              <select
                className="pt-input"
                value={icon}
                onChange={e => setIcon(e.target.value)}
              >
                {ICON_OPTIONS.map(i => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
          </div>

          {/* WHEN */}
          <div className="pt-au-modal-section">
            <div className="pt-au-section-label">WHEN</div>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Trigger</label>
              <select
                className="pt-input"
                value={triggerType}
                onChange={e => handleTriggerTypeChange(e.target.value as TriggerType)}
              >
                <option value="new_thread">New thread</option>
                <option value="order_state">Order state change</option>
                <option value="protocol_progress">Protocol progress</option>
                <option value="schedule">Schedule</option>
              </select>
            </div>
            {renderTriggerParams()}
          </div>

          {/* IF */}
          <div className="pt-au-modal-section">
            <div className="pt-au-section-label">IF</div>
            {conditions.length > 0 && (
              <div className="pt-au-conditions-list">
                {conditions.map((c, i) => (
                  <div key={i} className="pt-au-condition-row">
                    <select
                      className="pt-input"
                      value={c.type}
                      onChange={e => updateCondition(i, { type: e.target.value })}
                    >
                      {CONDITION_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>

                    {c.type !== 'cooldown_days' && c.type !== 'has_tag' && c.type !== 'is_new_customer' && (
                      <select
                        className="pt-input pt-au-condition-op"
                        value={'operator' in c ? c.operator : 'gte'}
                        onChange={e => updateCondition(i, { operator: e.target.value })}
                      >
                        {CONDITION_OPERATORS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}

                    {c.type === 'is_new_customer' && (
                      <input
                        type="checkbox"
                        className="pt-au-condition-bool"
                        checked={Boolean(c.value)}
                        onChange={e => updateCondition(i, { value: e.target.checked })}
                      />
                    )}
                    {c.type === 'has_tag' && (
                      <input
                        type="text"
                        className="pt-input pt-au-condition-val"
                        placeholder="tag name"
                        value={c.value as string}
                        onChange={e => updateCondition(i, { value: e.target.value })}
                      />
                    )}
                    {c.type === 'cooldown_days' && (
                      <div className="pt-au-condition-inline">
                        <input
                          type="number"
                          className="pt-input pt-au-condition-val"
                          min={1}
                          value={c.value as number}
                          onChange={e => updateCondition(i, { value: Number(e.target.value) })}
                        />
                        <span style={{ fontSize: 12, color: 'var(--pt-fg-3)', whiteSpace: 'nowrap' }}>days</span>
                      </div>
                    )}
                    {c.type !== 'is_new_customer' && c.type !== 'has_tag' && c.type !== 'cooldown_days' && (
                      <input
                        type="number"
                        className="pt-input pt-au-condition-val"
                        value={c.value as number}
                        onChange={e => updateCondition(i, { value: Number(e.target.value) })}
                      />
                    )}

                    <button
                      className="pt-au-condition-remove"
                      onClick={() => removeCondition(i)}
                      aria-label="Remove condition"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
            <button className="pt-btn pt-btn-ghost pt-au-add-condition" onClick={addCondition}>
              + Add condition
            </button>
          </div>

          {/* THEN */}
          <div className="pt-au-modal-section">
            <div className="pt-au-section-label">THEN</div>
            <div className="pt-au-modal-field">
              <label className="pt-au-modal-field-label">Action</label>
              <select
                className="pt-input"
                value={actionType}
                onChange={e => handleActionTypeChange(e.target.value as ActionType)}
              >
                <option value="send_dm">Send DM</option>
                <option value="operator_alert">Notify operator</option>
                <option value="score_adjust">Adjust trust score</option>
                <option value="operator_task">Add task</option>
              </select>
            </div>
            {renderActionParams()}
          </div>

        </div>

        {/* Footer */}
        <div className="pt-au-modal-footer">
          <button className="pt-btn pt-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="pt-btn pt-btn-primary"
            disabled={saving || !name.trim()}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save automation'}
          </button>
        </div>

      </div>
    </div>
  )
}
