// order-detail.jsx — Single order drill-in view

const PT_ORDER_DETAIL = {
  // Keyed by order id; falls back to a generic detail derived from PT_ORDERS
  "A-2244": {
    items: [
      { sku: "BPC-157", name: "BPC-157 5mg", qty: 3, unit: 38, batch: "BPC-0408-B", coa: "COA-BPC-0408-B" },
      { sku: "GHK-Cu",  name: "GHK-Cu 50mg", qty: 1, unit: 75, batch: "GHK-0322-A", coa: "COA-GHK-0322-A" },
    ],
    sub: 189, ship: 0, total: 189,
    address: { ln1: "•••• Maple St", ln2: "Apt 4B", city: "Brooklyn, NY", zip: "112••", masked: true },
    chatExcerpt: [
      { from: "them", at: "Apr 22 · 09:14", text: "yo can i grab 3 BPC and 1 GHK?" },
      { from: "me",   at: "Apr 22 · 09:18", text: "yeah — $189. usdt-trc20 to TQrZ8…mK4n9pX. ref A-2244" },
      { from: "them", at: "Apr 22 · 11:32", text: "sent. tx 0x71c4…ae93" },
    ],
    timeline: [
      { at: "Apr 22 · 09:18", actor: "operator", action: "Order drafted from chat", note: "via Inbox · t01" },
      { at: "Apr 22 · 09:18", actor: "system",   action: "Invoice sent",            note: "USDT-TRC20 · TQrZ8…mK4n9pX" },
      { at: "Apr 22 · 11:32", actor: "system",   action: "Tx detected",             note: "0x71c4…ae93 · 1/12 confirmations" },
      { at: "Apr 22 · 11:44", actor: "system",   action: "Confirmation tick",       note: "8/12 confirmations" },
    ],
    notes: "Repeat customer — same address as A-2241 and A-2228. Ship Mon AM.",
  },
};

function PtOrderDetailView({ orderId, onBack, onMessage, onOpenCustomer }) {
  const [orders] = React.useState(window.PT_ORDERS);
  const order = orders.find((o) => o.id === orderId) || orders[0];
  const detail = PT_ORDER_DETAIL[order.id] || PT_ORDER_DETAIL["A-2244"];
  const cust = (window.PT_THREADS || []).find((t) => t.id === order.custId);

  // Items: derive from order.items string if no detail
  const items = detail.items || [{ sku: "—", name: order.items, qty: 1, unit: order.amt, batch: "—", coa: null }];
  const sub = detail.sub || order.amt;
  const total = detail.total || order.amt;

  const stateLabels = {
    awaiting: "Awaiting payment",
    confirming: "Confirming",
    packing: "Packing",
    shipped: "Shipped",
    delivered: "Delivered",
  };
  const stateOrder = ["awaiting", "confirming", "packing", "shipped", "delivered"];
  const currentIdx = stateOrder.indexOf(order.state);

  const Ch = window.I[order.channel];

  return (
    <div className="pt-od" data-screen-label="Order Detail">
      {/* Header */}
      <div className="pt-od-hd">
        <button className="pt-btn pt-btn-ghost" onClick={onBack}>← Orders</button>
        <div className="pt-od-hd-mid">
          <div className="pt-od-hd-title">
            <h1 className="mono">#{order.id}</h1>
            <span className={`pt-od-state-pill pt-od-state-${order.state}`}>
              <span className={`pt-or-col-dot pt-or-dot-${order.state}`}/>
              {stateLabels[order.state]}
            </span>
            <span className="pt-od-channel">
              <Ch size={11}/> {order.channel === "wa" ? "WhatsApp" : order.channel === "tg" ? "Telegram" : "Email"}
            </span>
          </div>
          <p>
            {order.cust} · placed {order.age} ago · {items.length} {items.length === 1 ? "item" : "items"}
          </p>
        </div>
        <div className="pt-od-hd-actions">
          <button className="pt-btn pt-btn-ghost" onClick={() => onMessage && onMessage(order.custId)}>
            <window.I.send size={12}/> Message
          </button>
          <button className="pt-btn pt-btn-ghost"><window.I.box size={12}/> Print label</button>
          <button className="pt-btn pt-btn-ghost"><window.I.more size={14}/></button>
        </div>
      </div>

      {/* Stepper */}
      <div className="pt-od-stepper">
        {stateOrder.map((s, i) => (
          <React.Fragment key={s}>
            <div className={`pt-od-step ${i < currentIdx ? "is-done" : ""} ${i === currentIdx ? "is-active" : ""}`}>
              <span className="pt-od-step-dot">
                {i < currentIdx ? <window.I.check size={10}/> : <span className="mono">{i + 1}</span>}
              </span>
              <span className="pt-od-step-label">{stateLabels[s]}</span>
            </div>
            {i < stateOrder.length - 1 && (
              <span className={`pt-od-step-sep ${i < currentIdx ? "is-done" : ""}`}/>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Body — 2 columns */}
      <div className="pt-od-body">
        {/* LEFT: ops detail */}
        <div className="pt-od-main">
          {/* Items */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div>
                <h3>Line items</h3>
                <p>{items.length} {items.length === 1 ? "SKU" : "SKUs"} · batch &amp; COA tracked</p>
              </div>
              <button className="pt-iconbtn"><window.I.more size={14}/></button>
            </header>
            <div className="pt-card-body" style={{padding: 0}}>
              <table className="pt-od-items">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Item</th>
                    <th>Batch</th>
                    <th>COA</th>
                    <th className="pt-od-num">Qty</th>
                    <th className="pt-od-num">Unit</th>
                    <th className="pt-od-num">Line</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td><span className="mono">{it.sku}</span></td>
                      <td>{it.name}</td>
                      <td><span className="mono">{it.batch}</span></td>
                      <td>{it.coa ? <a className="pt-od-coa">{it.coa}</a> : <span style={{color:"var(--pt-fg-4)"}}>—</span>}</td>
                      <td className="pt-od-num mono">{it.qty}</td>
                      <td className="pt-od-num mono">${it.unit}</td>
                      <td className="pt-od-num mono">${it.qty * it.unit}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan="5"></td><td className="pt-od-num">Subtotal</td><td className="pt-od-num mono">${sub}</td></tr>
                  <tr><td colSpan="5"></td><td className="pt-od-num">Shipping</td><td className="pt-od-num mono">${detail.ship || 0}</td></tr>
                  <tr className="pt-od-total"><td colSpan="5"></td><td className="pt-od-num">Total</td><td className="pt-od-num mono">${total}</td></tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Payment */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div>
                <h3>Payment</h3>
                <p>{order.asset === "Cash" ? "Cash on delivery" : `${order.asset} · on-chain`}</p>
              </div>
              <span className={`pt-od-pay-status pt-od-pay-${order.state}`}>
                {order.state === "awaiting" && "Awaiting"}
                {order.state === "confirming" && `${order.confirms}/${order.needs} confirms`}
                {(order.state === "packing" || order.state === "shipped" || order.state === "delivered") && "Settled"}
              </span>
            </header>
            <div className="pt-card-body">
              <div className="pt-od-pay-grid">
                <div>
                  <div className="pt-od-pay-lbl">Asset</div>
                  <div className="pt-od-pay-val">
                    <span className="pt-pay-asset" data-asset={order.asset}>{order.asset}</span>
                    <span className="mono" style={{marginLeft: 8}}>${order.amt}</span>
                  </div>
                </div>
                <div>
                  <div className="pt-od-pay-lbl">Receiving address</div>
                  <div className="pt-od-pay-val mono">TQrZ8…mK4n9pX</div>
                </div>
                {order.state !== "awaiting" && (
                  <>
                    <div>
                      <div className="pt-od-pay-lbl">Tx hash</div>
                      <div className="pt-od-pay-val mono">{order.txHash || "0x71c4…ae93"}</div>
                    </div>
                    <div>
                      <div className="pt-od-pay-lbl">Rate snapshot</div>
                      <div className="pt-od-pay-val mono">1 USDT = $1.00</div>
                    </div>
                  </>
                )}
                {order.state === "awaiting" && (
                  <div style={{gridColumn: "1 / -1"}}>
                    <div className="pt-od-pay-lbl">Reference</div>
                    <div className="pt-od-pay-val mono">PT-{order.id}</div>
                  </div>
                )}
              </div>

              {order.state === "confirming" && (
                <div className="pt-od-confirm">
                  <div className="pt-or-confirm-bar">
                    {Array.from({length: order.needs}).map((_, i) => (
                      <span key={i} className={`pt-or-confirm-tick ${i < order.confirms ? "is-on" : ""}`}/>
                    ))}
                  </div>
                  <div className="pt-od-confirm-cap">
                    Auto-advances to Packing once {order.needs} confirmations land. Auto-mark-paid automation will move this card.
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Shipping */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div>
                <h3>Shipping</h3>
                <p>
                  {order.state === "awaiting" || order.state === "confirming"
                    ? "Will pack once payment confirms"
                    : order.state === "packing"
                    ? `Packing · batch ${order.batch || "—"}`
                    : order.state === "shipped"
                    ? `In transit · ETA ${order.eta}`
                    : `Delivered ${order.deliveredAt}`}
                </p>
              </div>
              {(order.state === "shipped" || order.state === "delivered") && (
                <button className="pt-iconbtn" title="Tracking link"><window.I.arrowR size={14}/></button>
              )}
            </header>
            <div className="pt-card-body">
              <div className="pt-od-ship-grid">
                <div>
                  <div className="pt-od-pay-lbl">Address</div>
                  <div className="pt-od-pay-val">
                    {detail.address.ln1}<br/>
                    {detail.address.ln2}<br/>
                    {detail.address.city} · {detail.address.zip}
                    {detail.address.masked && (
                      <span className="pt-od-masked"><window.I.lock size={10}/> masked · click to decrypt</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="pt-od-pay-lbl">Carrier</div>
                  <div className="pt-od-pay-val">
                    {order.carrier || "USPS Priority"} ·
                    {" "}<span className="mono">{order.track || "—"}</span>
                  </div>
                </div>
                <div>
                  <div className="pt-od-pay-lbl">ETA</div>
                  <div className="pt-od-pay-val">{order.eta || "—"}</div>
                </div>
                <div>
                  <div className="pt-od-pay-lbl">Packaging</div>
                  <div className="pt-od-pay-val">discreet · double-sealed · no logo</div>
                </div>
              </div>
            </div>
          </section>

          {/* Operator notes */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div><h3>Notes</h3><p>Operator-only · not shown to customer</p></div>
            </header>
            <div className="pt-card-body">
              <textarea className="pt-od-notes" defaultValue={detail.notes}/>
            </div>
          </section>
        </div>

        {/* RIGHT: customer + activity + chat */}
        <aside className="pt-od-rail">
          {/* Customer */}
          {cust && (
            <section className="pt-card">
              <header className="pt-card-hd">
                <div><h3>Customer</h3></div>
                <button className="pt-iconbtn" title="Open customer" onClick={() => onOpenCustomer && onOpenCustomer(cust.id)}>
                  <window.I.arrowR size={14}/>
                </button>
              </header>
              <div className="pt-card-body">
                <div className="pt-cust-id">
                  <div className="pt-thread-av" data-channel={cust.channel}>
                    {(cust.name.match(/[A-Z]/g) || [cust.name[0]]).slice(0,2).join("")}
                  </div>
                  <div>
                    <div className="pt-cust-name">{cust.name}</div>
                    <div className="pt-cust-handle mono">{cust.handle}</div>
                  </div>
                  <div className={`pt-trust-pill pt-trust-${cust.trust>=85?"hi":cust.trust>=65?"md":"lo"}`}>{cust.trust}</div>
                </div>
                <div className="pt-od-cust-stats">
                  <div><span className="pt-od-stat-lbl">LTV</span><span className="mono">${cust.ltv}</span></div>
                  <div><span className="pt-od-stat-lbl">Orders</span><span className="mono">{cust.orders || 12}</span></div>
                  <div><span className="pt-od-stat-lbl">Last</span><span className="mono">{cust.lastOrder}</span></div>
                </div>
              </div>
            </section>
          )}

          {/* Activity */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div><h3>Activity</h3><p>{detail.timeline.length} events</p></div>
            </header>
            <div className="pt-card-body" style={{padding: "8px 0 14px"}}>
              <ol className="pt-od-tl">
                {detail.timeline.map((t, i) => (
                  <li key={i} className={`pt-od-tl-i pt-od-tl-${t.actor}`}>
                    <span className="pt-od-tl-bullet"/>
                    <div className="pt-od-tl-body">
                      <div className="pt-od-tl-row">
                        <span className="pt-od-tl-action">{t.action}</span>
                        <span className="pt-od-tl-time mono">{t.at.split(" · ")[1]}</span>
                      </div>
                      <div className="pt-od-tl-note">{t.note}</div>
                      <div className="pt-od-tl-date">{t.at.split(" · ")[0]}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Chat excerpt */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div><h3>Where this came from</h3><p>Excerpt from {order.channel === "wa" ? "WhatsApp" : order.channel === "tg" ? "Telegram" : "Email"} thread</p></div>
              <button className="pt-iconbtn" title="Open thread" onClick={() => onMessage && onMessage(order.custId)}>
                <window.I.arrowR size={14}/>
              </button>
            </header>
            <div className="pt-card-body">
              <div className="pt-od-chat">
                {detail.chatExcerpt.map((m, i) => (
                  <div key={i} className={`pt-od-msg pt-od-msg-${m.from}`}>
                    <div className="pt-od-msg-bubble">{m.text}</div>
                    <div className="pt-od-msg-time">{m.at.split(" · ")[1]}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

Object.assign(window, { PtOrderDetailView, PT_ORDER_DETAIL });
