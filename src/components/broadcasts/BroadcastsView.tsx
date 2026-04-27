'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'

const AUDIENCES = [
  { id: 'all', label: 'All customers', count: 142 },
  { id: 'vip', label: 'VIP (LTV ≥ $2k)', count: 18 },
  { id: 'repeat', label: 'Repeat buyers', count: 64 },
  { id: 'lapsed', label: 'Lapsed (30d+ silent)', count: 23 },
  { id: 'waitlist', label: 'Tirz waitlist', count: 11 },
  { id: 'new', label: 'New (first-time)', count: 9 },
]

const TEMPLATES = [
  { id: 'restock', label: 'Restock alert', hint: 'Tirz/reta back in' },
  { id: 'promo', label: 'Repeat-buyer promo', hint: '10% off, 48h' },
  { id: 'shipping', label: 'Holiday shipping', hint: 'Cutoff dates' },
  { id: 'blank', label: 'Blank', hint: 'Start from scratch' },
]

const TEMPLATE_BODY: Record<string, string> = {
  restock: 'yo — tirz 30mg back in stock, fresh batch L24-141 (janoshik COA on req). reta also restocked. usual addresses, usdt/btc/xmr. lmk if u want me to set anything aside',
  promo:   'thanks for the loyalty 🙏 — 10% off ur next order if u pull the trigger in the next 48h. just reply REPEAT and i\'ll quote you',
  shipping:'heads up: usps cutoff for guaranteed delivery this round is friday 5pm. anything after that ships monday. plan accordingly fam',
  blank:   '',
}

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }
const CH_NAMES: Record<string, string> = { wa: 'WhatsApp', tg: 'Telegram', em: 'Email' }

function PreviewBubble({ channel, name, body, merge }: { channel: string; name: string; body: string; merge: Record<string, string> }) {
  const ChIcon = CH_ICONS[channel]
  const merged = body.replace(/\{\{first_name\}\}/g, merge.first_name).replace(/\{\{last_order\}\}/g, merge.last_order)
  return (
    <div className={`pt-bc-prev pt-ix-${channel}`}>
      <div className="pt-bc-prev-hd">
        {ChIcon && <ChIcon size={11} />}
        <span className="pt-bc-prev-ch">{CH_NAMES[channel]}</span>
        <span className="pt-bc-prev-to">→ {name}</span>
      </div>
      <div className="pt-bubble pt-bubble-me">
        <div className="pt-bubble-text">{merged || '—'}</div>
        <div className="pt-bubble-meta">just now · sending…</div>
      </div>
    </div>
  )
}

export function BroadcastsView() {
  const [audienceId, setAudience] = useState('repeat')
  const [excludes, setExcludes] = useState({ recent24h: true, lapsed90d: false, lowtrust: true })
  const [channels, setChannels] = useState({ wa: true, tg: true, em: false })
  const [tplId, setTplId] = useState('restock')
  const [body, setBody] = useState(TEMPLATE_BODY.restock)
  const [scheduleMode, setScheduleMode] = useState('now')
  const [stagger, setStagger] = useState(true)
  const [sent, setSent] = useState(false)

  const aud = AUDIENCES.find(a => a.id === audienceId) ?? AUDIENCES[0]
  const exclMinus = (excludes.recent24h ? 8 : 0) + (excludes.lapsed90d ? 6 : 0) + (excludes.lowtrust ? 4 : 0)
  const finalCount = Math.max(0, aud.count - exclMinus)
  const chCount = (channels.wa ? 1 : 0) + (channels.tg ? 1 : 0) + (channels.em ? 1 : 0)

  if (sent) {
    return (
      <div className="pt-bc">
        <div className="pt-bc-sent">
          <div className="pt-bc-sent-mark"><Icons.check size={28} /></div>
          <h2>Broadcast queued</h2>
          <p>{finalCount} recipients across {chCount} channels. {stagger ? `Stagger: 1 msg / 8s.` : 'Burst send.'}</p>
          <div className="pt-bc-sent-stats">
            <div><div className="lbl">Est. delivery</div><div className="val">~{Math.ceil(finalCount * 8 / 60)}m</div></div>
            <div><div className="lbl">Cost</div><div className="val">$0.00 <span>(self-hosted)</span></div></div>
            <div><div className="lbl">Spam risk</div><div className="val">low</div></div>
          </div>
          <Link href="/" className="pt-btn pt-btn-primary">← Back to dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-bc">
      <div className="pt-bc-hd">
        <Link href="/" className="pt-ix-back" title="Back to dashboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </Link>
        <div className="pt-bc-hd-title"><h1>Broadcast</h1><p>Compose once, deliver across channels.</p></div>
        <div className="pt-bc-hd-actions">
          <button className="pt-btn pt-btn-ghost">Save draft</button>
          <button className="pt-btn pt-btn-ghost">Dry run</button>
        </div>
      </div>

      <div className="pt-bc-body">
        <div className="pt-bc-compose">
          {/* Step 1: Audience */}
          <section className="pt-bc-step">
            <header className="pt-bc-step-hd">
              <span className="pt-bc-step-n">01</span>
              <div><h3>Audience</h3><p>{finalCount} recipients after filters</p></div>
            </header>
            <div className="pt-bc-aud-grid">
              {AUDIENCES.map(a => (
                <button key={a.id} className={`pt-bc-aud ${audienceId === a.id ? 'is-on' : ''}`} onClick={() => setAudience(a.id)}>
                  <span className="pt-bc-aud-lbl">{a.label}</span>
                  <span className="pt-bc-aud-cnt mono">{a.count}</span>
                </button>
              ))}
            </div>
            <div className="pt-bc-excl">
              <div className="pt-bc-excl-hd">Exclude</div>
              {[
                { key: 'recent24h' as const, label: 'Replied in last 24h', cnt: '−8' },
                { key: 'lapsed90d' as const, label: 'No order in 90d+', cnt: '−6' },
                { key: 'lowtrust' as const, label: 'Trust score < 60', cnt: '−4' },
              ].map(ex => (
                <label key={ex.key} className="pt-bc-excl-row">
                  <input type="checkbox" checked={excludes[ex.key]} onChange={e => setExcludes({ ...excludes, [ex.key]: e.target.checked })} />
                  <span>{ex.label}</span>
                  <span className="pt-bc-excl-cnt mono">{ex.cnt}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Step 2: Channels */}
          <section className="pt-bc-step">
            <header className="pt-bc-step-hd">
              <span className="pt-bc-step-n">02</span>
              <div><h3>Channels</h3><p>Will route per-customer to their preferred channel</p></div>
            </header>
            <div className="pt-bc-chans">
              {[
                { id: 'wa' as const, name: 'WhatsApp', note: '62 reachable' },
                { id: 'tg' as const, name: 'Telegram', note: '78 reachable' },
                { id: 'em' as const, name: 'Email', note: '31 reachable' },
              ].map(c => {
                const ChIcon = CH_ICONS[c.id]
                return (
                  <button key={c.id} className={`pt-bc-chan ${channels[c.id] ? 'is-on' : ''} pt-chip-${c.id}`}
                    onClick={() => setChannels({ ...channels, [c.id]: !channels[c.id] })}>
                    {ChIcon && <ChIcon size={16} />}
                    <div><div className="pt-bc-chan-name">{c.name}</div><div className="pt-bc-chan-note">{c.note}</div></div>
                    <i className={`pt-bc-chan-tick ${channels[c.id] ? 'is-on' : ''}`}>{channels[c.id] && <Icons.check size={11} />}</i>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Step 3: Message */}
          <section className="pt-bc-step">
            <header className="pt-bc-step-hd">
              <span className="pt-bc-step-n">03</span>
              <div><h3>Message</h3><p>Use {'{{first_name}}'}, {'{{last_order}}'} for merge fields</p></div>
            </header>
            <div className="pt-bc-tpls">
              {TEMPLATES.map(t => (
                <button key={t.id} className={`pt-bc-tpl ${tplId === t.id ? 'is-on' : ''}`} onClick={() => { setTplId(t.id); setBody(TEMPLATE_BODY[t.id]) }}>
                  <div className="pt-bc-tpl-lbl">{t.label}</div>
                  <div className="pt-bc-tpl-hint">{t.hint}</div>
                </button>
              ))}
            </div>
            <div className="pt-composer-field">
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="Write your broadcast…" />
              <div className="pt-composer-tools">
                <div className="pt-composer-l">
                  <button className="pt-tag pt-tag-soft">{'{{first_name}}'}</button>
                  <button className="pt-tag pt-tag-soft">{'{{last_order}}'}</button>
                </div>
                <div className="pt-composer-r"><span className="pt-composer-hint mono">{body.length} chars</span></div>
              </div>
            </div>
          </section>

          {/* Step 4: Schedule */}
          <section className="pt-bc-step">
            <header className="pt-bc-step-hd">
              <span className="pt-bc-step-n">04</span>
              <div><h3>Schedule</h3><p>Stagger reduces spam-flagging risk</p></div>
            </header>
            <div className="pt-bc-sched">
              <div className="pt-pillbar pt-bc-sched-pills">
                {[{ id: 'now', label: 'Send now' }, { id: 'evening', label: 'Tonight 8pm' }, { id: 'tomorrow', label: 'Tomorrow 10am' }, { id: 'custom', label: 'Custom…' }].map(s => (
                  <button key={s.id} className={`pt-pill ${scheduleMode === s.id ? 'is-on' : ''}`} onClick={() => setScheduleMode(s.id)}>{s.label}</button>
                ))}
              </div>
              <label className="pt-bc-stagger">
                <input type="checkbox" checked={stagger} onChange={e => setStagger(e.target.checked)} />
                <div>
                  <div className="pt-bc-stagger-lbl">Stagger sends</div>
                  <div className="pt-bc-stagger-hint">1 message / 8 seconds · ~{Math.ceil(finalCount * 8 / 60)}m total</div>
                </div>
              </label>
            </div>
          </section>
        </div>

        {/* Preview */}
        <aside className="pt-bc-preview">
          <div className="pt-bc-preview-hd">
            <span>Live preview</span>
            <span className="pt-bc-preview-meta mono">{finalCount} × {chCount}ch</span>
          </div>
          {channels.wa && <PreviewBubble channel="wa" name="K. (gymrat_84)" body={body} merge={{ first_name: 'K.', last_order: '11d' }} />}
          {channels.tg && <PreviewBubble channel="tg" name="marcus_r" body={body} merge={{ first_name: 'marcus', last_order: '3d' }} />}
          {channels.em && <PreviewBubble channel="em" name="Dani V." body={body} merge={{ first_name: 'Dani', last_order: '—' }} />}
          {!channels.wa && !channels.tg && !channels.em && <div className="pt-bc-preview-empty">Pick a channel to preview</div>}

          <div className="pt-bc-summary">
            <div className="pt-bc-summary-row"><span className="lbl">Recipients</span><span className="val mono">{finalCount}</span></div>
            <div className="pt-bc-summary-row"><span className="lbl">Channels</span><span className="val">{[channels.wa && 'WA', channels.tg && 'TG', channels.em && 'EM'].filter(Boolean).join(' + ') || '—'}</span></div>
            <div className="pt-bc-summary-row"><span className="lbl">Delivery</span><span className="val">{scheduleMode === 'now' ? (stagger ? `~${Math.ceil(finalCount * 8 / 60)}m` : 'burst') : scheduleMode}</span></div>
            <div className="pt-bc-summary-row"><span className="lbl">Risk</span><span className="val pt-bc-risk-low"><i className="pt-dot pt-dot-ok" /> low</span></div>
            <button className="pt-btn pt-btn-primary pt-bc-send" onClick={() => setSent(true)} disabled={!body.trim() || finalCount === 0 || chCount === 0}>
              <Icons.send size={12} /> {scheduleMode === 'now' ? `Send to ${finalCount}` : `Schedule ${finalCount}`}
            </button>
            <div className="pt-bc-warn">For research-use comms only. No medical claims.</div>
          </div>
        </aside>
      </div>
    </div>
  )
}
