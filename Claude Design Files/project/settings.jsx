// settings.jsx — Settings with Channels, Wallets, Profile (full) and stubs for the rest

const PT_SETTINGS_SECTIONS = [
  { id: "profile",    label: "Profile",        icon: "user",      built: true },
  { id: "channels",   label: "Channels",       icon: "hash",      built: true },
  { id: "wallets",    label: "Wallets & assets", icon: "wallet",  built: true },
  { id: "trust",      label: "Trust & risk",   icon: "shield",    built: false },
  { id: "inventory",  label: "Inventory defaults", icon: "box",   built: false },
  { id: "notifications", label: "Notifications", icon: "bell",    built: false },
  { id: "templates",  label: "Message templates", icon: "doc",    built: false },
  { id: "devices",    label: "Devices & sessions", icon: "lock",  built: false },
  { id: "billing",    label: "Plan & billing", icon: "card",      built: false },
];

const PT_CHANNELS = [
  { id: "signal", name: "Signal", handle: "+1 415 ••• 7421", status: "connected", lastSync: "Just now", autoReply: "review", workingHours: "07:00–22:00", color: "oklch(0.55 0.16 245)", initial: "S" },
  { id: "telegram", name: "Telegram", handle: "@peptech_ops", status: "connected", lastSync: "12s ago", autoReply: "review", workingHours: "07:00–22:00", color: "oklch(0.62 0.13 230)", initial: "T" },
  { id: "session", name: "Session", handle: "05f4…a91c", status: "connected", lastSync: "2m ago", autoReply: "manual", workingHours: "Always on", color: "oklch(0.45 0.04 270)", initial: "Ⓢ" },
  { id: "simplex", name: "SimpleX", handle: "Not connected", status: "disconnected", lastSync: "—", autoReply: "off", workingHours: "—", color: "oklch(0.50 0.05 30)", initial: "X" },
  { id: "wickr",   name: "Wickr",   handle: "Deprecated upstream", status: "deprecated", lastSync: "Apr 2", autoReply: "off", workingHours: "—", color: "oklch(0.50 0.05 100)", initial: "W" },
];

const PT_ASSETS_DEFAULT = [
  { id: "usdt", asset: "USDT", chain: "TRC20", enabled: true, confirmations: 12, autoRotate: 10, color: "oklch(0.62 0.13 145)" },
  { id: "btc",  asset: "BTC",  chain: "Mainnet", enabled: true, confirmations: 3, autoRotate: 8,  color: "oklch(0.66 0.14 60)" },
  { id: "xmr",  asset: "XMR",  chain: "Mainnet", enabled: true, confirmations: 10, autoRotate: 5, color: "oklch(0.55 0.05 30)" },
  { id: "cash", asset: "Cash", chain: "Meet",  enabled: true, confirmations: 0,  autoRotate: 0,  color: "oklch(0.50 0.03 100)" },
  { id: "bank", asset: "Bank", chain: "Wire/SEPA", enabled: false, confirmations: 1, autoRotate: 0, color: "oklch(0.50 0.08 250)" },
];

function PtSettingsView() {
  const [section, setSection] = React.useState("profile");
  const sect = PT_SETTINGS_SECTIONS.find((s) => s.id === section);

  return (
    <div className="pt-st" data-screen-label="Settings">
      <div className="pt-st-hd">
        <div>
          <h1>Settings</h1>
          <p>Account, channels, wallets, and operator preferences.</p>
        </div>
      </div>

      <div className="pt-st-body">
        {/* Left rail */}
        <aside className="pt-st-rail">
          <ul>
            {PT_SETTINGS_SECTIONS.map((s) => {
              const Icon = window.I[s.icon] || window.I.dot;
              return (
                <li key={s.id}
                    className={`pt-st-rail-item ${section === s.id ? "is-active" : ""} ${!s.built ? "is-stub" : ""}`}
                    onClick={() => setSection(s.id)}>
                  <Icon size={13}/>
                  <span>{s.label}</span>
                  {!s.built && <em>soon</em>}
                </li>
              );
            })}
          </ul>
          <div className="pt-st-rail-foot">
            <div className="pt-st-rail-acct">
              <div className="pt-st-rail-av">AB</div>
              <div>
                <div className="pt-st-rail-name">Alex B.</div>
                <div className="pt-st-rail-plan">Operator · Pro</div>
              </div>
            </div>
            <button className="pt-st-rail-signout">Sign out</button>
          </div>
        </aside>

        {/* Right pane */}
        <div className="pt-st-pane">
          {section === "profile"  && <PtSettingsProfile/>}
          {section === "channels" && <PtSettingsChannels/>}
          {section === "wallets"  && <PtSettingsWallets/>}
          {!sect.built && <PtSettingsStub label={sect.label}/>}
        </div>
      </div>
    </div>
  );
}

/* ─── Profile ─── */
function PtSettingsProfile() {
  const [tz, setTz] = React.useState("Europe/Lisbon");
  const [digestTime, setDigestTime] = React.useState("08:00");
  const [autoLock, setAutoLock] = React.useState(15);

  return (
    <div className="pt-st-section">
      <PtStHd title="Profile" caption="Operator identity, timezone, and session security."/>

      <PtStCard title="Identity">
        <div className="pt-st-profile-id">
          <div className="pt-st-av-lg">AB</div>
          <div className="pt-st-profile-id-fields">
            <PtStField label="Display name">
              <input className="pt-st-input" defaultValue="Alex B."/>
            </PtStField>
            <PtStField label="Operator handle" hint="Shown to customers as the sender of automated DMs.">
              <input className="pt-st-input" defaultValue="@peptech_ops"/>
            </PtStField>
          </div>
        </div>
      </PtStCard>

      <PtStCard title="Time & locale" caption="Drives daily digest timing and message timestamps.">
        <PtStField label="Timezone">
          <select className="pt-st-input" value={tz} onChange={(e)=>setTz(e.target.value)}>
            <option>Europe/Lisbon</option>
            <option>Europe/London</option>
            <option>America/New_York</option>
            <option>America/Los_Angeles</option>
            <option>Asia/Bangkok</option>
            <option>UTC</option>
          </select>
        </PtStField>
        <PtStField label="Daily digest time" hint="Used by the “Daily digest” automation.">
          <input className="pt-st-input" type="time" value={digestTime} onChange={(e)=>setDigestTime(e.target.value)}/>
        </PtStField>
      </PtStCard>

      <PtStCard title="Session security" caption="Session locks automatically after inactivity.">
        <PtStField label={`Auto-lock after ${autoLock}m`}>
          <input className="pt-st-range" type="range" min="2" max="60" step="1"
                 value={autoLock} onChange={(e)=>setAutoLock(+e.target.value)}/>
        </PtStField>
        <PtStField label="Panic logout shortcut" hint="Triple-press Esc to clear all decrypted state and lock.">
          <PtStToggle defaultOn={true}/>
        </PtStField>
      </PtStCard>

      <div className="pt-st-foot">
        <span className="pt-st-foot-status"><i/> Saved 3m ago</span>
        <div className="pt-st-foot-actions">
          <button className="pt-btn pt-btn-ghost">Discard</button>
          <button className="pt-btn pt-btn-primary">Save changes</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Channels ─── */
function PtSettingsChannels() {
  const [chans, setChans] = React.useState(PT_CHANNELS);

  const updateChan = (id, patch) =>
    setChans((arr) => arr.map((c) => c.id === id ? { ...c, ...patch } : c));

  return (
    <div className="pt-st-section">
      <PtStHd title="Channels" caption="Inbound message channels — connect, configure, or rotate."
              right={<button className="pt-btn pt-btn-primary"><window.I.plus size={12}/> Add channel</button>}/>

      <PtStCard title="Connected channels" caption="Auto-reply mode controls whether automations send directly or queue for review.">
        <ul className="pt-st-chans">
          {chans.map((c) => (
            <li key={c.id} className={`pt-st-chan pt-st-chan-${c.status}`}>
              <div className="pt-st-chan-l">
                <div className="pt-st-chan-icon" style={{background: c.color}}>{c.initial}</div>
                <div>
                  <div className="pt-st-chan-name">
                    {c.name}
                    <span className={`pt-st-chan-pill pt-st-chan-pill-${c.status}`}>
                      <i/> {c.status === "connected" ? "Connected" : c.status === "deprecated" ? "Deprecated" : "Not connected"}
                    </span>
                  </div>
                  <div className="pt-st-chan-handle mono">{c.handle}</div>
                  <div className="pt-st-chan-meta">Last sync {c.lastSync} · Hours {c.workingHours}</div>
                </div>
              </div>

              <div className="pt-st-chan-r">
                {c.status === "connected" && (
                  <div className="pt-st-chan-mode">
                    <span className="pt-st-chan-mode-lbl">Auto-reply</span>
                    <div className="pt-st-seg">
                      {[
                        { id: "off", label: "Off" },
                        { id: "review", label: "Queue for review" },
                        { id: "auto", label: "Send" },
                      ].map((m) => (
                        <button key={m.id}
                          className={`pt-st-seg-btn ${c.autoReply === m.id ? "is-active" : ""}`}
                          onClick={() => updateChan(c.id, { autoReply: m.id })}>{m.label}</button>
                      ))}
                    </div>
                  </div>
                )}
                {c.status === "connected" && (
                  <div className="pt-st-chan-actions">
                    <button className="pt-st-mini">Rotate keys</button>
                    <button className="pt-st-mini pt-st-mini-warn">Disconnect</button>
                  </div>
                )}
                {c.status === "disconnected" && (
                  <button className="pt-btn pt-btn-ghost">Connect</button>
                )}
                {c.status === "deprecated" && (
                  <button className="pt-st-mini pt-st-mini-warn">Remove</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </PtStCard>

      <PtStCard title="Working hours" caption="Outside these hours, automations queue messages and send the next morning.">
        <PtStField label="Active window">
          <div style={{display:"flex", gap:8, alignItems:"center"}}>
            <input className="pt-st-input" type="time" defaultValue="07:00" style={{maxWidth:120}}/>
            <span style={{color:"var(--pt-fg-4)", fontSize:12}}>to</span>
            <input className="pt-st-input" type="time" defaultValue="22:00" style={{maxWidth:120}}/>
          </div>
        </PtStField>
        <PtStField label="Honor working hours" hint="Off = automations send 24/7 regardless of channel hours.">
          <PtStToggle defaultOn={true}/>
        </PtStField>
      </PtStCard>

      <div className="pt-st-foot">
        <span className="pt-st-foot-status"><i/> Saved automatically</span>
      </div>
    </div>
  );
}

/* ─── Wallets & assets ─── */
function PtSettingsWallets() {
  const [assets, setAssets] = React.useState(PT_ASSETS_DEFAULT);

  const update = (id, patch) =>
    setAssets((arr) => arr.map((a) => a.id === id ? { ...a, ...patch } : a));

  return (
    <div className="pt-st-section">
      <PtStHd title="Wallets & assets" caption="Which assets you accept and how confirmations gate orders."/>

      <PtStCard title="Accepted assets" caption="Toggle off to hide an asset from new-order payment instructions.">
        <ul className="pt-st-assets">
          {assets.map((a) => (
            <li key={a.id} className={`pt-st-asset ${!a.enabled ? "is-disabled" : ""}`}>
              <div className="pt-st-asset-l">
                <span className="pt-pay-asset" data-asset={a.asset === "Bank" ? "USDT" : a.asset} style={{minWidth:46, textAlign:"center"}}>{a.asset}</span>
                <div>
                  <div className="pt-st-asset-name">{a.asset === "Bank" ? "Bank transfer" : a.asset === "Cash" ? "Cash (in person)" : a.asset}</div>
                  <div className="pt-st-asset-chain">{a.chain}</div>
                </div>
              </div>

              <div className="pt-st-asset-mid">
                {a.asset !== "Cash" && (
                  <PtStField label={a.asset === "Bank" ? "Required statements" : "Confirmations to gate orders"} compact>
                    <input className="pt-st-input pt-st-input-sm" type="number" min="0" max="50"
                      value={a.confirmations}
                      onChange={(e)=>update(a.id, { confirmations: +e.target.value })}/>
                  </PtStField>
                )}
                {!["Cash","Bank"].includes(a.asset) && (
                  <PtStField label="Auto-rotate after" compact>
                    <div style={{display:"flex", alignItems:"center", gap:6}}>
                      <input className="pt-st-input pt-st-input-sm" type="number" min="0" max="50"
                        value={a.autoRotate}
                        onChange={(e)=>update(a.id, { autoRotate: +e.target.value })}/>
                      <span style={{fontSize:11, color:"var(--pt-fg-4)"}}>receipts</span>
                    </div>
                  </PtStField>
                )}
                {a.asset === "Cash" && <div className="pt-st-asset-note">Logged manually after meet · no chain confirmations</div>}
                {a.asset === "Bank" && <div className="pt-st-asset-note">SEPA/ACH inbound · matched by reference</div>}
              </div>

              <div className="pt-st-asset-r">
                <PtStToggle on={a.enabled} onChange={(on) => update(a.id, { enabled: on })}/>
              </div>
            </li>
          ))}
        </ul>
      </PtStCard>

      <PtStCard title="Bank transfer details" caption="Shown to customers when bank transfer is selected.">
        <PtStField label="Account holder">
          <input className="pt-st-input" defaultValue="Peptech LLC"/>
        </PtStField>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
          <PtStField label="IBAN">
            <input className="pt-st-input mono" defaultValue="PT50 0035 0000 0123 4567 8901 5"/>
          </PtStField>
          <PtStField label="BIC / SWIFT">
            <input className="pt-st-input mono" defaultValue="CGDIPTPL"/>
          </PtStField>
        </div>
        <PtStField label="Reference format" hint="Use {order_id} as a placeholder. Bank-transfer orders auto-match on this string.">
          <input className="pt-st-input mono" defaultValue="PT-{order_id}"/>
        </PtStField>
      </PtStCard>

      <PtStCard title="Cold storage policy" caption="Automatically sweep hot wallets to cold once they exceed a threshold.">
        <PtStField label="Sweep when hot balance exceeds">
          <div style={{display:"flex", alignItems:"center", gap:6}}>
            <span style={{fontSize:13, color:"var(--pt-fg-3)"}}>$</span>
            <input className="pt-st-input pt-st-input-sm" type="number" defaultValue="2500" style={{maxWidth:120}}/>
            <span style={{fontSize:11, color:"var(--pt-fg-4)"}}>USD equivalent</span>
          </div>
        </PtStField>
        <PtStField label="Leave in hot wallet for ops float">
          <div style={{display:"flex", alignItems:"center", gap:6}}>
            <span style={{fontSize:13, color:"var(--pt-fg-3)"}}>$</span>
            <input className="pt-st-input pt-st-input-sm" type="number" defaultValue="500" style={{maxWidth:120}}/>
          </div>
        </PtStField>
      </PtStCard>

      <div className="pt-st-foot">
        <span className="pt-st-foot-status"><i/> Saved automatically</span>
        <div className="pt-st-foot-actions">
          <button className="pt-btn pt-btn-ghost">Test confirmation gate</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Stub ─── */
function PtSettingsStub({ label }) {
  return (
    <div className="pt-st-section pt-st-stub">
      <PtStHd title={label} caption="Coming soon — not yet wired up."/>
      <div className="pt-st-stub-body">
        <div className="pt-st-stub-mark">{label}</div>
        <div className="pt-st-stub-cap">This section will land in the next iteration.</div>
      </div>
    </div>
  );
}

/* ─── Tiny shared bits ─── */
function PtStHd({ title, caption, right }) {
  return (
    <div className="pt-st-shd">
      <div>
        <h2>{title}</h2>
        {caption && <p>{caption}</p>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

function PtStCard({ title, caption, children }) {
  return (
    <section className="pt-card pt-st-card">
      <header className="pt-card-hd pt-st-card-hd">
        <div>
          <h3>{title}</h3>
          {caption && <p>{caption}</p>}
        </div>
      </header>
      <div className="pt-card-body pt-st-card-body">{children}</div>
    </section>
  );
}

function PtStField({ label, hint, children, compact }) {
  return (
    <div className={`pt-st-field ${compact ? "is-compact" : ""}`}>
      <div className="pt-st-field-l">
        <label>{label}</label>
        {hint && <p>{hint}</p>}
      </div>
      <div className="pt-st-field-r">{children}</div>
    </div>
  );
}

function PtStToggle({ defaultOn = false, on, onChange }) {
  const [state, setState] = React.useState(defaultOn);
  const isControlled = on !== undefined;
  const value = isControlled ? on : state;
  const flip = () => {
    const next = !value;
    if (!isControlled) setState(next);
    onChange && onChange(next);
  };
  return (
    <button className={`pt-au-toggle pt-au-toggle-${value ? "on" : "off"}`}
            onClick={flip}>
      <span/>
    </button>
  );
}

Object.assign(window, { PtSettingsView });
