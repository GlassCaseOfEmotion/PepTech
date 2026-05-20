'use client'

import React, { useState } from 'react'
import { Icons } from '@/lib/icons'
import type { AutoState, AutomationWithRuns, AutomationRun, Automation } from '@/types/automations'
import {
  toggleAutomation,
  approveAndSendQueuedRun,
  dismissQueuedRun,
} from '@/app/automations/actions'
import { EmptyState } from '@/components/ui/EmptyState'

import AutomationModal from './AutomationModal'

type Props = { automations: AutomationWithRuns[] }

// ── Helpers ──────────────────────────────────────────────────────────────────

function triggerLabel(a: AutomationWithRuns): string {
  switch (a.trigger_type) {
    case 'protocol_progress': {
      const p = a.trigger_params as { days_before_end?: number }
      return p.days_before_end != null ? `Cycle ends in ${p.days_before_end}d` : 'Protocol progress'
    }
    case 'schedule': {
      const p = a.trigger_params as { cron?: string }
      return p.cron ?? 'Scheduled'
    }
    case 'new_thread': return 'New thread'
    case 'order_state': {
      const p = a.trigger_params as { to_status?: string }
      return p.to_status ? `Order → ${p.to_status}` : 'Order state change'
    }
    default: return a.trigger_type
  }
}

function actionLabel(a: AutomationWithRuns): string {
  switch (a.action_type) {
    case 'send_dm': return 'Send DM'
    case 'operator_alert': return 'Notify operator'
    case 'score_adjust': {
      const p = a.action_params as { delta?: number }
      return p.delta != null ? `Adjust trust score (${p.delta > 0 ? '+' : ''}${p.delta})` : 'Adjust trust score'
    }
    case 'operator_task': return 'Add task'
    default: return a.action_type
  }
}

function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const ms = now - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function runsInWindow(runs: AutomationRun[], hours: number): number {
  const cutoff = Date.now() - hours * 60 * 60 * 1000
  return runs.filter(r => new Date(r.created_at).getTime() >= cutoff).length
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AutomationsView({ automations }: Props) {
  const [items, setItems] = useState<AutomationWithRuns[]>(automations)
  const [selectedId, setSelectedId] = useState<string>(automations[0]?.id ?? '')
  const [showModal, setShowModal] = useState<{ mode: 'create' } | { mode: 'edit'; automation: Automation } | null>(null)

  const sel = items.find(a => a.id === selectedId) ?? items[0]

  const onCount = items.filter(a => a.state === 'on').length
  const totalRuns24h = items.reduce((sum, a) => sum + runsInWindow(a.automation_runs, 24), 0)
  const pausedCount = items.filter(a => a.state === 'paused').length
  const offCount = items.filter(a => a.state === 'off').length

  async function handleToggle(id: string, currentState: AutoState) {
    const next: AutoState = currentState === 'on' ? 'off' : 'on'
    setItems(prev => prev.map(a => a.id === id ? { ...a, state: next } : a))
    await toggleAutomation(id, next)
  }

  async function handleApprove(runId: string) {
    setItems(prev => prev.map(a => ({
      ...a,
      automation_runs: a.automation_runs.filter(r => r.id !== runId),
    })))
    await approveAndSendQueuedRun(runId)
  }

  async function handleDismiss(runId: string) {
    setItems(prev => prev.map(a => ({
      ...a,
      automation_runs: a.automation_runs.filter(r => r.id !== runId),
    })))
    await dismissQueuedRun(runId)
  }

  const selRuns = sel?.automation_runs ?? []
  const recentRuns = selRuns.filter(r => r.state !== 'queued')
  const queuedRuns = selRuns.filter(r => r.state === 'queued')

  return (
    <div className="pt-au">
      <div className="pt-au-hd">
        <div>
          <h1>Automations</h1>
          <p>
            {onCount} active · {totalRuns24h} runs in last 24h
            {pausedCount > 0 && ` · ${pausedCount} paused`}
            {offCount > 0 && ` · ${offCount} off`}
          </p>
        </div>
        <div className="pt-au-hd-actions">
          <button className="pt-btn pt-btn-ghost"><Icons.search size={12} /> Browse templates</button>
          <button className="pt-btn pt-btn-primary" onClick={() => setShowModal({ mode: 'create' })}>
            <Icons.plus size={12} /> New automation
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="pt-empty-page">
          <EmptyState
            size="lg"
            icon={
              <svg width="130" height="88" viewBox="0 0 130 88" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                {/* WHEN box */}
                <rect x="4" y="28" width="32" height="22" rx="4" strokeWidth="1.1"/>
                <text x="20" y="38.5" textAnchor="middle" fontSize="5.5" fill="currentColor" stroke="none" opacity="0.5" fontFamily="inherit" letterSpacing="0.05em">WHEN</text>
                <text x="20" y="46" textAnchor="middle" fontSize="4.8" fill="currentColor" stroke="none" opacity="0.85" fontFamily="inherit">New thread</text>
                {/* Arrow 1 */}
                <line x1="36" y1="39" x2="46" y2="39" strokeWidth="0.9" opacity="0.5"/>
                <polyline points="44,36.5 46.5,39 44,41.5" strokeWidth="0.9" opacity="0.5" fill="none"/>
                {/* IF box */}
                <rect x="47" y="28" width="32" height="22" rx="4" strokeWidth="1.1"/>
                <text x="63" y="38.5" textAnchor="middle" fontSize="5.5" fill="currentColor" stroke="none" opacity="0.5" fontFamily="inherit" letterSpacing="0.05em">IF</text>
                <text x="63" y="46" textAnchor="middle" fontSize="4.8" fill="currentColor" stroke="none" opacity="0.85" fontFamily="inherit">Trust ≥ 50</text>
                {/* Arrow 2 */}
                <line x1="79" y1="39" x2="89" y2="39" strokeWidth="0.9" opacity="0.5"/>
                <polyline points="87,36.5 89.5,39 87,41.5" strokeWidth="0.9" opacity="0.5" fill="none"/>
                {/* THEN box */}
                <rect x="90" y="28" width="36" height="22" rx="4" strokeWidth="1.1"/>
                <text x="108" y="38.5" textAnchor="middle" fontSize="5.5" fill="currentColor" stroke="none" opacity="0.5" fontFamily="inherit" letterSpacing="0.05em">THEN</text>
                <text x="108" y="46" textAnchor="middle" fontSize="4.8" fill="currentColor" stroke="none" opacity="0.85" fontFamily="inherit">Send DM</text>
                {/* Second row — dimmed, offset */}
                <rect x="14" y="60" width="30" height="18" rx="3.5" strokeWidth="0.8" opacity="0.22"/>
                <line x1="44" y1="69" x2="52" y2="69" strokeWidth="0.8" opacity="0.18"/>
                <polyline points="50.5,67 52.5,69 50.5,71" strokeWidth="0.8" opacity="0.18" fill="none"/>
                <rect x="53" y="60" width="30" height="18" rx="3.5" strokeWidth="0.8" opacity="0.22"/>
                <line x1="83" y1="69" x2="91" y2="69" strokeWidth="0.8" opacity="0.18"/>
                <polyline points="89.5,67 91.5,69 89.5,71" strokeWidth="0.8" opacity="0.18" fill="none"/>
                <rect x="92" y="60" width="30" height="18" rx="3.5" strokeWidth="0.8" opacity="0.22"/>
                {/* Plus badge on first box — suggests creating */}
                <circle cx="4" cy="28" r="5.5" fill="currentColor" opacity="0.08" stroke="none"/>
                <circle cx="4" cy="28" r="5.5" strokeWidth="0.8" opacity="0.3"/>
                <line x1="4" y1="25.5" x2="4" y2="30.5" strokeWidth="1" opacity="0.5"/>
                <line x1="1.5" y1="28" x2="6.5" y2="28" strokeWidth="1" opacity="0.5"/>
              </svg>
            }
            title="No automations yet"
            body="Build your first WHEN → IF → THEN workflow. Automations can send DMs, adjust trust scores, alert you, and more — all hands-free."
            action={{ label: 'Create first automation', onClick: () => setShowModal({ mode: 'create' }) }}
          />
        </div>
      ) : (
      <div className="pt-au-body">
        <section className="pt-card pt-au-list-card">
          <div className="pt-card-body pt-au-list-body">
            <ul className="pt-au-list">
              {items.map(a => (
                <li
                  key={a.id}
                  className={`pt-au-row ${selectedId === a.id ? 'is-active' : ''} pt-au-state-${a.state}`}
                  onClick={() => setSelectedId(a.id)}
                >
                  <span className={`pt-au-dot pt-au-dot-${a.state}`} />
                  <div className="pt-au-row-mid">
                    <div className="pt-au-row-name">{a.name}</div>
                    <div className="pt-au-row-flow">
                      <span className="pt-au-trig">{triggerLabel(a)}</span>
                      <span className="pt-au-arrow">→</span>
                      <span className="pt-au-act">{actionLabel(a)}</span>
                    </div>
                  </div>
                  <div className="pt-au-row-meta">
                    <div className="pt-au-row-runs mono">{runsInWindow(a.automation_runs, 168)}<span> /7d</span></div>
                    <div className="pt-au-row-last">
                      {a.automation_runs[0] ? formatRelativeTime(a.automation_runs[0].created_at) : '—'}
                    </div>
                  </div>
                  <button
                    className={`pt-au-toggle pt-au-toggle-${a.state}`}
                    onClick={e => { e.stopPropagation(); handleToggle(a.id, a.state) }}
                  >
                    <span />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {sel && (
          <section className="pt-card pt-au-detail">
            <header className="pt-card-hd">
              <div><h3>{sel.name}</h3></div>
              <div className="pt-au-d-state">
                <span className={`pt-au-state-pill pt-au-state-pill-${sel.state}`}>
                  <span className={`pt-au-dot pt-au-dot-${sel.state}`} />
                  {sel.state === 'on' ? 'Active' : sel.state === 'paused' ? 'Paused' : 'Off'}
                </span>
              </div>
            </header>
            <div className="pt-card-body">
              <div className="pt-au-flow">
                <div className="pt-au-flow-step pt-au-flow-trigger">
                  <div className="pt-au-flow-tag">When</div>
                  <div className="pt-au-flow-label">{triggerLabel(sel)}</div>
                  <div className="pt-au-flow-detail">{sel.trigger_type}</div>
                </div>
                <div className="pt-au-flow-arrow">↓</div>
                {sel.conditions.length > 0 && (
                  <>
                    <div className="pt-au-flow-step pt-au-flow-conds">
                      <div className="pt-au-flow-tag">If</div>
                      <ul className="pt-au-conds">
                        {sel.conditions.map((c, i) => (
                          <li key={i} className="is-ok">
                            <Icons.check size={11} />
                            <span>{c.type}{'operator' in c ? ` ${c.operator}` : ''} {String(c.value)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="pt-au-flow-arrow">↓</div>
                  </>
                )}
                <div className="pt-au-flow-step pt-au-flow-action">
                  <div className="pt-au-flow-tag">Then</div>
                  <div className="pt-au-flow-label">{actionLabel(sel)}</div>
                  <div className="pt-au-flow-detail">{sel.action_type}</div>
                </div>
              </div>

              <div className="pt-au-runs">
                <div className="pt-au-runs-hd">
                  <h4>Recent runs</h4>
                  <span className="pt-au-runs-count">{recentRuns.length} {recentRuns.length === 1 ? 'run' : 'runs'}</span>
                </div>
                {recentRuns.length === 0 ? (
                  <div className="pt-au-runs-empty">Hasn&apos;t fired yet — turn it on to start collecting runs.</div>
                ) : (
                  <ul className="pt-au-runs-list">
                    {recentRuns.map(r => (
                      <li key={r.id} className={`pt-au-run pt-au-run-${r.state}`}>
                        <span className="pt-au-run-time mono">{formatRelativeTime(r.created_at)}</span>
                        <span className={`pt-au-run-bullet pt-au-run-bullet-${r.state}`} />
                        <span className="pt-au-run-who">{r.context_label ?? r.context_ref ?? '—'}</span>
                        <span className="pt-au-run-action">
                          {r.state === 'scheduled'
                            ? (r.context_label ?? 'Scheduled')
                            : (r.action_summary ?? r.state)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {queuedRuns.length > 0 && (
                  <div className="pt-au-queued">
                    <div className="pt-au-runs-hd">
                      <h4>Pending review</h4>
                      <span className="pt-au-runs-count">{queuedRuns.length}</span>
                    </div>
                    <ul className="pt-au-runs-list">
                      {queuedRuns.map(r => (
                        <li key={r.id} className="pt-au-run pt-au-run-queued">
                          <span className="pt-au-run-time mono">{formatRelativeTime(r.created_at)}</span>
                          <span className="pt-au-run-bullet pt-au-run-bullet-queued" />
                          <span className="pt-au-run-who">{r.context_label ?? r.context_ref ?? '—'}</span>
                          <span className="pt-au-run-action">
                            {(r.action_payload?.message as string | undefined) ?? r.action_summary ?? 'Queued'}
                          </span>
                          <div className="pt-au-queued-actions">
                            <button
                              className="pt-btn pt-btn-primary pt-btn-xs"
                              onClick={() => handleApprove(r.id)}
                            >
                              Approve &amp; Send
                            </button>
                            <button
                              className="pt-btn pt-btn-ghost pt-btn-xs"
                              onClick={() => handleDismiss(r.id)}
                            >
                              Dismiss
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="pt-au-foot">
                <div className="pt-au-foot-stats">
                  <div><span className="mono">{runsInWindow(sel.automation_runs, 168)}</span> runs · 7d</div>
                  <div><span className="mono">{runsInWindow(sel.automation_runs, 24)}</span> runs · 24h</div>
                  <div>last <span>{sel.automation_runs[0] ? formatRelativeTime(sel.automation_runs[0].created_at) : '—'}</span></div>
                </div>
                <div className="pt-au-foot-actions">
                  <button
                    className="pt-btn pt-btn-ghost"
                    onClick={() => setShowModal({ mode: 'edit', automation: sel })}
                  >
                    Edit flow
                  </button>
                  <button className="pt-btn pt-btn-ghost">View all runs</button>
                </div>
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
    </div>
  )
}
