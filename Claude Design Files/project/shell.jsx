// shell.jsx — App shell: sidebar + topbar

const NAV_PRIMARY = [
  { id: "home",      label: "Dashboard",  icon: "spark",  badge: null },
  { id: "inbox",     label: "Inbox",      icon: "inbox",  badge: 7 },
  { id: "customers", label: "Customers",  icon: "users",  badge: null },
  { id: "orders",    label: "Orders",     icon: "box",    badge: 3 },
  { id: "catalog",   label: "Catalog",    icon: "flask",  badge: null },
  { id: "broadcasts",label: "Broadcasts", icon: "send",   badge: null },
  { id: "automations",label:"Automations",icon: "zap",    badge: null },
];
const NAV_SECONDARY = [
  { id: "vault",     label: "Vault",      icon: "vault",  badge: null },
  { id: "settings",  label: "Settings",   icon: "gear",   badge: null },
];

function PtSidebar({ active, onNav, density }) {
  const Item = ({ n }) => {
    const Ic = window.I[n.icon];
    const on = active === n.id;
    return (
      <button className={`pt-nav-item ${on ? "is-on" : ""}`} onClick={() => onNav(n.id)}>
        <Ic size={15} />
        <span className="pt-nav-label">{n.label}</span>
        {n.badge != null && <span className="pt-nav-badge">{n.badge}</span>}
      </button>
    );
  };

  return (
    <aside className="pt-sidebar">
      <div className="pt-brand">
        <div className="pt-brand-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path d="M3 10.5 7 5.5h6l4 5-4 5H7l-4-5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <circle cx="10" cy="10.5" r="2" fill="currentColor"/>
          </svg>
        </div>
        <div className="pt-brand-name">Peptech<span>.</span></div>
        <button className="pt-brand-menu" title="Workspace">
          <window.I.arrowDn size={12} />
        </button>
      </div>

      <button className="pt-compose">
        <window.I.plus size={13} />
        <span>New message</span>
        <kbd>C</kbd>
      </button>

      <button className="pt-search">
        <window.I.search size={13} />
        <span>Search…</span>
        <kbd>⌘K</kbd>
      </button>

      <nav className="pt-nav">
        {NAV_PRIMARY.map((n) => <Item key={n.id} n={n} />)}
        <div className="pt-nav-sep" />
        <div className="pt-nav-section">Pinned threads</div>
        <PtPinnedThread name="K. (gymrat_84)" snip="paid usdt — confirming" channel="wa" unread={2} />
        <PtPinnedThread name="swolepriest"     snip="tirz back in stock?"   channel="tg" unread={3} />
        <div className="pt-nav-sep" />
        {NAV_SECONDARY.map((n) => <Item key={n.id} n={n} />)}
      </nav>

      <div className="pt-side-foot">
        <div className="pt-me">
          <div className="pt-me-av">DR</div>
          <div className="pt-me-info">
            <div className="pt-me-name">dr_peptide</div>
            <div className="pt-me-status"><i className="pt-dot" /> online · 2 channels</div>
          </div>
          <button className="pt-me-more"><window.I.more size={14}/></button>
        </div>
      </div>
    </aside>
  );
}

function PtPinnedThread({ name, snip, channel, unread }) {
  const Ch = window.I[channel];
  return (
    <button className="pt-pin">
      <Ch size={11} />
      <div className="pt-pin-body">
        <div className="pt-pin-name">{name}</div>
        <div className="pt-pin-snip">{snip}</div>
      </div>
      {unread > 0 && <span className="pt-pin-unread">{unread}</span>}
    </button>
  );
}

function PtTopBar({ section, onLayoutToggle, layoutCompact, rightOpen, onRightToggle }) {
  return (
    <header className="pt-top">
      <div className="pt-top-crumbs">
        <span className="pt-crumb-home">Workspace</span>
        <span className="pt-crumb-sep">/</span>
        <span className="pt-crumb-now">{section}</span>
      </div>
      <div className="pt-top-mid">
        <PtChannelChip channel="wa" label="WhatsApp" status="ok"/>
        <PtChannelChip channel="tg" label="Telegram" status="ok"/>
        <PtChannelChip channel="em" label="Email"    status="ok"/>
      </div>
      <div className="pt-top-actions">
        <button className="pt-iconbtn" title="Filter"><window.I.filter size={14}/></button>
        <button className="pt-iconbtn" title="Notifications">
          <window.I.bell size={14}/>
          <span className="pt-iconbtn-dot" />
        </button>
        <button className={`pt-iconbtn ${rightOpen ? "is-on" : ""}`}
                title="Toggle right panel" onClick={onRightToggle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2"/>
            <line x1="15" y1="4" x2="15" y2="20"/>
          </svg>
        </button>
        <span className="pt-top-divider"/>
        <button className="pt-cta">Reload catalog</button>
      </div>
    </header>
  );
}

function PtChannelChip({ channel, label, status }) {
  const Ch = window.I[channel];
  return (
    <div className={`pt-chip pt-chip-${channel}`}>
      <Ch size={12} />
      <span>{label}</span>
      <i className={`pt-chip-dot pt-chip-${status}`} />
    </div>
  );
}

Object.assign(window, { PtSidebar, PtTopBar });
