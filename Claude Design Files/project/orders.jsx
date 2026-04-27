// orders.jsx — Kanban orders board with crypto-confirmation gate

const PT_ORDERS = [
  // Awaiting payment
  { id: "A-2247", cust: "K. (gymrat_84)", custId: "t01", channel: "wa",
    items: "Reta 10mg ×2", amt: 330, asset: "USDT", age: "8m",
    state: "awaiting", invoiced: "8m ago" },
  { id: "A-2246", cust: "swolepriest", custId: "t04", channel: "tg",
    items: "Tirz 30mg ×2", amt: 440, asset: "BTC", age: "22m",
    state: "awaiting", invoiced: "22m ago" },
  { id: "A-2245", cust: "M.R.",        custId: "t07", channel: "wa",
    items: "GHK-Cu 50mg ×1", amt: 75,  asset: "USDT", age: "1h 4m",
    state: "awaiting", invoiced: "1h ago" },

  // Confirming (the gate)
  { id: "A-2244", cust: "K. (gymrat_84)", custId: "t01", channel: "wa",
    items: "BPC-157 5mg ×3, GHK ×1", amt: 189, asset: "USDT", age: "12m",
    state: "confirming", confirms: 8,  needs: 12, txHash: "0x71c4…ae93" },
  { id: "A-2243", cust: "T.B.",        custId: "t12", channel: "tg",
    items: "Tirz 30mg ×1", amt: 220, asset: "BTC", age: "34m",
    state: "confirming", confirms: 2,  needs: 3,  txHash: "bc1q…0x4a" },
  { id: "A-2242", cust: "irongoblin",  custId: "t09", channel: "tg",
    items: "Reta 10mg ×1, BPC ×2", amt: 241, asset: "XMR", age: "1h 12m",
    state: "confirming", confirms: 6,  needs: 10, txHash: "4ABc…f2e1" },

  // Packing
  { id: "A-2241", cust: "K. (gymrat_84)", custId: "t01", channel: "wa",
    items: "Reta 10mg ×2", amt: 330, asset: "USDT", age: "2h",
    state: "packing", picker: "self", batch: "REL-0419-A" },
  { id: "A-2240", cust: "ladyswole",  custId: "t05", channel: "wa",
    items: "Tirz 30mg ×1", amt: 220, asset: "USDT", age: "3h",
    state: "packing", picker: "self", batch: "TIR-0411-C" },

  // Shipped
  { id: "A-2238", cust: "M.S.",        custId: "t08", channel: "em",
    items: "BPC-157 5mg ×4", amt: 152, asset: "Cash", age: "1d",
    state: "shipped", carrier: "USPS Ground Adv.", track: "9400…21",
    eta: "Apr 24" },
  { id: "A-2237", cust: "swolepriest", custId: "t04", channel: "tg",
    items: "Reta 10mg ×1", amt: 165, asset: "BTC", age: "1d",
    state: "shipped", carrier: "USPS Priority", track: "9505…74",
    eta: "Apr 23" },
  { id: "A-2235", cust: "T.B.",        custId: "t12", channel: "tg",
    items: "GHK-Cu 50mg ×2", amt: 150, asset: "BTC", age: "2d",
    state: "shipped", carrier: "USPS Priority", track: "9505…11",
    eta: "Apr 23" },

  // Delivered
  { id: "A-2231", cust: "irongoblin",  custId: "t09", channel: "tg",
    items: "Tirz 30mg ×1", amt: 220, asset: "XMR", age: "3d",
    state: "delivered", deliveredAt: "Apr 19" },
  { id: "A-2228", cust: "K. (gymrat_84)", custId: "t01", channel: "wa",
    items: "BPC-157 5mg ×3", amt: 114, asset: "USDT", age: "4d",
    state: "delivered", deliveredAt: "Apr 18" },
];

const PT_COLUMNS = [
  { id: "awaiting",   label: "Awaiting payment", caption: "Invoice sent · waiting for tx",       gateAfter: true  },
  { id: "confirming", label: "Confirming",       caption: "Tx seen · waiting for N confirms",   gateAfter: true  },
  { id: "packing",    label: "Packing",          caption: "Paid · ready to ship",               gateAfter: false },
  { id: "shipped",    label: "Shipped",          caption: "In transit",                          gateAfter: false },
  { id: "delivered",  label: "Delivered",        caption: "Closed",                              gateAfter: false },
];

function PtOrdersView() {
  const [orders, setOrders] = React.useState(PT_ORDERS);
  const [dragId, setDragId] = React.useState(null);
  const [dragOverCol, setDragOverCol] = React.useState(null);
  const [pulse, setPulse] = React.useState({});  // id → 'ok' | 'err'
  const [toast, setToast] = React.useState(null);

  // Confirmations tick up over time for confirming orders (slow — chain time)
  React.useEffect(() => {
    const t = setInterval(() => {
      setOrders((prev) => {
        // Pick ONE under-confirmed order to advance, so ticks feel staggered
        const candidates = prev.filter((o) => o.state === "confirming" && o.confirms < o.needs);
        if (candidates.length === 0) return prev;
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        return prev.map((o) => o.id === target.id ? { ...o, confirms: o.confirms + 1 } : o);
      });
    }, 6500);
    return () => clearInterval(t);
  }, []);

  const showToast = (text, kind = "ok") => {
    setToast({ text, kind, id: Date.now() });
    setTimeout(() => setToast(null), 2400);
  };

  const flash = (id, kind) => {
    setPulse((p) => ({ ...p, [id]: kind }));
    setTimeout(() => setPulse((p) => { const n = { ...p }; delete n[id]; return n; }), 700);
  };

  const tryMove = (orderId, toState) => {
    const o = orders.find((x) => x.id === orderId);
    if (!o || o.state === toState) return;

    // Crypto-confirmation gate: confirming → packing requires confirms >= needs
    if (o.state === "confirming" && toState !== "confirming" && o.state !== toState) {
      if (toState === "awaiting") {
        // Allow rolling back
      } else if (toState === "packing" || toState === "shipped" || toState === "delivered") {
        if ((o.confirms || 0) < (o.needs || 0)) {
          flash(orderId, "err");
          showToast(`#${orderId} blocked — ${o.confirms}/${o.needs} confirmations`, "err");
          return;
        }
      }
    }

    // Awaiting can't skip directly to packing without payment
    if (o.state === "awaiting" && (toState === "packing" || toState === "shipped" || toState === "delivered")) {
      flash(orderId, "err");
      showToast(`#${orderId} blocked — no payment received yet`, "err");
      return;
    }

    setOrders((prev) => prev.map((x) => x.id === orderId ? { ...x, state: toState } : x));
    flash(orderId, "ok");
    showToast(`#${orderId} → ${PT_COLUMNS.find((c) => c.id === toState).label}`);
  };

  const onDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch (err) {}
  };
  const onDragEnd = () => { setDragId(null); setDragOverCol(null); };

  const columnCounts = PT_COLUMNS.reduce((acc, c) => {
    acc[c.id] = orders.filter((o) => o.state === c.id).length;
    return acc;
  }, {});

  const totalAwaiting = orders.filter((o) => o.state === "awaiting" || o.state === "confirming")
    .reduce((s, o) => s + o.amt, 0);
  const inFlight = orders.filter((o) => o.state === "shipped").length;

  return (
    <div className="pt-or" data-screen-label="Orders">
      <div className="pt-or-hd">
        <div>
          <h1>Orders</h1>
          <p>{orders.length} open · ${totalAwaiting.toLocaleString()} awaiting payment · {inFlight} in transit</p>
        </div>
        <div className="pt-or-hd-actions">
          <div className="pt-or-search">
            <window.I.search size={12}/>
            <input placeholder="Search by # or customer…"/>
          </div>
          <button className="pt-btn pt-btn-ghost"><window.I.filter size={12}/> Filter</button>
          <button className="pt-btn pt-btn-ghost"><window.I.box size={12}/> Print labels (3)</button>
          <button className="pt-btn pt-btn-primary"><window.I.plus size={12}/> New order</button>
        </div>
      </div>

      <div className="pt-or-board">
        {PT_COLUMNS.map((col) => {
          const colOrders = orders.filter((o) => o.state === col.id);
          const isOver = dragOverCol === col.id && dragId;
          const draggedOrder = dragId ? orders.find((o) => o.id === dragId) : null;
          const wouldBeBlocked = draggedOrder && (
            (draggedOrder.state === "awaiting" && (col.id === "packing" || col.id === "shipped" || col.id === "delivered")) ||
            (draggedOrder.state === "confirming" && (col.id === "packing" || col.id === "shipped" || col.id === "delivered") &&
              (draggedOrder.confirms || 0) < (draggedOrder.needs || 0))
          );

          return (
            <div
              key={col.id}
              className={`pt-or-col ${isOver ? "is-over" : ""} ${isOver && wouldBeBlocked ? "is-blocked" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverCol(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragId || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
                if (id) tryMove(id, col.id);
                setDragId(null);
                setDragOverCol(null);
              }}
            >
              <div className="pt-or-col-hd" data-col={col.id}>
                <div className="pt-or-col-titlewrap">
                  <span className={`pt-or-col-dot pt-or-dot-${col.id}`}/>
                  <span className="pt-or-col-title">{col.label}</span>
                  <span className="pt-or-col-count mono">{columnCounts[col.id]}</span>
                </div>
                <div className="pt-or-col-cap">{col.caption}</div>
              </div>

              <div className="pt-or-col-body">
                {colOrders.map((o) => (
                  <PtOrderCard
                    key={o.id}
                    order={o}
                    pulse={pulse[o.id]}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onAdvance={tryMove}
                    isDragging={dragId === o.id}
                  />
                ))}
                {colOrders.length === 0 && (
                  <div className="pt-or-col-empty">— nothing here —</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div className={`pt-or-toast pt-or-toast-${toast.kind}`} key={toast.id}>
          {toast.kind === "err" ? <window.I.x size={12}/> : <window.I.check size={12}/>}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

function PtOrderCard({ order: o, pulse, onDragStart, onDragEnd, onAdvance, isDragging }) {
  const Ch = window.I[o.channel];
  const initials = (o.cust.match(/[A-Z]/g) || [o.cust[0]]).slice(0,2).join("");
  const confirmPct = o.state === "confirming" ? (o.confirms / o.needs) : 0;
  const confirmReady = o.state === "confirming" && o.confirms >= o.needs;
  const nextState = {
    awaiting: null, // can't advance without payment
    confirming: confirmReady ? "packing" : null,
    packing: "shipped",
    shipped: "delivered",
    delivered: null,
  }[o.state];
  const nextLabel = {
    packing:   "Confirm payment →",
    shipped:   "Mark packed →",
    delivered: "Mark delivered →",
  };

  return (
    <article
      className={`pt-or-card pt-or-card-${o.state} ${pulse ? `pt-or-pulse-${pulse}` : ""} ${isDragging ? "is-dragging" : ""}`}
      draggable
      onDragStart={(e) => onDragStart(e, o.id)}
      onDragEnd={onDragEnd}
    >
      <header className="pt-or-card-hd">
        <span className="pt-or-card-id mono">#{o.id}</span>
        <span className="pt-or-card-age mono">{o.age}</span>
      </header>

      <div className="pt-or-card-cust">
        <div className="pt-or-card-av" data-channel={o.channel}>
          <span>{initials}</span>
          <i className={`pt-thread-ch pt-ch-${o.channel}`}><Ch size={8}/></i>
        </div>
        <div className="pt-or-card-name">{o.cust}</div>
      </div>

      <div className="pt-or-card-items">{o.items}</div>

      <div className="pt-or-card-pay">
        <span className="pt-pay-asset" data-asset={o.asset}>{o.asset}</span>
        <span className="pt-or-card-amt mono">${o.amt}</span>
      </div>

      {/* State-specific footer */}
      {o.state === "awaiting" && (
        <div className="pt-or-card-state pt-or-state-await">
          <window.I.clock size={11}/>
          <span>invoice sent {o.invoiced}</span>
        </div>
      )}

      {o.state === "confirming" && (
        <div className="pt-or-card-confirm">
          <div className="pt-or-confirm-row">
            <span className="pt-or-confirm-tx mono">{o.txHash}</span>
            <span className="pt-or-confirm-ct mono">{o.confirms}/{o.needs}</span>
          </div>
          <div className="pt-or-confirm-bar">
            {Array.from({length: o.needs}).map((_, i) => (
              <span key={i} className={`pt-or-confirm-tick ${i < o.confirms ? "is-on" : ""} ${confirmReady ? "is-ready" : ""}`}/>
            ))}
          </div>
          <div className="pt-or-confirm-cap">
            {confirmReady
              ? <><window.I.check size={11}/> ready to advance</>
              : <>waiting · ~{Math.max(1, (o.needs - o.confirms) * 2)}m</>}
          </div>
        </div>
      )}

      {o.state === "packing" && (
        <div className="pt-or-card-state pt-or-state-pack">
          <window.I.box size={11}/>
          <span>batch {o.batch}</span>
        </div>
      )}

      {o.state === "shipped" && (
        <div className="pt-or-card-state pt-or-state-ship">
          <window.I.truck size={11}/>
          <span>{o.carrier} · ETA {o.eta}</span>
        </div>
      )}

      {o.state === "delivered" && (
        <div className="pt-or-card-state pt-or-state-done">
          <window.I.check size={11}/>
          <span>delivered {o.deliveredAt}</span>
        </div>
      )}

      {nextState && (
        <button
          className="pt-or-advance"
          onClick={() => onAdvance(o.id, nextState)}
        >
          {nextLabel[nextState] || `→ ${nextState}`}
        </button>
      )}
    </article>
  );
}

Object.assign(window, { PtOrdersView, PT_ORDERS, PT_COLUMNS });
