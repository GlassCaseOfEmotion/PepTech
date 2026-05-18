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

const CONDITION_TYPES: Condition['type'][] = ['trust_score', 'ltv', 'last_message_hours', 'is_new_customer']
const CONDITION_OPERATORS: { value: Condition['operator']; label: string }[] = [
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'eq',  label: '=' },
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
        const cron = (triggerParams.cron as string | undefined) ?? '0 9 * * *'
        const hour = parseInt(cron.split(' ')[1] ?? '9', 10)
        return (
          <div className="pt-au-modal-field">
            <label className="pt-au-modal-field-label">Hour (every day)</label>
            <select
              className="pt-input"
              value={hour}
              onChange={e => setTriggerParams({ cron: `0 ${e.target.value} * * *` })}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
        )
      }
      case 'new_thread':
        return (
          <p className="pt-au-modal-hint">When a new inbound thread opens</p>
        )
      case 'order_state': {
        const status = (triggerParams.to_status as string | undefined) ?? 'shipped'
        return (
          <div className="pt-au-modal-field">
            <label className="pt-au-modal-field-label">Order moves to</label>
            <select
              className="pt-input"
              value={status}
              onChange={e => setTriggerParams({ to_status: e.target.value })}
            >
              {ORDER_STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )
      }
    }
  }

  // ── Condition helpers ────────────────────────────────────────────────────────

  function addCondition() {
    setConditions(prev => [...prev, { type: 'trust_score', operator: 'gte', value: 0 }])
  }

  function removeCondition(i: number) {
    setConditions(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateCondition(i: number, patch: Partial<Condition>) {
    setConditions(prev => prev.map((c, idx) => {
      if (idx !== i) return c
      const next = { ...c, ...patch }
      // Reset value type when switching to/from is_new_customer
      if (patch.type !== undefined && patch.type !== c.type) {
        next.value = patch.type === 'is_new_customer' ? false : 0
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
                      onChange={e => updateCondition(i, { type: e.target.value as Condition['type'] })}
                    >
                      {CONDITION_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <select
                      className="pt-input pt-au-condition-op"
                      value={c.operator}
                      onChange={e => updateCondition(i, { operator: e.target.value as Condition['operator'] })}
                    >
                      {CONDITION_OPERATORS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {c.type === 'is_new_customer' ? (
                      <input
                        type="checkbox"
                        className="pt-au-condition-bool"
                        checked={Boolean(c.value)}
                        onChange={e => updateCondition(i, { value: e.target.checked })}
                      />
                    ) : (
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
                    >
                      ✕
                    </button>
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
