'use client'

import React, { useState } from 'react'
import { Icons } from '@/lib/icons'
import type { AutoState, AutomationWithRuns, AutomationRun, Automation, Condition } from '@/types/automations'
import type { QueuedRun } from '@/types/automations'
import {
  toggleAutomation,
} from '@/app/automations/actions'
import { EmptyState } from '@/components/ui/EmptyState'
import { PendingApprovalCard } from '@/components/shared/PendingApprovalCard'
import { PendingApprovalRow } from '@/components/shared/PendingApprovalRow'
import AutomationModal from './AutomationModal'
import AutomationGuideModal from './AutomationGuideModal'

type Props = { automations: AutomationWithRuns[] }

// ── Plain-English helpers ─────────────────────────────────────────────────────

function triggerText(a: AutomationWithRuns): string {
  switch (a.trigger_type) {
    case 'new_thread': {
      const p = a.trigger_params as { delay_days?: number }
      return p.delay_days ? `New conversation — fires ${p.delay_days}d later` : 'When a new conversation opens'
    }
    case 'order_state': {
      const p = a.trigger_params as { to_status?: string; delay_days?: number }
      const d = p.delay_days ? `, ${p.delay_days}d after` : ''
      return `When an order is marked ${p.to_status ?? '…'}${d}`
    }
    case 'schedule': {
      const p = a.trigger_params as { cron?: string; scope?: string }
      const cron = p.cron ?? ''
      const hour = cron.split(' ')[1]
      const time = hour && hour !== '*' ? ` at ${String(parseInt(hour, 10)).padStart(2, '0')}:00 UTC` : ''
      return p.scope === 'customers'
        ? `Daily${time} — runs for each customer`
        : `Daily${time} — runs once`
    }
    case 'protocol_progress': {
      const p = a.trigger_params as { days_before_end?: number }
      return p.days_before_end != null
        ? `${p.days_before_end} days before cycle ends`
        : 'Protocol progress'
    }
    default: return a.trigger_type
  }
}

function actionText(a: AutomationWithRuns): string {
  switch (a.action_type) {
    case 'send_dm': {
      const p = a.action_params as { review_required?: boolean }
      return p.review_required !== false ? 'Send a DM — held for your review' : 'Send a DM automatically'
    }
    case 'operator_alert': return 'Send you an alert'
    case 'score_adjust': {
      const p = a.action_params as { delta?: number }
      if (p.delta == null) return 'Adjust trust score'
      return p.delta > 0 ? `Increase trust score by ${p.delta}` : `Decrease trust score by ${Math.abs(p.delta)}`
    }
    case 'operator_task': return 'Create a task'
    default: return a.action_type
  }
}

function automationSummary(a: AutomationWithRuns): string {
  const trigger = (() => {
    switch (a.trigger_type) {
      case 'new_thread': return 'new conversation'
      case 'order_state': {
        const p = a.trigger_params as { to_status?: string }
        return `order → ${p.to_status ?? 'update'}`
      }
      case 'schedule': {
        const p = a.trigger_params as { scope?: string }
        return p.scope === 'customers' ? 'schedule · per customer' : 'schedule · once'
      }
      case 'protocol_progress': {
        const p = a.trigger_params as { days_before_end?: number }
        return p.days_before_end != null ? `${p.days_before_end}d before cycle ends` : 'protocol progress'
      }
      default: return a.trigger_type
    }
  })()
  const action = (() => {
    switch (a.action_type) {
      case 'send_dm': {
        const p = a.action_params as { review_required?: boolean }
        return p.review_required !== false ? 'send DM (review)' : 'send DM'
      }
      case 'operator_alert': return 'alert operator'
      case 'score_adjust': {
        const p = a.action_params as { delta?: number }
        return `${p.delta != null && p.delta > 0 ? '+' : ''}${p.delta ?? '?'} trust`
      }
      case 'operator_task': return 'create task'
      default: return a.action_type
    }
  })()
  return `${trigger} → ${action}`
}

function conditionText(c: Condition): string {
  const op: Record<string, string> = { gte: '≥', lte: '≤', eq: '=' }
  switch (c.type) {
    case 'trust_score':             return `Trust score ${op[(c as {operator:string}).operator]} ${c.value}`
    case 'ltv':                     return `Lifetime value ${op[(c as {operator:string}).operator]} $${c.value}`
    case 'last_message_hours':      return `Hours since last message ${op[(c as {operator:string}).operator]} ${c.value}`
    case 'is_new_customer':         return c.value ? 'Is a new customer' : 'Is not a new customer'
    case 'protocol_days_remaining': return `Days left in cycle ${op[(c as {operator:string}).operator]} ${c.value}`
    case 'days_since_last_order':   return `Days since last order ${op[(c as {operator:string}).operator]} ${c.value}`
    case 'has_tag':                 return `Has tag "${c.value}"`
    case 'cooldown_days':           return `Not fired in the last ${c.value} days`
    default: return JSON.stringify(c)
  }
}

function runLabel(r: AutomationRun): string {
  if (r.state === 'skip') return 'Skipped'
  if (r.state === 'err') return r.action_summary ?? 'Error'
  if (r.state === 'scheduled') return 'Scheduled (delayed)'
  if (r.state === 'warn') return r.action_summary ?? 'Warning'
  return r.action_summary ?? r.state
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'Yesterday' : `${days}d ago`
}

function runsInWindow(runs: AutomationRun[], hours: number) {
  const cutoff = Date.now() - hours * 3_600_000
  return runs.filter(r => new Date(r.created_at).getTime() >= cutoff)
}

function toQueuedRun(r: AutomationRun, automationName: string): QueuedRun {
  const payload = r.action_payload as Record<string, unknown> | null
  return {
    id: r.id,
    automationName,
    contextLabel: r.context_label,
    message: (payload?.message as string) ?? r.action_summary ?? '',
    conversationId: (payload?.conversationId as string) ?? null,
    createdAt: r.created_at,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AutomationsView({ automations }: Props) {
  const [items, setItems] = useState<AutomationWithRuns[]>(automations)
  const [selectedId, setSelectedId] = useState<string>(automations[0]?.id ?? '')
  const [showModal, setShowModal] = useState<{ mode: 'create' } | { mode: 'edit'; automation: Automation } | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  const sel = items.find(a => a.id === selectedId) ?? items[0]

  const onCount = items.filter(a => a.state === 'on').length
  const totalPending = items.reduce((s, a) => s + a.automation_runs.filter(r => r.state === 'queued').length, 0)

  async function handleToggle(id: string, currentState: AutoState) {
    const next: AutoState = currentState === 'on' ? 'off' : 'on'
    setItems(prev => prev.map(a => a.id === id ? { ...a, state: next } : a))
    await toggleAutomation(id, next)
  }

  function handleRemoveRun(runId: string) {
    setItems(prev => prev.map(a => ({
      ...a,
      automation_runs: a.automation_runs.filter(r => r.id !== runId),
    })))
  }

  // All queued runs across every automation — derived from items so it stays in sync
  const allQueued = items.flatMap(a =>
    a.automation_runs
      .filter(r => r.state === 'queued')
      .map(r => toQueuedRun(r, a.name))
  )

  const selRuns = sel?.automation_runs ?? []
  const queued = selRuns.filter(r => r.state === 'queued')
  const history = selRuns.filter(r => r.state !== 'queued').slice(0, 20)
  const runs7d = runsInWindow(selRuns, 168)
  const errors7d = runs7d.filter(r => r.state === 'err').length
  const nonQueued7d = runs7d.filter(r => r.state !== 'queued')

  return (
    <div className="pt-au">

      {/* ── Header ── */}
      <div className="pt-au-hd">
        <div>
          <h1>Automations</h1>
          <p>
            {onCount} active
            {totalPending > 0 && <> · <span className="pt-au-hd-pending">{totalPending} awaiting review</span></>}
          </p>
        </div>
        <div className="pt-au-hd-actions">
          <button className="pt-btn pt-btn-ghost" onClick={() => setShowGuide(true)}>How automations work →</button>
          <button className="pt-btn pt-btn-ghost"><Icons.search size={12} /> Browse templates</button>
          <button className="pt-btn pt-btn-primary" onClick={() => setShowModal({ mode: 'create' })}>
            <Icons.plus size={12} /> New automation
          </button>
        </div>
      </div>

      {/* ── Pending review banner ── */}
      {allQueued.length > 0 && (
        <div className="pt-au-pending-banner">
          <div className="pt-au-pending-banner-hd">
            <span className="pt-au-pending-banner-dot" />
            <span className="pt-au-pending-banner-title">
              {allQueued.length} message{allQueued.length > 1 ? 's' : ''} awaiting your review
            </span>
          </div>
          <div className="pt-au-pending-banner-grid">
            {allQueued.map(r => (
              <PendingApprovalCard key={r.id} run={r} onRemove={handleRemoveRun} />
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="pt-empty-page">
          <EmptyState
            size="lg"
            icon={
              <svg width="130" height="88" viewBox="0 0 130 88" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="28" width="32" height="22" rx="4" strokeWidth="1.1"/>
                <text x="20" y="38.5" textAnchor="middle" fontSize="5.5" fill="currentColor" stroke="none" opacity="0.5" fontFamily="inherit" letterSpacing="0.05em">WHEN</text>
                <text x="20" y="46" textAnchor="middle" fontSize="4.8" fill="currentColor" stroke="none" opacity="0.85" fontFamily="inherit">New thread</text>
                <line x1="36" y1="39" x2="46" y2="39" strokeWidth="0.9" opacity="0.5"/>
                <polyline points="44,36.5 46.5,39 44,41.5" strokeWidth="0.9" opacity="0.5" fill="none"/>
                <rect x="47" y="28" width="32" height="22" rx="4" strokeWidth="1.1"/>
                <text x="63" y="38.5" textAnchor="middle" fontSize="5.5" fill="currentColor" stroke="none" opacity="0.5" fontFamily="inherit" letterSpacing="0.05em">IF</text>
                <text x="63" y="46" textAnchor="middle" fontSize="4.8" fill="currentColor" stroke="none" opacity="0.85" fontFamily="inherit">Trust ≥ 50</text>
                <line x1="79" y1="39" x2="89" y2="39" strokeWidth="0.9" opacity="0.5"/>
                <polyline points="87,36.5 89.5,39 87,41.5" strokeWidth="0.9" opacity="0.5" fill="none"/>
                <rect x="90" y="28" width="36" height="22" rx="4" strokeWidth="1.1"/>
                <text x="108" y="38.5" textAnchor="middle" fontSize="5.5" fill="currentColor" stroke="none" opacity="0.5" fontFamily="inherit" letterSpacing="0.05em">THEN</text>
                <text x="108" y="46" textAnchor="middle" fontSize="4.8" fill="currentColor" stroke="none" opacity="0.85" fontFamily="inherit">Send DM</text>
              </svg>
            }
            title="No automations yet"
            body="Build your first WHEN → IF → THEN workflow. Automations can send DMs, adjust trust scores, alert you, and more — all hands-free."
            action={{ label: 'Create first automation', onClick: () => setShowModal({ mode: 'create' }) }}
          />
        </div>
      ) : (
        <div className="pt-au-body">

          {/* ── Left: automation list ── */}
          <section className="pt-card pt-au-list-card">
            <div className="pt-card-body pt-au-list-body">
              <ul className="pt-au-list">
                {[...items]
                  .sort((a, b) => ({ on: 0, paused: 1, off: 2 }[a.state] ?? 3) - ({ on: 0, paused: 1, off: 2 }[b.state] ?? 3))
                  .map(a => {
                  const pendingCount = a.automation_runs.filter(r => r.state === 'queued').length
                  const runs = runsInWindow(a.automation_runs, 168).length
                  return (
                    <li
                      key={a.id}
                      className={`pt-au-row pt-au-state-${a.state}${selectedId === a.id ? ' is-active' : ''}`}
                      onClick={() => setSelectedId(a.id)}
                    >
                      <span className={`pt-au-state-bar pt-au-state-bar-${a.state}`} />
                      <div className="pt-au-row-body">
                        <div className="pt-au-row-name">{a.name}</div>
                        <div className="pt-au-row-summary">{automationSummary(a)}</div>
                      </div>
                      <div className="pt-au-row-right">
                        {pendingCount > 0 && (
                          <span className="pt-au-row-badge pt-au-row-badge-pending">{pendingCount} pending</span>
                        )}
                        {runs > 0 && pendingCount === 0 && (
                          <span className="pt-au-row-badge pt-au-row-badge-runs">{runs} /7d</span>
                        )}
                        <button
                          className={`pt-au-toggle pt-au-toggle-${a.state}`}
                          onClick={e => { e.stopPropagation(); void handleToggle(a.id, a.state) }}
                          title={a.state === 'on' ? 'Turn off' : 'Turn on'}
                        >
                          <span />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>

          {/* ── Right: detail panel ── */}
          {sel && (
            <section className="pt-card pt-au-detail">
              <div className="pt-card-body pt-au-detail-body">

                {/* Hero */}
                <div className="pt-au-hero">
                  <div className="pt-au-hero-top">
                    <h2 className="pt-au-hero-name">{sel.name}</h2>
                    <div className="pt-au-hero-actions">
                      <button
                        className={`pt-au-toggle pt-au-toggle-${sel.state}`}
                        onClick={() => void handleToggle(sel.id, sel.state)}
                        title={sel.state === 'on' ? 'Turn off' : 'Turn on'}
                      ><span /></button>
                      <span className={`pt-au-state-label pt-au-state-label-${sel.state}`}>
                        {sel.state === 'on' ? 'Active' : sel.state === 'paused' ? 'Paused' : 'Off'}
                      </span>
                      <button
                        className="pt-btn pt-btn-ghost"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => setShowModal({ mode: 'edit', automation: sel })}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  <p className="pt-au-hero-summary">
                    {triggerText(sel)} · {actionText(sel).toLowerCase()}
                  </p>
                </div>

                {/* Stats bar */}
                <div className="pt-au-stats">
                  <div className="pt-au-stat">
                    <span className="pt-au-stat-val">{nonQueued7d.length}</span>
                    <span className="pt-au-stat-lbl">Runs · 7d</span>
                  </div>
                  <div className="pt-au-stat-div" />
                  <div className="pt-au-stat">
                    <span className={`pt-au-stat-val${queued.length > 0 ? ' pt-au-stat-warn' : ''}`}>{queued.length}</span>
                    <span className="pt-au-stat-lbl">Awaiting review</span>
                  </div>
                  <div className="pt-au-stat-div" />
                  <div className="pt-au-stat">
                    <span className={`pt-au-stat-val${errors7d > 0 ? ' pt-au-stat-err' : ''}`}>{errors7d}</span>
                    <span className="pt-au-stat-lbl">Errors · 7d</span>
                  </div>
                  <div className="pt-au-stat-div" />
                  <div className="pt-au-stat">
                    <span className="pt-au-stat-val">
                      {nonQueued7d.length > 0
                        ? `${Math.round((nonQueued7d.filter(r => r.state === 'ok').length / nonQueued7d.length) * 100)}%`
                        : '—'}
                    </span>
                    <span className="pt-au-stat-lbl">Success rate</span>
                  </div>
                </div>

                {/* Pending review */}
                {queued.length > 0 && (
                  <div className="pt-au-pending-section">
                    <div className="pt-au-pending-hd">
                      <span className="pt-au-pending-dot" />
                      <span className="pt-au-pending-title">
                        {queued.length} message{queued.length > 1 ? 's' : ''} waiting for your review
                      </span>
                    </div>
                    <div className="pt-au-pending-rows">
                      {queued.map(r => (
                        <PendingApprovalRow
                          key={r.id}
                          run={toQueuedRun(r, sel.name)}
                          onRemove={handleRemoveRun}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Flow — plain English */}
                <div className="pt-au-flow-plain">
                  <div className="pt-au-flow-row">
                    <span className="pt-au-flow-tag pt-au-flow-tag-when">WHEN</span>
                    <span className="pt-au-flow-val">{triggerText(sel)}</span>
                  </div>
                  {sel.conditions.filter(c => c.type !== 'cooldown_days').length > 0 && (
                    <div className="pt-au-flow-row">
                      <span className="pt-au-flow-tag pt-au-flow-tag-if">IF</span>
                      <span className="pt-au-flow-val">
                        {sel.conditions
                          .filter(c => c.type !== 'cooldown_days')
                          .map((c, i, arr) => (
                            <span key={i}>
                              {conditionText(c)}
                              {i < arr.length - 1 && <span className="pt-au-flow-and"> and </span>}
                            </span>
                          ))}
                      </span>
                    </div>
                  )}
                  {sel.conditions.find(c => c.type === 'cooldown_days') && (
                    <div className="pt-au-flow-row">
                      <span className="pt-au-flow-tag pt-au-flow-tag-cd">LIMIT</span>
                      <span className="pt-au-flow-val">
                        {conditionText(sel.conditions.find(c => c.type === 'cooldown_days')!)}
                      </span>
                    </div>
                  )}
                  <div className="pt-au-flow-row">
                    <span className="pt-au-flow-tag pt-au-flow-tag-then">THEN</span>
                    <span className="pt-au-flow-val">{actionText(sel)}</span>
                  </div>
                  {sel.action_type === 'send_dm' && (sel.action_params as {message?: string}).message && (
                    <div className="pt-au-flow-msg">
                      &ldquo;{(sel.action_params as {message: string}).message}&rdquo;
                    </div>
                  )}
                </div>

                {/* Activity timeline */}
                <div className="pt-au-timeline">
                  <div className="pt-au-timeline-hd">Recent activity</div>
                  {history.length === 0 ? (
                    <div className="pt-au-timeline-empty">
                      {sel.state === 'on'
                        ? 'No runs yet — waiting for the trigger to fire.'
                        : 'Turn this automation on to start collecting runs.'}
                    </div>
                  ) : (
                    <ul className="pt-au-timeline-list">
                      {history.slice(0, 12).map(r => {
                        const stateIcon = r.state === 'ok' ? '✓' : r.state === 'err' ? '✕' : r.state === 'warn' ? '⚠' : '—'
                        const stateCls  = r.state === 'ok' ? 'ok' : r.state === 'err' ? 'err' : r.state === 'skip' ? 'skip' : 'warn'
                        return (
                          <li key={r.id} className="pt-au-timeline-row">
                            <span className={`pt-au-timeline-icon pt-au-tl-${stateCls}`}>{stateIcon}</span>
                            <span className="pt-au-timeline-who">{r.context_label ?? r.context_ref ?? 'Account'}</span>
                            <span className="pt-au-timeline-what">{runLabel(r)}</span>
                            <span className="pt-au-timeline-when">{formatRelativeTime(r.created_at)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

              </div>
            </section>
          )}
        </div>
      )}

      {showModal && (
        <AutomationModal
          mode={showModal.mode}
          automation={showModal.mode === 'edit' ? showModal.automation : undefined}
          onClose={() => setShowModal(null)}
        />
      )}
      {showGuide && <AutomationGuideModal onClose={() => setShowGuide(false)} />}
    </div>
  )
}
