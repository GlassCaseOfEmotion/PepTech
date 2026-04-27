// widgets.jsx — Dashboard widget cards

// ─── KPI strip ──────────────────────────────────────────────────────────────
function PtKpiRow() {
  const kpis = [
    { label: "Revenue · 7d",      value: "$12,330", delta: +18.4, spark: [3,4,3,5,4,7,8] },
    { label: "Pending crypto",    value: "$895",    delta: null,  sub: "2 confirming · 1 pending" },
    { label: "Active conversations", value: "23",   delta: +4,    sub: "7 need reply" },
    { label: "Reorders due · 7d", value: "11",      delta: null,  sub: "3 high-confidence" },
  ];
  return (
    <div className="pt-kpis">
      {kpis.map((k, i) => (
        <div className="pt-kpi" key={i}>
          <div className="pt-kpi-lbl">{k.label}</div>
          <div className="pt-kpi-val-row">
            <div className="pt-kpi-val">{k.value}</div>
            {k.delta != null && (
              <span className={`pt-kpi-delta ${k.delta >= 0 ? "up" : "dn"}`}>
                {k.delta >= 0 ? "▲" : "▼"} {Math.abs(k.delta)}%
              </span>
            )}
            {k.spark && <PtSpark data={k.spark} />}
          </div>
          {k.sub && <div className="pt-kpi-sub">{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function PtSpark({ data }) {
  const max = Math.max(...data), min = Math.min(...data);
  const w = 56, h = 18;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / Math.max(1, max - min)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pt-spark">
      <polyline points={pts} fill="none" stroke="var(--pt-accent)" strokeWidth="1.25"
                strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Card shell ─────────────────────────────────────────────────────────────
function PtCard({ title, subtitle, action, span, footer, children, scroll }) {
  return (
    <section className={`pt-card ${span ? `pt-span-${span}` : ""}`}>
      <header className="pt-card-hd">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={`pt-card-body ${scroll ? "is-scroll" : ""}`}>{children}</div>
      {footer && <footer className="pt-card-ft">{footer}</footer>}
    </section>
  );
}

// ─── Inbox preview ──────────────────────────────────────────────────────────
function PtInboxCard({ threads, activeId, onSelect }) {
  const [filter, setFilter] = React.useState("needs_reply");
  const filters = [
    { id: "needs_reply", label: "Needs reply", count: 4 },
    { id: "all",         label: "All",         count: threads.length },
    { id: "new",         label: "New",         count: 1 },
    { id: "snoozed",     label: "Snoozed",     count: 1 },
  ];
  const shown = filter === "all"
    ? threads
    : threads.filter((t) => t.status === filter);
  return (
    <PtCard
      title="Inbox" subtitle={`Live across WhatsApp, Telegram, Email`}
      span="2"
      action={
        <div className="pt-pillbar">
          {filters.map((f) => (
            <button key={f.id}
                    className={`pt-pill ${filter === f.id ? "is-on" : ""}`}
                    onClick={() => setFilter(f.id)}>
              {f.label}
              <span className="pt-pill-num">{f.count}</span>
            </button>
          ))}
        </div>
      }
      scroll
    >
      <ul className="pt-thread-list">
        {shown.map((t) => (
          <PtThreadRow key={t.id} t={t} active={t.id === activeId}
                       onClick={() => onSelect(t.id)} />
        ))}
      </ul>
    </PtCard>
  );
}

function PtThreadRow({ t, active, onClick }) {
  const Ch = window.I[t.channel];
  return (
    <li className={`pt-thread ${active ? "is-active" : ""} ${t.unread ? "is-unread" : ""}`}
        onClick={onClick}>
      <div className="pt-thread-av" data-channel={t.channel}>
        <span>{(t.name.match(/[A-Z]/g) || [t.name[0]]).slice(0, 2).join("")}</span>
        <i className={`pt-thread-ch pt-ch-${t.channel}`}><Ch size={9} /></i>
      </div>
      <div className="pt-thread-mid">
        <div className="pt-thread-row1">
          <span className="pt-thread-name">{t.name}</span>
          {t.tags.includes("vip") && <span className="pt-tag pt-tag-vip">VIP</span>}
          {t.tags.includes("new") && <span className="pt-tag pt-tag-new">new</span>}
          {t.tags.includes("waitlist") && <span className="pt-tag">waitlist</span>}
          {t.tags.includes("payment") && <span className="pt-tag pt-tag-warn">payment</span>}
          {t.tags.includes("repeat") && !t.tags.includes("vip") && <span className="pt-tag pt-tag-soft">repeat</span>}
        </div>
        <div className="pt-thread-snip">{t.snippet}</div>
      </div>
      <div className="pt-thread-meta">
        <div className="pt-thread-time">{fmtMins(t.minsAgo)}</div>
        {t.unread > 0
          ? <div className="pt-thread-unread">{t.unread}</div>
          : <PtTrust score={t.trust} compact />}
      </div>
    </li>
  );
}

function fmtMins(m) {
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.floor(m/60)}h`;
  return `${Math.floor(m/60/24)}d`;
}

// ─── Trust score ────────────────────────────────────────────────────────────
function PtTrust({ score, compact }) {
  const cls = score >= 85 ? "hi" : score >= 65 ? "md" : "lo";
  if (compact) return <div className={`pt-trust-pill pt-trust-${cls}`}>{score}</div>;
  return (
    <div className={`pt-trust pt-trust-${cls}`}>
      <div className="pt-trust-num">{score}</div>
      <div className="pt-trust-lbl">trust</div>
    </div>
  );
}

// ─── Crypto payments ────────────────────────────────────────────────────────
function PtPaymentsCard({ payments, onConfirm }) {
  return (
    <PtCard
      title="Crypto payments"
      subtitle="Awaiting confirmation"
      action={<button className="pt-link">View all →</button>}
    >
      <ul className="pt-pay-list">
        {payments.map((p) => (
          <li key={p.id} className={`pt-pay pt-pay-${p.state}`}>
            <div className="pt-pay-asset" data-asset={p.asset}>{p.asset}</div>
            <div className="pt-pay-mid">
              <div className="pt-pay-who">{p.who}</div>
              <div className="pt-pay-state">
                {p.state === "confirmed" && <><span className="pt-dot pt-dot-ok"/> confirmed · {p.conf} conf</>}
                {p.state === "confirming" && <><span className="pt-dot pt-dot-warn"/> {p.conf}/{p.need} confirmations · {p.txAge} ago</>}
                {p.state === "pending" && <><span className="pt-dot pt-dot-cool"/> awaiting tx hash · {p.who === "Dani V." ? "wire failed" : ""}</>}
              </div>
            </div>
            <div className="pt-pay-amt-col">
              <div className="pt-pay-amt">${p.amt}</div>
              {p.state !== "confirmed" && (
                <button className="pt-pay-act" onClick={() => onConfirm(p.id)}>
                  {p.state === "confirming" ? "Mark paid" : "Resend addr"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </PtCard>
  );
}

// ─── Reorder signals ────────────────────────────────────────────────────────
function PtReordersCard({ reorders }) {
  return (
    <PtCard
      title="Reorder signals"
      subtitle="Cycle-end approaching · ML guess"
      action={<button className="pt-link">Configure →</button>}
    >
      <ul className="pt-reorder-list">
        {reorders.map((r, i) => (
          <li key={i} className="pt-reorder">
            <div className="pt-reorder-due">
              <div className={`pt-reorder-when ${r.dueIn === "now" ? "is-now" : ""}`}>{r.dueIn}</div>
              <div className="pt-reorder-cycle">{r.cycle}</div>
            </div>
            <div className="pt-reorder-mid">
              <div className="pt-reorder-who">{r.who}</div>
              <div className="pt-reorder-prod">{r.product}</div>
            </div>
            <div className="pt-reorder-conf">
              <PtConfBar pct={r.conf} />
              <div className="pt-reorder-pct">{Math.round(r.conf*100)}%</div>
            </div>
            <button className="pt-reorder-act" title="Send pre-written reorder ping">
              <window.I.send size={12}/>
            </button>
          </li>
        ))}
      </ul>
    </PtCard>
  );
}

function PtConfBar({ pct }) {
  return (
    <div className="pt-confbar">
      <div className="pt-confbar-fill" style={{ width: `${pct*100}%` }} />
    </div>
  );
}

// ─── Stock / catalog peek ───────────────────────────────────────────────────
function PtStockCard({ products }) {
  return (
    <PtCard
      title="Stock"
      subtitle="On-hand by SKU"
      action={<button className="pt-link">Catalog →</button>}
      scroll
    >
      <table className="pt-stock">
        <thead>
          <tr>
            <th>SKU</th><th>Lot</th><th className="r">On-hand</th><th className="r">7d Δ</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.sku} className={p.stock === 0 ? "is-out" : p.stock < 15 ? "is-low" : ""}>
              <td>
                <div className="pt-sku">{p.sku}</div>
                <div className="pt-sku-name">{p.name}</div>
              </td>
              <td className="mono">{p.lot}</td>
              <td className="r mono">
                {p.stock === 0
                  ? <span className="pt-out">OUT</span>
                  : <>{p.stock}<span className="pt-stock-unit">v</span></>}
              </td>
              <td className={`r mono ${p.trend > 0 ? "up" : p.trend < 0 ? "dn" : ""}`}>
                {p.trend > 0 ? "+" : ""}{p.trend}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PtCard>
  );
}

// ─── Revenue chart ──────────────────────────────────────────────────────────
function PtRevenueCard({ data }) {
  const max = Math.max(...data.map((d) => d.v));
  return (
    <PtCard
      title="Revenue"
      subtitle="Last 7 days · USD equivalent"
      action={
        <div className="pt-segctl">
          <button className="is-on">7d</button>
          <button>30d</button>
          <button>90d</button>
        </div>
      }
    >
      <div className="pt-bars">
        {data.map((d, i) => (
          <div className="pt-bar-col" key={i}>
            <div className="pt-bar-track">
              <div className="pt-bar-fill" style={{ height: `${(d.v / max) * 100}%` }}>
                <span className="pt-bar-tip">${d.v.toLocaleString()}</span>
              </div>
            </div>
            <div className="pt-bar-lbl">{d.d}</div>
          </div>
        ))}
      </div>
    </PtCard>
  );
}

// ─── Shipments ──────────────────────────────────────────────────────────────
function PtShipmentsCard({ shipments }) {
  const labelMap = {
    label_made: "Label",
    in_transit: "In transit",
    customs:    "Customs",
    delivered:  "Delivered",
  };
  return (
    <PtCard
      title="Shipments"
      subtitle="Carrier tracking"
      action={<button className="pt-link">All →</button>}
    >
      <ul className="pt-ship-list">
        {shipments.map((s) => (
          <li key={s.id} className={`pt-ship pt-ship-${s.status}`}>
            <div className="pt-ship-icon"><window.I.truck size={13}/></div>
            <div className="pt-ship-mid">
              <div className="pt-ship-row1">
                <span className="pt-ship-to">→ {s.to}</span>
                <span className="pt-ship-carrier">{s.carrier}</span>
                <span className="pt-ship-id mono">{s.id}</span>
              </div>
              <div className="pt-ship-track">
                {[1,2,3,4].map((n) => (
                  <i key={n} className={`pt-ship-step ${n <= s.step ? "on" : ""}`}/>
                ))}
                <span className="pt-ship-status">{labelMap[s.status]} · ETA {s.eta}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </PtCard>
  );
}

// ─── Right rail: agenda + customer focus ────────────────────────────────────
function PtRightRail({ activeThread, threads, onOpenCustomer }) {
  const t = threads.find((x) => x.id === activeThread) || threads[0];
  return (
    <aside className="pt-right">
      <div className="pt-right-section">
        <div className="pt-right-hd">
          <span>Today</span>
          <button className="pt-right-add"><window.I.plus size={11}/></button>
        </div>
        <ul className="pt-agenda">
          <li className="pt-agenda-i">
            <i className="pt-agenda-bullet pt-bul-warn"/>
            <div>
              <div className="pt-agenda-t">Confirm USDT from K.</div>
              <div className="pt-agenda-s">2/3 conf · ~9 min away</div>
            </div>
            <span className="pt-agenda-time">11:42</span>
          </li>
          <li className="pt-agenda-i">
            <i className="pt-agenda-bullet pt-bul-cool"/>
            <div>
              <div className="pt-agenda-t">Drop pkg at USPS</div>
              <div className="pt-agenda-s">3 labels printed · cutoff 4pm</div>
            </div>
            <span className="pt-agenda-time">14:00</span>
          </li>
          <li className="pt-agenda-i">
            <i className="pt-agenda-bullet"/>
            <div>
              <div className="pt-agenda-t">Re-up tirz from supplier</div>
              <div className="pt-agenda-s">9 vials left · 4 backorders</div>
            </div>
            <span className="pt-agenda-time pt-agenda-empty"></span>
          </li>
          <li className="pt-agenda-i">
            <i className="pt-agenda-bullet"/>
            <div>
              <div className="pt-agenda-t">Reply to swolepriest</div>
              <div className="pt-agenda-s">2wk old · risk of churn</div>
            </div>
            <span className="pt-agenda-time pt-agenda-empty"></span>
          </li>
        </ul>
      </div>

      <div className="pt-right-section">
        <div className="pt-right-hd"><span>Focus customer</span><button className="pt-link" onClick={() => onOpenCustomer && onOpenCustomer(t.id)}>Open →</button></div>
        <PtCustomerCard t={t} onOpen={onOpenCustomer} />
      </div>

      <div className="pt-right-section">
        <div className="pt-right-hd"><span>Quick replies</span></div>
        <div className="pt-quicks">
          {[
            "send wallet addr",
            "tracking uploaded",
            "out of stock — eta?",
            "first-time how-to",
            "dosing protocol",
            "discount: repeat 10%",
          ].map((q) => (
            <button key={q} className="pt-quick">{q}</button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function PtCustomerCard({ t, onOpen }) {
  if (!t) return null;
  return (
    <div className="pt-cust" onClick={() => onOpen && onOpen(t.id)} style={{cursor: onOpen ? "pointer" : "default"}}>
      <div className="pt-cust-hd">
        <div className="pt-cust-av" data-channel={t.channel}>
          {(t.name.match(/[A-Z]/g) || [t.name[0]]).slice(0,2).join("")}
        </div>
        <div className="pt-cust-id">
          <div className="pt-cust-name">{t.name}</div>
          <div className="pt-cust-handle mono">{t.handle}</div>
        </div>
        <PtTrust score={t.trust} />
      </div>
      <div className="pt-cust-stats">
        <div><div className="lbl">LTV</div><div className="val mono">${t.ltv.toLocaleString()}</div></div>
        <div><div className="lbl">Last</div><div className="val mono">{t.lastOrder}</div></div>
        <div><div className="lbl">Channel</div><div className="val">{({wa:"WhatsApp",tg:"Telegram",em:"Email"})[t.channel]}</div></div>
      </div>
      <div className="pt-cust-tags">
        {t.tags.map((tg) => <span key={tg} className="pt-tag pt-tag-soft">{tg}</span>)}
      </div>
      <div className="pt-cust-history">
        <div className="pt-cust-hist-hd">Recent orders</div>
        <ul>
          <li><span className="mono">#A-2241</span><span>Reta 10mg ×2</span><span className="mono">$330</span></li>
          <li><span className="mono">#A-2188</span><span>BPC 5mg ×3</span><span className="mono">$114</span></li>
          <li><span className="mono">#A-2103</span><span>Tirz 30mg ×1</span><span className="mono">$220</span></li>
        </ul>
      </div>
    </div>
  );
}

Object.assign(window, {
  PtKpiRow, PtCard, PtInboxCard, PtPaymentsCard, PtReordersCard,
  PtStockCard, PtRevenueCard, PtShipmentsCard, PtRightRail,
});
