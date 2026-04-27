// customer.jsx — Customer detail view

const PT_CUSTOMERS = {
  t01: {
    id: "t01", name: "K. (gymrat_84)", handle: "+1 ••• 4421", channel: "wa",
    trust: 92, ltv: 2840, orders: 14, joined: "Aug '23",
    addr: "K. — REDACTED, IL 60••• ", payMethods: ["USDT (TRC20)", "BTC", "Cash"],
    tags: ["repeat", "vip", "gymbro"],
    trustFactors: [
      { label: "On-time payments", v: 14, of: 14, w: 30 },
      { label: "Repeat ordering", v: 11, of: 12, w: 24 },
      { label: "Address consistency", v: 1, of: 1, w: 16 },
      { label: "Acct age (20mo)",  v: 20, of: 24, w: 12 },
      { label: "Disputes/refunds",  v: 0, of: 0, w: 10, neg: true },
    ],
    orderHistory: [
      { id: "A-2241", date: "Apr 18", items: "Reta 10mg ×2",         amt: 330, pay: "USDT", state: "confirming" },
      { id: "A-2188", date: "Mar 30", items: "BPC-157 5mg ×3",       amt: 114, pay: "USDT", state: "delivered" },
      { id: "A-2103", date: "Mar 11", items: "Tirz 30mg ×1",         amt: 220, pay: "BTC",  state: "delivered" },
      { id: "A-2044", date: "Feb 22", items: "Reta 10mg ×1, GHK ×2", amt: 275, pay: "USDT", state: "delivered" },
      { id: "A-1998", date: "Feb 03", items: "BPC-157 5mg ×4",       amt: 152, pay: "Cash", state: "delivered" },
      { id: "A-1921", date: "Jan 14", items: "Tirz 30mg ×1",         amt: 220, pay: "USDT", state: "delivered" },
    ],
    cycles: [
      { product: "BPC-157",  start: "Apr 1",  end: "May 27", weeks: 8,  progress: 0.55 },
      { product: "Reta",     start: "Apr 18", end: "Aug 8",  weeks: 16, progress: 0.18 },
      { product: "Tirz",     start: "Mar 11", end: "Jun 3",  weeks: 12, progress: 0.55 },
    ],
    notes: [
      { at: "Apr 18", text: "Wants reta on monthly autopilot. Asked about COA — sent janoshik link." },
      { at: "Mar 11", text: "Switched from BTC to USDT — faster confirms. Prefers TRC20." },
      { at: "Aug 12 '23", text: "Referred by T.B. — solid. Lifts at Equinox W. Loop." },
    ],
  },
  t04: {
    id: "t04", name: "swolepriest", handle: "@swolepriest", channel: "tg",
    trust: 88, ltv: 3200, orders: 11, joined: "Oct '23",
    addr: "—", payMethods: ["BTC", "XMR"],
    tags: ["waitlist", "repeat"],
    trustFactors: [
      { label: "On-time payments", v: 11, of: 11, w: 30 },
      { label: "Repeat ordering", v: 9, of: 11, w: 24 },
      { label: "Address consistency", v: 1, of: 1, w: 16 },
      { label: "Acct age (18mo)",  v: 18, of: 24, w: 12 },
      { label: "Dispute (1)",       v: 1, of: 0, w: 8, neg: true },
    ],
    orderHistory: [
      { id: "A-2210", date: "Apr 7",  items: "Tirz 30mg ×2",   amt: 440, pay: "BTC",  state: "delivered" },
      { id: "A-2150", date: "Mar 19", items: "Reta 10mg ×1",   amt: 165, pay: "XMR",  state: "delivered" },
      { id: "A-2090", date: "Mar 02", items: "Tirz 30mg ×1",   amt: 220, pay: "BTC",  state: "delivered" },
    ],
    cycles: [{ product: "Tirz", start: "Apr 7", end: "Jun 30", weeks: 12, progress: 0.42 }],
    notes: [{ at: "Apr 22", text: "On tirz waitlist. Will pay premium for fresh batch." }],
  },
};

function PtCustomerView({ customerId, onBack, onMessage }) {
  const c = PT_CUSTOMERS[customerId] || PT_CUSTOMERS.t01;
  const Ch = window.I[c.channel];
  const channelName = ({ wa: "WhatsApp", tg: "Telegram", em: "Email" })[c.channel];
  const trustCls = c.trust >= 85 ? "hi" : c.trust >= 65 ? "md" : "lo";

  return (
    <div className="pt-cu" data-screen-label={`Customer · ${c.name}`}>
      <div className="pt-cu-hd">
        <button className="pt-ix-back" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
        </button>
        <div className="pt-cu-hd-id">
          <div className="pt-cu-hd-av" data-channel={c.channel}>
            {(c.name.match(/[A-Z]/g) || [c.name[0]]).slice(0,2).join("")}
          </div>
          <div>
            <div className="pt-cu-hd-name">
              {c.name}
              {c.tags.includes("vip") && <span className="pt-tag pt-tag-vip">VIP</span>}
              {c.tags.includes("waitlist") && <span className="pt-tag">waitlist</span>}
            </div>
            <div className="pt-cu-hd-handle mono">{c.handle} · {channelName} · joined {c.joined}</div>
          </div>
        </div>
        <div className="pt-cu-hd-actions">
          <button className="pt-btn pt-btn-ghost">Add note</button>
          <button className="pt-btn pt-btn-ghost">Add tag</button>
          <button className="pt-btn pt-btn-primary" onClick={() => onMessage(c.id)}>
            <Ch size={12}/> Message
          </button>
        </div>
      </div>

      <div className="pt-cu-body">
        {/* ─── Summary strip ─── */}
        <div className="pt-cu-strip">
          <div className="pt-cu-stat">
            <div className="lbl">LTV</div>
            <div className="val mono">${c.ltv.toLocaleString()}</div>
          </div>
          <div className="pt-cu-stat">
            <div className="lbl">Orders</div>
            <div className="val mono">{c.orders}</div>
          </div>
          <div className="pt-cu-stat">
            <div className="lbl">Avg order</div>
            <div className="val mono">${Math.round(c.ltv / c.orders)}</div>
          </div>
          <div className="pt-cu-stat">
            <div className="lbl">Last order</div>
            <div className="val">{c.orderHistory[0].date}</div>
          </div>
          <div className="pt-cu-stat">
            <div className="lbl">Channel</div>
            <div className="val pt-cu-stat-ch"><Ch size={11}/> {channelName}</div>
          </div>
          <div className={`pt-cu-stat pt-cu-trust pt-trust-${trustCls}`}>
            <div className="lbl">Trust</div>
            <div className="val mono">{c.trust}<span>/100</span></div>
          </div>
        </div>

        <div className="pt-cu-grid">
          {/* ─── LEFT col ─── */}
          <div className="pt-cu-col">
            <section className="pt-card">
              <header className="pt-card-hd">
                <div><h3>Order history</h3><p>{c.orders} total · ${c.ltv.toLocaleString()} LTV</p></div>
                <button className="pt-link">Export CSV →</button>
              </header>
              <div className="pt-card-body">
                <table className="pt-cu-orders">
                  <thead>
                    <tr><th>Order</th><th>Date</th><th>Items</th><th>Pay</th><th className="r">Amount</th><th>State</th></tr>
                  </thead>
                  <tbody>
                    {c.orderHistory.map((o) => (
                      <tr key={o.id}>
                        <td className="mono">#{o.id}</td>
                        <td>{o.date}</td>
                        <td className="pt-cu-items">{o.items}</td>
                        <td><span className="pt-pay-asset" data-asset={o.pay}>{o.pay}</span></td>
                        <td className="r mono">${o.amt}</td>
                        <td><PtOrderState state={o.state}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="pt-card">
              <header className="pt-card-hd">
                <div><h3>Active cycles</h3><p>Inferred from order cadence + product half-life</p></div>
              </header>
              <div className="pt-card-body">
                <ul className="pt-cu-cycles">
                  {c.cycles.map((cy, i) => (
                    <li key={i} className="pt-cu-cycle">
                      <div className="pt-cu-cycle-prod">{cy.product}</div>
                      <div className="pt-cu-cycle-bar">
                        <div className="pt-cu-cycle-fill" style={{ width: `${cy.progress*100}%` }}/>
                        <span className="pt-cu-cycle-marker" style={{ left: `${cy.progress*100}%` }}/>
                      </div>
                      <div className="pt-cu-cycle-meta mono">
                        wk {Math.round(cy.progress*cy.weeks)}/{cy.weeks} · {cy.start}→{cy.end}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="pt-card">
              <header className="pt-card-hd">
                <div><h3>Notes</h3><p>Internal — never sent to customer</p></div>
                <button className="pt-link">+ Add note</button>
              </header>
              <div className="pt-card-body">
                <ul className="pt-cu-notes">
                  {c.notes.map((n, i) => (
                    <li key={i}>
                      <div className="pt-cu-note-at mono">{n.at}</div>
                      <div className="pt-cu-note-text">{n.text}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          {/* ─── RIGHT col ─── */}
          <div className="pt-cu-col">
            <section className="pt-card">
              <header className="pt-card-hd">
                <div><h3>Trust score</h3><p>Weighted factors</p></div>
                <div className={`pt-trust pt-trust-${trustCls}`}>
                  <div className="pt-trust-num">{c.trust}</div>
                  <div className="pt-trust-lbl">trust</div>
                </div>
              </header>
              <div className="pt-card-body">
                <ul className="pt-cu-factors">
                  {c.trustFactors.map((f, i) => {
                    const pct = Math.min(1, f.v / Math.max(1, f.of || f.v));
                    return (
                      <li key={i}>
                        <div className="pt-cu-factor-row1">
                          <span className="pt-cu-factor-lbl">{f.label}</span>
                          <span className="pt-cu-factor-v mono">{f.v}{f.of ? `/${f.of}` : ""}</span>
                          <span className="pt-cu-factor-w mono">×{f.w}</span>
                        </div>
                        <div className="pt-cu-factor-bar">
                          <div className={`pt-cu-factor-fill ${f.neg && f.v > 0 ? "is-neg" : ""}`}
                               style={{ width: `${pct*100}%` }}/>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            <section className="pt-card">
              <header className="pt-card-hd"><div><h3>Details</h3></div></header>
              <div className="pt-card-body">
                <dl className="pt-cu-dl">
                  <dt>Tags</dt>
                  <dd className="pt-cu-tags">
                    {c.tags.map((tg) => <span key={tg} className="pt-tag pt-tag-soft">{tg}</span>)}
                    <button className="pt-cu-add-tag">+</button>
                  </dd>
                  <dt>Address</dt>
                  <dd>{c.addr}</dd>
                  <dt>Pay methods</dt>
                  <dd>
                    <ul className="pt-cu-pay-list">
                      {c.payMethods.map((p) => <li key={p} className="mono">{p}</li>)}
                    </ul>
                  </dd>
                  <dt>Joined</dt>
                  <dd>{c.joined}</dd>
                </dl>
              </div>
            </section>

            <section className="pt-card">
              <header className="pt-card-hd"><div><h3>Activity</h3><p>Recent events</p></div></header>
              <div className="pt-card-body">
                <ul className="pt-cu-act">
                  <li><i className="pt-cu-act-dot pt-bul-cool"/><div><b>USDT received</b> · $330 · 4m ago</div></li>
                  <li><i className="pt-cu-act-dot"/><div>Order #A-2241 placed · today 13:18</div></li>
                  <li><i className="pt-cu-act-dot"/><div>Replied to broadcast "restock" · yesterday</div></li>
                  <li><i className="pt-cu-act-dot pt-bul-warn"/><div>Reorder ping sent · 4d ago</div></li>
                  <li><i className="pt-cu-act-dot"/><div>Order #A-2188 delivered · Apr 2</div></li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function PtOrderState({ state }) {
  const map = {
    delivered: { cls: "ok",   label: "Delivered" },
    confirming:{ cls: "warn", label: "Confirming" },
    shipped:   { cls: "cool", label: "Shipped" },
  };
  const s = map[state] || { cls: "", label: state };
  return <span className={`pt-cu-state pt-cu-state-${s.cls}`}><i/>{s.label}</span>;
}

Object.assign(window, { PtCustomerView, PT_CUSTOMERS });
