'use client'

import { useState } from 'react'
import { Icons } from '@/lib/icons'

type AutoState = 'on' | 'off' | 'paused'
type RunState = 'ok' | 'skip' | 'warn' | 'err' | 'queued'

type Automation = {
  id: string; name: string; icon: string; state: AutoState
  triggerLabel: string; actionLabel: string
  runs7d: number; runs24h: number; lastRun: string; description: string
  flow: {
    trigger: { kind: string; label: string; detail: string }
    conditions: { label: string; ok: boolean; note?: string }[]
    action: { kind: string; label: string; detail: string }
  }
  recent: { at: string; custId: string | null; who: string; action: string; state: RunState }[]
}

const AUTOMATIONS_DATA: Automation[] = [
  { id: 'a1', name: 'Reorder nudge — cycle ending', icon: 'send', state: 'on', triggerLabel: 'Cycle ends in 5d', actionLabel: 'DM customer', runs7d: 12, runs24h: 3, lastRun: '2h ago', description: 'Reaches out to a customer when their estimated cycle has ~5 days left, with a one-tap reorder link.', flow: { trigger: { kind: 'cycle_window', label: 'Cycle ends in 5 days', detail: 'Calculated from last order × dose schedule' }, conditions: [{ label: 'LTV ≥ $250', ok: true }, { label: 'Trust score ≥ 65', ok: true }, { label: "Hasn't messaged in 48h", ok: true }], action: { kind: 'send_dm', label: 'Send draft DM', detail: 'Template: "reorder-nudge-v3" · review queue' } }, recent: [{ at: '11:42', custId: 't04', who: 'swolepriest', action: 'Drafted DM · awaiting review', state: 'queued' }, { at: '09:15', custId: 't12', who: 'T.B.', action: 'Sent · BPC-157 reorder', state: 'ok' }, { at: '07:50', custId: 't07', who: 'M.R.', action: 'Sent · Tirz reorder', state: 'ok' }] },
  { id: 'a2', name: 'Auto-mark paid on confirmations', icon: 'check', state: 'on', triggerLabel: 'Crypto tx confirmed', actionLabel: 'Move order → Packing', runs7d: 47, runs24h: 8, lastRun: '12m ago', description: 'When an incoming tx hits the required confirmation count, mark the matched order as paid and advance it on the kanban.', flow: { trigger: { kind: 'tx_confirm', label: 'Incoming tx ≥ N confirmations', detail: 'USDT: 12 · BTC: 3 · XMR: 10' }, conditions: [{ label: 'Tx amount matches order ±2%', ok: true }, { label: 'Memo or amount tag resolves to order', ok: true }], action: { kind: 'advance', label: 'Mark paid + advance', detail: 'Order moves Paid → Packing column' } }, recent: [{ at: '12:48', custId: 't05', who: 'ladyswole', action: 'A-2240 · USDT 220.00 → Packing', state: 'ok' }, { at: '10:11', custId: 't07', who: 'M.R.', action: 'A-2238 · USDT 165.00 → Packing', state: 'ok' }, { at: 'Yesterday 21:14', custId: 't12', who: 'T.B.', action: 'A-2237 · USDT 720.00 → Packing', state: 'ok' }, { at: 'Yesterday 18:50', custId: null, who: '—', action: 'Skipped · amount mismatch ($330 vs $325)', state: 'skip' }] },
  { id: 'a3', name: 'Restock alert — low inventory', icon: 'alert', state: 'on', triggerLabel: 'Stock < threshold', actionLabel: 'Notify operator', runs7d: 4, runs24h: 2, lastRun: '38m ago', description: 'Pings you when any SKU drops below its restock threshold, with a re-up estimate based on 7-day velocity.', flow: { trigger: { kind: 'stock_low', label: 'Stock < threshold', detail: 'Per-SKU thresholds set in Catalog' }, conditions: [{ label: 'Not already alerted in last 24h', ok: true }], action: { kind: 'operator_alert', label: 'Push alert', detail: 'Sidebar badge + dashboard card' } }, recent: [{ at: '13:02', custId: null, who: 'TIRZ-30', action: '1 vial left · 14d velocity = 12 vials', state: 'warn' }, { at: '08:11', custId: null, who: 'MOTS-c', action: 'Out of stock · 8 backorders waiting', state: 'err' }] },
  { id: 'a4', name: 'First-contact welcome', icon: 'wave', state: 'on', triggerLabel: 'New thread', actionLabel: 'Send menu + payment terms', runs7d: 6, runs24h: 1, lastRun: '5h ago', description: 'When a new thread opens, sends a vetted intro: current menu, accepted assets, lead time, and a one-line OPSEC primer.', flow: { trigger: { kind: 'new_thread', label: 'New inbound thread', detail: 'Across Signal, Telegram, Session' }, conditions: [{ label: 'Sender not already a known customer', ok: true }, { label: 'First message ≥ 3 words (not bot)', ok: true }], action: { kind: 'send_dm', label: 'Send draft welcome', detail: 'Template: "welcome-v2" · queued for review' } }, recent: [{ at: '08:22', custId: null, who: '+44 7… new', action: 'Drafted welcome · awaiting review', state: 'queued' }] },
  { id: 'a5', name: 'Trust score recompute', icon: 'shield', state: 'on', triggerLabel: 'Order delivered', actionLabel: 'Adjust trust score', runs7d: 9, runs24h: 2, lastRun: '1h ago', description: 'Bumps trust score after a successful delivery; deducts on disputes, chargebacks, or payment failures.', flow: { trigger: { kind: 'order_state', label: 'Order delivered or disputed', detail: 'From orders kanban final column' }, conditions: [{ label: 'Delivery confirmation logged', ok: true }], action: { kind: 'score_adjust', label: 'Recompute score', detail: '+3 on success · −15 on dispute' } }, recent: [{ at: '10:40', custId: 't12', who: 'T.B.', action: '+3 → 92 (delivered A-2237)', state: 'ok' }] },
  { id: 'a6', name: 'Hot wallet rotation', icon: 'rotate', state: 'paused', triggerLabel: 'Address rx > 10', actionLabel: 'Generate new address', runs7d: 2, runs24h: 0, lastRun: 'Apr 18', description: 'Rotates a receiving address after it\'s been used for 10+ incoming txs, to keep the surface area minimal.', flow: { trigger: { kind: 'addr_rx', label: 'Receiving address used 10+ times', detail: 'Per-asset counter, resets on rotation' }, conditions: [{ label: 'No pending tx on the address', ok: false, note: 'TQrZ8jH2…mK4n9pX has 1 unconfirmed' }], action: { kind: 'rotate_addr', label: 'Generate + swap address', detail: 'Old address kept for sweeping' } }, recent: [{ at: 'Apr 18 11:30', custId: null, who: 'USDT/TRC20', action: 'Rotated · new TXq…f8K3', state: 'ok' }] },
  { id: 'a7', name: 'Daily digest', icon: 'sun', state: 'on', triggerLabel: '08:00 daily', actionLabel: 'DM operator summary', runs7d: 7, runs24h: 1, lastRun: 'Today 08:00', description: 'Morning summary: overnight inbox, tx confirmations, restock alerts, expected packing for today.', flow: { trigger: { kind: 'schedule', label: '08:00 every day', detail: 'Operator local time' }, conditions: [], action: { kind: 'send_dm', label: 'Send digest', detail: "To operator's Signal" } }, recent: [{ at: '08:00', custId: null, who: 'Today', action: 'Sent · 6 unread · 4 confirmations · 2 restock', state: 'ok' }] },
  { id: 'a8', name: 'Reagent test reminder', icon: 'flask', state: 'off', triggerLabel: 'Lot in stock 30d', actionLabel: 'Operator task', runs7d: 0, runs24h: 0, lastRun: '—', description: 'Reminds you to reagent-test any lot that\'s been on the shelf for 30+ days, before it ships.', flow: { trigger: { kind: 'shelf_age', label: 'Lot age ≥ 30 days', detail: 'From Catalog batches table' }, conditions: [], action: { kind: 'operator_task', label: 'Add task', detail: 'Goes into operator todo, not customer-facing' } }, recent: [] },
]

const ICON_MAP: Record<string, React.FC<{ size?: number }>> = {
  send: Icons.send, check: Icons.check, alert: Icons.alert, wave: Icons.wave,
  shield: Icons.shield, rotate: Icons.rotate, sun: Icons.sun, flask: Icons.flask,
}

export function AutomationsView() {
  const [selectedId, setSelectedId] = useState('a1')
  const [autos, setAutos] = useState(AUTOMATIONS_DATA)

  const toggleState = (id: string) => {
    setAutos(arr => arr.map(a => a.id === id ? { ...a, state: (a.state === 'on' ? 'off' : 'on') as AutoState } : a))
  }

  const sel = autos.find(a => a.id === selectedId)!
  const onCount = autos.filter(a => a.state === 'on').length
  const totalRuns = autos.reduce((s, a) => s + a.runs24h, 0)

  return (
    <div className="pt-au">
      <div className="pt-au-hd">
        <div>
          <h1>Automations</h1>
          <p>{onCount} active · {totalRuns} runs in last 24h · 1 paused, 1 off</p>
        </div>
        <div className="pt-au-hd-actions">
          <button className="pt-btn pt-btn-ghost"><Icons.search size={12} /> Browse templates</button>
          <button className="pt-btn pt-btn-primary"><Icons.plus size={12} /> New automation</button>
        </div>
      </div>

      <div className="pt-au-body">
        <section className="pt-card pt-au-list-card">
          <div className="pt-card-body pt-au-list-body">
            <ul className="pt-au-list">
              {autos.map(a => (
                <li key={a.id} className={`pt-au-row ${selectedId === a.id ? 'is-active' : ''} pt-au-state-${a.state}`} onClick={() => setSelectedId(a.id)}>
                  <span className={`pt-au-dot pt-au-dot-${a.state}`} />
                  <div className="pt-au-row-mid">
                    <div className="pt-au-row-name">{a.name}</div>
                    <div className="pt-au-row-flow">
                      <span className="pt-au-trig">{a.triggerLabel}</span>
                      <span className="pt-au-arrow">→</span>
                      <span className="pt-au-act">{a.actionLabel}</span>
                    </div>
                  </div>
                  <div className="pt-au-row-meta">
                    <div className="pt-au-row-runs mono">{a.runs7d}<span> /7d</span></div>
                    <div className="pt-au-row-last">{a.lastRun}</div>
                  </div>
                  <button className={`pt-au-toggle pt-au-toggle-${a.state}`} onClick={e => { e.stopPropagation(); toggleState(a.id) }}><span /></button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="pt-card pt-au-detail">
          <header className="pt-card-hd">
            <div><h3>{sel.name}</h3><p>{sel.description}</p></div>
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
                <div className="pt-au-flow-label">{sel.flow.trigger.label}</div>
                <div className="pt-au-flow-detail">{sel.flow.trigger.detail}</div>
              </div>
              <div className="pt-au-flow-arrow">↓</div>
              {sel.flow.conditions.length > 0 && (
                <>
                  <div className="pt-au-flow-step pt-au-flow-conds">
                    <div className="pt-au-flow-tag">If</div>
                    <ul className="pt-au-conds">
                      {sel.flow.conditions.map((c, i) => (
                        <li key={i} className={c.ok ? 'is-ok' : 'is-blocked'}>
                          {c.ok ? <Icons.check size={11} /> : <span className="pt-au-x">×</span>}
                          <span>{c.label}</span>
                          {c.note && <span className="pt-au-cond-note">— {c.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="pt-au-flow-arrow">↓</div>
                </>
              )}
              <div className="pt-au-flow-step pt-au-flow-action">
                <div className="pt-au-flow-tag">Then</div>
                <div className="pt-au-flow-label">{sel.flow.action.label}</div>
                <div className="pt-au-flow-detail">{sel.flow.action.detail}</div>
              </div>
            </div>

            <div className="pt-au-runs">
              <div className="pt-au-runs-hd">
                <h4>Recent runs</h4>
                <span className="pt-au-runs-count">{sel.recent.length} {sel.recent.length === 1 ? 'run' : 'runs'}</span>
              </div>
              {sel.recent.length === 0 ? (
                <div className="pt-au-runs-empty">Hasn't fired yet — turn it on to start collecting runs.</div>
              ) : (
                <ul className="pt-au-runs-list">
                  {sel.recent.map((r, i) => (
                    <li key={i} className={`pt-au-run pt-au-run-${r.state}`}>
                      <span className="pt-au-run-time mono">{r.at}</span>
                      <span className={`pt-au-run-bullet pt-au-run-bullet-${r.state}`} />
                      <span className="pt-au-run-who">{r.who}</span>
                      <span className="pt-au-run-action">{r.action}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="pt-au-foot">
              <div className="pt-au-foot-stats">
                <div><span className="mono">{sel.runs7d}</span> runs · 7d</div>
                <div><span className="mono">{sel.runs24h}</span> runs · 24h</div>
                <div>last <span>{sel.lastRun}</span></div>
              </div>
              <div className="pt-au-foot-actions">
                <button className="pt-btn pt-btn-ghost">Edit flow</button>
                <button className="pt-btn pt-btn-ghost">View all runs</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
