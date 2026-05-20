'use client'

import { useState } from 'react'
import type { Automation, TriggerType, ActionType, Condition } from '@/types/automations'
import { createAutomation, updateAutomation } from '@/app/automations/actions'

type Props = {
  mode: 'create' | 'edit'
  automation?: Automation
  onClose: () => void
}

const ORDER_STATUSES = ['awaiting', 'confirming', 'packing', 'shipped', 'delivered', 'disputed']
const ICON_OPTIONS = ['send', 'bell', 'zap', 'star', 'clock', 'shield', 'tag', 'user']

const TRIGGER_TILES: { type: TriggerType; label: string; sub: string }[] = [
  { type: 'new_thread',        label: 'New conversation',   sub: 'A customer contacts you for the first time' },
  { type: 'order_state',       label: 'Order update',        sub: 'An order moves to a specific status' },
  { type: 'schedule',          label: 'Scheduled',           sub: 'Runs automatically at a set time each day' },
  { type: 'protocol_progress', label: 'Protocol progress',   sub: 'A customer nears the end of their cycle' },
]

const SCOPE_TILES = [
  { value: 'tenant',    label: 'The whole account',          sub: 'Runs once per day — good for digests and operator alerts' },
  { value: 'customers', label: 'Each customer individually', sub: 'Checks conditions per person — required for customer messages' },
]

const CONDITION_TYPES: { value: Condition['type']; label: string }[] = [
  { value: 'trust_score',             label: 'Trust score'              },
  { value: 'ltv',                     label: 'Lifetime value'           },
  { value: 'last_message_hours',      label: 'Hours since last message' },
  { value: 'is_new_customer',         label: 'Is new customer'          },
  { value: 'protocol_days_remaining', label: 'Days remaining in cycle'  },
  { value: 'days_since_last_order',   label: 'Days since last order'    },
  { value: 'has_tag',                 label: 'Customer has tag'         },
]

const CONDITION_OPERATORS = [
  { value: 'gte', label: 'is greater than or equal to' },
  { value: 'lte', label: 'is less than or equal to'    },
  { value: 'eq',  label: 'is equal to'                 },
]

const ACTION_TILES: { type: ActionType; label: string; sub: string }[] = [
  { type: 'send_dm',        label: 'Send a message',     sub: 'Compose a DM to the customer'                  },
  { type: 'operator_alert', label: 'Notify me',          sub: 'Send yourself an alert inside Peptech'         },
  { type: 'score_adjust',   label: 'Adjust trust score', sub: 'Increase or decrease the customer\'s rating'   },
  { type: 'operator_task',  label: 'Add a task',         sub: 'Create a manual follow-up reminder'            },
]

export default function AutomationModal({ mode, automation, onClose }: Props) {
  // Separate cooldown from conditions — it gets its own dedicated UI step
  const rawConds = (automation?.conditions ?? []) as Condition[]
  const initCooldown = rawConds.find(c => c.type === 'cooldown_days') as { type: 'cooldown_days'; value: number } | undefined
  const initConds = rawConds.filter(c => c.type !== 'cooldown_days')

  const [name, setName]               = useState(automation?.name ?? '')
  const [icon, setIcon]               = useState(automation?.icon ?? 'send')
  const [triggerType, setTriggerType] = useState<TriggerType>(automation?.trigger_type ?? 'new_thread')
  const [triggerParams, setTriggerParams] = useState<Record<string, unknown>>(automation?.trigger_params ?? {})
  const [conditions, setConditions]   = useState<Condition[]>(initConds)
  const [cooldownDays, setCooldownDays] = useState<number | null>(initCooldown?.value ?? null)
  const [actionType, setActionType]   = useState<ActionType>(automation?.action_type ?? 'send_dm')
  const [actionParams, setActionParams] = useState<Record<string, unknown>>(automation?.action_params ?? {})
  const [saving, setSaving]           = useState(false)

  function handleTriggerTypeChange(t: TriggerType) {
    setTriggerType(t)
    setTriggerParams({})
  }

  function addCondition() {
    setConditions(prev => [...prev, { type: 'trust_score', operator: 'gte', value: 0 } as Condition])
  }

  function removeCondition(i: number) {
    setConditions(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateCondition(i: number, patch: Partial<Record<string, unknown>>) {
    setConditions(prev => prev.map((c, idx) => {
      if (idx !== i) return c
      if (patch.type !== undefined && patch.type !== c.type) {
        const t = patch.type as Condition['type']
        if (t === 'is_new_customer') return { type: t, operator: 'eq', value: false } as Condition
        if (t === 'has_tag') return { type: t, operator: 'eq', value: '' } as Condition
        return { type: t, operator: 'gte', value: 0 } as Condition
      }
      return { ...c, ...patch } as Condition
    }))
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    const allConditions: Condition[] = [
      ...conditions,
      ...(cooldownDays != null ? [{ type: 'cooldown_days' as const, value: cooldownDays }] : []),
    ]
    const data = { name, icon, trigger_type: triggerType, trigger_params: triggerParams, conditions: allConditions, action_type: actionType, action_params: actionParams }
    if (mode === 'create') await createAutomation(data)
    else await updateAutomation(automation!.id, data)
    setSaving(false)
    onClose()
  }

  const isSchedule = triggerType === 'schedule'
  const scope = (triggerParams.scope as string | undefined) ?? 'tenant'
  const cronHour = parseInt(((triggerParams.cron as string) ?? '0 9 * * *').split(' ')[1] ?? '9', 10)

  let step = 0

  return (
    <div className="pt-lightbox" onClick={onClose}>
      <div className="pt-ab" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="pt-ab-hd">
          <div className="pt-ab-name-row">
            <select className="pt-ab-icon-sel" value={icon} onChange={e => setIcon(e.target.value)} title="Choose icon">
              {ICON_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <input
              className="pt-ab-name-input"
              placeholder="Name this automation…"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <button className="pt-au-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Body ── */}
        <div className="pt-ab-body">

          {/* ── Step: WHEN ── */}
          <div className="pt-ab-step">
            <div className="pt-ab-step-spine">
              <span className="pt-ab-step-num">{++step}</span>
              <div className="pt-ab-step-line" />
            </div>
            <div className="pt-ab-step-content">
              <div className="pt-ab-step-lbl">WHEN</div>
              <div className="pt-ab-step-q">What triggers this automation?</div>
              <div className="pt-ab-tile-grid">
                {TRIGGER_TILES.map(t => (
                  <button
                    key={t.type}
                    className={`pt-ab-tile${triggerType === t.type ? ' is-sel' : ''}`}
                    onClick={() => handleTriggerTypeChange(t.type)}
                  >
                    <span className="pt-ab-tile-label">{t.label}</span>
                    <span className="pt-ab-tile-sub">{t.sub}</span>
                  </button>
                ))}
              </div>

              {/* Trigger-specific params */}
              {(triggerType === 'order_state' || triggerType === 'new_thread') && (
                <div className="pt-ab-extras">
                  {triggerType === 'order_state' && (
                    <div className="pt-ab-field">
                      <label className="pt-ab-field-lbl">Order moves to</label>
                      <select className="pt-ab-select" value={(triggerParams.to_status as string) ?? 'shipped'}
                        onChange={e => setTriggerParams(p => ({ ...p, to_status: e.target.value }))}>
                        {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="pt-ab-field">
                    <label className="pt-ab-field-lbl">
                      Delay <span className="pt-ab-field-opt">(optional — days after trigger)</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input className="pt-ab-input" style={{ width: 72 }} type="number" min={0} max={365}
                        placeholder="0"
                        value={(triggerParams.delay_days as number | undefined) ?? ''}
                        onChange={e => {
                          const v = parseInt(e.target.value, 10)
                          setTriggerParams(p => ({ ...p, delay_days: isNaN(v) || v <= 0 ? undefined : v }))
                        }} />
                      <span className="pt-ab-unit">days</span>
                    </div>
                  </div>
                </div>
              )}

              {triggerType === 'protocol_progress' && (
                <div className="pt-ab-extras">
                  <div className="pt-ab-field">
                    <label className="pt-ab-field-lbl">Days before cycle end</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input className="pt-ab-input" style={{ width: 72 }} type="number" min={1}
                        value={(triggerParams.days_before_end as number | undefined) ?? ''}
                        onChange={e => setTriggerParams({ days_before_end: Number(e.target.value) })} />
                      <span className="pt-ab-unit">days</span>
                    </div>
                  </div>
                </div>
              )}

              {triggerType === 'schedule' && (
                <div className="pt-ab-extras">
                  <div className="pt-ab-field">
                    <label className="pt-ab-field-lbl">Time (UTC)</label>
                    <select className="pt-ab-select" style={{ width: 140 }} value={cronHour}
                      onChange={e => setTriggerParams(p => ({ ...p, cron: `0 ${e.target.value} * * *` }))}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}:00 UTC</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Step: WHO (schedule only) ── */}
          {isSchedule && (
            <div className="pt-ab-step">
              <div className="pt-ab-step-spine">
                <span className="pt-ab-step-num">{++step}</span>
                <div className="pt-ab-step-line" />
              </div>
              <div className="pt-ab-step-content">
                <div className="pt-ab-step-lbl">WHO</div>
                <div className="pt-ab-step-q">Who does this apply to?</div>
                <div className="pt-ab-scope-grid">
                  {SCOPE_TILES.map(s => (
                    <button key={s.value}
                      className={`pt-ab-scope-tile${scope === s.value ? ' is-sel' : ''}`}
                      onClick={() => setTriggerParams(p => ({ ...p, scope: s.value }))}>
                      <span className="pt-ab-scope-label">{s.label}</span>
                      <span className="pt-ab-scope-sub">{s.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step: IF ── */}
          <div className="pt-ab-step">
            <div className="pt-ab-step-spine">
              <span className="pt-ab-step-num">{++step}</span>
              <div className="pt-ab-step-line" />
            </div>
            <div className="pt-ab-step-content">
              <div className="pt-ab-step-lbl-row">
                <div>
                  <div className="pt-ab-step-lbl">IF</div>
                  <div className="pt-ab-step-q">
                    Only run when these conditions are met
                    <span className="pt-ab-step-hint"> — all must be true</span>
                  </div>
                </div>
                <button className="pt-ab-add-btn" onClick={addCondition}>+ Add condition</button>
              </div>

              {conditions.length === 0 && (
                <div className="pt-ab-empty-hint">No conditions set — this automation fires for everyone.</div>
              )}

              <div className="pt-ab-conds">
                {conditions.map((c, i) => (
                  <div key={i} className="pt-ab-cond-row">
                    <select className="pt-ab-cond-type" value={c.type}
                      onChange={e => updateCondition(i, { type: e.target.value })}>
                      {CONDITION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>

                    {c.type !== 'has_tag' && c.type !== 'is_new_customer' && (
                      <select className="pt-ab-cond-op" value={'operator' in c ? c.operator : 'gte'}
                        onChange={e => updateCondition(i, { operator: e.target.value })}>
                        {CONDITION_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}

                    {c.type === 'is_new_customer' ? (
                      <select className="pt-ab-cond-val-sel" value={String(c.value)}
                        onChange={e => updateCondition(i, { value: e.target.value === 'true' })}>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : c.type === 'has_tag' ? (
                      <input className="pt-ab-input pt-ab-cond-val" placeholder="tag name"
                        value={c.value as string}
                        onChange={e => updateCondition(i, { value: e.target.value })} />
                    ) : (
                      <input className="pt-ab-input pt-ab-cond-val" type="number"
                        value={c.value as number}
                        onChange={e => updateCondition(i, { value: Number(e.target.value) })} />
                    )}

                    <button className="pt-ab-cond-rm" onClick={() => removeCondition(i)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Step: COOLDOWN ── */}
          <div className="pt-ab-step">
            <div className="pt-ab-step-spine">
              <span className="pt-ab-step-num">{++step}</span>
              <div className="pt-ab-step-line" />
            </div>
            <div className="pt-ab-step-content">
              <div className="pt-ab-step-lbl-row">
                <div>
                  <div className="pt-ab-step-lbl">COOLDOWN</div>
                  <div className="pt-ab-step-q">Prevent repeated sends</div>
                </div>
                <label className="pt-ab-sw">
                  <input type="checkbox" checked={cooldownDays != null}
                    onChange={e => setCooldownDays(e.target.checked ? 30 : null)} />
                  <span className="pt-ab-sw-track" />
                </label>
              </div>

              {cooldownDays != null ? (
                <div className="pt-ab-cooldown-row">
                  <span className="pt-ab-cooldown-pre">Don&apos;t fire again for the same customer within</span>
                  <input className="pt-ab-input pt-ab-cooldown-num" type="number" min={1} max={365}
                    value={cooldownDays}
                    onChange={e => setCooldownDays(Math.max(1, Number(e.target.value)))} />
                  <span className="pt-ab-unit">days</span>
                </div>
              ) : (
                <div className="pt-ab-empty-hint">Off — the same customer could receive this on every run. Turn on to add a cooldown window.</div>
              )}
            </div>
          </div>

          {/* ── Step: THEN ── */}
          <div className="pt-ab-step pt-ab-step-last">
            <div className="pt-ab-step-spine">
              <span className="pt-ab-step-num pt-ab-step-num-last">{++step}</span>
            </div>
            <div className="pt-ab-step-content">
              <div className="pt-ab-step-lbl">THEN</div>
              <div className="pt-ab-step-q">What should happen?</div>
              <div className="pt-ab-tile-grid">
                {ACTION_TILES.map(a => (
                  <button key={a.type}
                    className={`pt-ab-tile${actionType === a.type ? ' is-sel' : ''}`}
                    onClick={() => { setActionType(a.type); setActionParams({}) }}>
                    <span className="pt-ab-tile-label">{a.label}</span>
                    <span className="pt-ab-tile-sub">{a.sub}</span>
                  </button>
                ))}
              </div>

              {actionType === 'send_dm' && (
                <div className="pt-ab-extras">
                  <div className="pt-ab-field">
                    <label className="pt-ab-field-lbl">Message text</label>
                    <textarea className="pt-ab-textarea" rows={3}
                      placeholder="Hey! Just checking in…"
                      value={(actionParams.message as string) ?? ''}
                      onChange={e => setActionParams(p => ({ ...p, message: e.target.value }))} />
                  </div>
                  <label className="pt-ab-check-row">
                    <input type="checkbox"
                      checked={(actionParams.review_required as boolean | undefined) ?? true}
                      onChange={e => setActionParams(p => ({ ...p, review_required: e.target.checked }))} />
                    <span>Hold for my review before sending</span>
                  </label>
                </div>
              )}

              {actionType === 'operator_alert' && (
                <div className="pt-ab-extras">
                  <div className="pt-ab-field">
                    <label className="pt-ab-field-lbl">Alert message</label>
                    <input className="pt-ab-input" type="text"
                      value={(actionParams.message as string) ?? ''}
                      onChange={e => setActionParams(p => ({ ...p, message: e.target.value }))} />
                  </div>
                  <div className="pt-ab-field">
                    <label className="pt-ab-field-lbl">Severity</label>
                    <select className="pt-ab-select" value={(actionParams.severity as string) ?? 'info'}
                      onChange={e => setActionParams(p => ({ ...p, severity: e.target.value }))}>
                      <option value="info">Info</option>
                      <option value="warn">Warning</option>
                      <option value="err">Error</option>
                    </select>
                  </div>
                </div>
              )}

              {actionType === 'score_adjust' && (
                <div className="pt-ab-extras">
                  <div className="pt-ab-field">
                    <label className="pt-ab-field-lbl">Score change <span className="pt-ab-field-opt">(negative to decrease)</span></label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input className="pt-ab-input" type="number" style={{ width: 80 }}
                        value={(actionParams.delta as number) ?? 0}
                        onChange={e => setActionParams(p => ({ ...p, delta: Number(e.target.value) }))} />
                      <span className="pt-ab-unit">points</span>
                    </div>
                  </div>
                  <div className="pt-ab-field">
                    <label className="pt-ab-field-lbl">Reason <span className="pt-ab-field-opt">(shown in activity log)</span></label>
                    <input className="pt-ab-input" type="text"
                      value={(actionParams.reason as string) ?? ''}
                      onChange={e => setActionParams(p => ({ ...p, reason: e.target.value }))} />
                  </div>
                </div>
              )}

              {actionType === 'operator_task' && (
                <div className="pt-ab-extras">
                  <div className="pt-ab-field">
                    <label className="pt-ab-field-lbl">Task description</label>
                    <input className="pt-ab-input" type="text"
                      placeholder="Follow up with customer about reorder"
                      value={(actionParams.title as string) ?? ''}
                      onChange={e => setActionParams(p => ({ ...p, title: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="pt-ab-footer">
          <button className="pt-btn pt-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="pt-btn pt-btn-primary" disabled={saving || !name.trim()}
            onClick={() => void handleSave()}>
            {saving ? 'Saving…' : mode === 'create' ? 'Create automation' : 'Save changes'}
          </button>
        </div>

      </div>
    </div>
  )
}
