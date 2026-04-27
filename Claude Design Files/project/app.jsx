// app.jsx — main composition with dashboard + inbox routing

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "acid",
  "density": "regular",
  "rightRail": true
}/*EDITMODE-END*/;

function PtApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [active, setActive] = React.useState("home");
  const [activeThread, setActiveThread] = React.useState("t01");
  const [activeCustomer, setActiveCustomer] = React.useState(null);
  const [confirmed, setConfirmed] = React.useState({});
  const [messages, setMessages] = React.useState(window.PT_MESSAGES);

  const onConfirm = (id) => setConfirmed((p) => ({ ...p, [id]: true }));
  const payments = window.PT_PAYMENTS.map((p) =>
    confirmed[p.id] ? { ...p, state: "confirmed" } : p);

  const onSend = (threadId, text) => {
    const newMsg = {
      id: "m" + Date.now(),
      from: "me",
      at: "Today · just now",
      text,
      optimistic: true,
    };
    setMessages((prev) => ({
      ...prev,
      [threadId]: [...(prev[threadId] || []), newMsg],
    }));
    setTimeout(() => {
      setMessages((prev) => ({
        ...prev,
        [threadId]: (prev[threadId] || []).map((m) =>
          m.id === newMsg.id ? { ...m, optimistic: false } : m),
      }));
    }, 600);
  };

  const onSelectThread = (id) => {
    setActiveThread(id);
    if (active === "home") setActive("inbox");
  };

  const onOpenCustomer = (id) => {
    setActiveCustomer(id);
    setActive("customer");
  };

  const accent = window.PT_ACCENTS[t.accent] || window.PT_ACCENTS.acid;
  const sectionLabel = ({
    home: "Dashboard", inbox: "Inbox", customers: "Customers",
    orders: "Orders", catalog: "Catalog", broadcasts: "Broadcasts",
    automations: "Automations", vault: "Vault", settings: "Settings",
  })[active];

  const showRail = t.rightRail && active === "home"; // inbox has its own rail

  return (
    <div className={`pt-root pt-th-${t.theme} pt-d-${t.density} ${showRail ? "" : "no-right"} ${active === "inbox" ? "is-inbox" : ""}`}
         style={{ "--pt-accent-h": accent.h }}>
      <PtSidebar active={active} onNav={setActive} density={t.density} />
      <main className="pt-main">
        <PtTopBar
          section={sectionLabel}
          rightOpen={t.rightRail}
          onRightToggle={() => setTweak("rightRail", !t.rightRail)}
        />

        {active === "home" && (
          <div className="pt-page">
            <div className="pt-page-hd">
              <div>
                <h1>Tuesday afternoon, dr_peptide.</h1>
                <p>23 active threads · 7 need a reply · 3 reorders due in &lt;48h</p>
              </div>
              <div className="pt-page-actions">
                <button className="pt-btn pt-btn-ghost">Daily summary</button>
                <button className="pt-btn pt-btn-primary" onClick={() => setActive("broadcasts")}>
                  <window.I.send size={12}/> New broadcast
                </button>
              </div>
            </div>

            <PtKpiRow />

            <div className="pt-grid">
              <PtInboxCard
                threads={window.PT_THREADS}
                activeId={activeThread}
                onSelect={onSelectThread}
              />
              <PtPaymentsCard payments={payments} onConfirm={onConfirm} />
              <PtRevenueCard data={window.PT_REVENUE_7D} />
              <PtReordersCard reorders={window.PT_REORDERS} />
              <PtStockCard products={window.PT_PRODUCTS} />
              <PtShipmentsCard shipments={window.PT_SHIPMENTS} />
            </div>

            <footer className="pt-foot">
              <span className="mono">v0.4.2 · last sync 14s ago</span>
              <span className="pt-foot-mid">For research use only · Not for human consumption.</span>
              <span className="mono">⌘K to search · ⌘N new msg</span>
            </footer>
          </div>
        )}

        {active === "inbox" && (
          <PtInboxView
            threads={window.PT_THREADS}
            activeId={activeThread}
            onSelect={setActiveThread}
            messagesById={messages}
            onSend={onSend}
            onBack={() => setActive("home")}
          />
        )}

        {active === "broadcasts" && (
          <PtBroadcastView onBack={() => setActive("home")} />
        )}

        {active === "catalog" && (
          <PtCatalogView />
        )}

        {active === "orders" && (
          <PtOrdersView />
        )}

        {active === "vault" && (
          <PtVaultView />
        )}

        {active === "automations" && (
          <PtAutomationsView />
        )}

        {active === "settings" && (
          <PtSettingsView />
        )}

        {active === "customer" && (
          <PtCustomerView
            customerId={activeCustomer || "t01"}
            onBack={() => setActive("home")}
            onMessage={(id) => { setActiveThread(id); setActive("inbox"); }}
          />
        )}

        {active === "customers" && (
          <div className="pt-page">
            <div className="pt-page-hd">
              <div><h1>Customers</h1><p>Click a name to open detail.</p></div>
            </div>
            <div className="pt-grid" style={{gridTemplateColumns:"1fr"}}>
              <section className="pt-card">
                <div className="pt-card-body">
                  <ul className="pt-thread-list">
                    {window.PT_THREADS.map((tt) => (
                      <li key={tt.id} className="pt-thread" onClick={() => onOpenCustomer(tt.id)}>
                        <div className="pt-thread-av" data-channel={tt.channel}>
                          {(tt.name.match(/[A-Z]/g)||[tt.name[0]]).slice(0,2).join("")}
                        </div>
                        <div className="pt-thread-mid">
                          <div className="pt-thread-row1"><span className="pt-thread-name">{tt.name}</span></div>
                          <div className="pt-thread-snip">LTV ${tt.ltv} · last {tt.lastOrder} · trust {tt.trust}</div>
                        </div>
                        <div className="pt-thread-meta">
                          <div className={`pt-trust-pill pt-trust-${tt.trust>=85?"hi":tt.trust>=65?"md":"lo"}`}>{tt.trust}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>
          </div>
        )}

        {active !== "home" && active !== "inbox" && active !== "broadcasts" && active !== "customer" && active !== "customers" && active !== "orders" && active !== "catalog" && active !== "vault" && active !== "automations" && active !== "settings" && (
          <div className="pt-page">
            <div className="pt-empty">
              <div className="pt-empty-mark">{sectionLabel}</div>
              <div className="pt-empty-cap">Wired in dashboard, inbox & broadcast prototypes. Try <b>Dashboard</b>, <b>Inbox</b>, or <b>Broadcasts</b>.</div>
              <button className="pt-btn pt-btn-primary" onClick={() => setActive("home")}>← Back to dashboard</button>
            </div>
          </div>
        )}
      </main>

      {showRail && (
        <PtRightRail activeThread={activeThread} threads={window.PT_THREADS} onOpenCustomer={onOpenCustomer} />
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme" />
        <TweakRadio label="Mode" value={t.theme}
          options={[{value:"light",label:"Light"},{value:"dim",label:"Dim"},{value:"dark",label:"Dark"}]}
          onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label="Accent" value={t.accent}
          options={[
            {value:"acid",label:"Acid"},
            {value:"cobalt",label:"Cobalt"},
            {value:"ember",label:"Ember"},
            {value:"violet",label:"Violet"},
          ]}
          onChange={(v) => setTweak("accent", v)} />

        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density}
          options={[{value:"compact",label:"Compact"},{value:"regular",label:"Regular"},{value:"comfy",label:"Comfy"}]}
          onChange={(v) => setTweak("density", v)} />
        <TweakToggle label="Right rail (dashboard)" value={t.rightRail}
          onChange={(v) => setTweak("rightRail", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<PtApp />);
