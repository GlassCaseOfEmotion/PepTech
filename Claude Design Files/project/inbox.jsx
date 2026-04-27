// inbox.jsx — full Inbox view: thread list / conversation / customer rail

function PtInboxView({ threads, activeId, onSelect, messagesById, onSend, onBack }) {
  const t = threads.find((x) => x.id === activeId) || threads[0];
  const [filter, setFilter] = React.useState("all");
  const filters = [
    { id: "all", label: "All", count: threads.length },
    { id: "needs_reply", label: "Needs reply", count: threads.filter((x) => x.status === "needs_reply").length },
    { id: "new", label: "New", count: threads.filter((x) => x.status === "new").length },
    { id: "snoozed", label: "Snoozed", count: threads.filter((x) => x.status === "snoozed").length },
  ];
  const list = filter === "all" ? threads : threads.filter((x) => x.status === filter);

  return (
    <div className="pt-inbox" data-screen-label="Inbox">
      <PtThreadColumn
        threads={list}
        activeId={t.id}
        onSelect={onSelect}
        filter={filter}
        setFilter={setFilter}
        filters={filters}
        onBack={onBack}
      />
      <PtConversation thread={t} messages={messagesById[t.id] || []} onSend={onSend} />
      <PtConversationRail thread={t} />
    </div>
  );
}

// ─── Thread column ──────────────────────────────────────────────────────────
function PtThreadColumn({ threads, activeId, onSelect, filter, setFilter, filters, onBack }) {
  return (
    <div className="pt-ix-list">
      <div className="pt-ix-list-hd">
        <button className="pt-ix-back" onClick={onBack} title="Back to dashboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6"/>
          </svg>
        </button>
        <span className="pt-ix-list-title">Inbox</span>
        <button className="pt-iconbtn" title="Filter"><window.I.filter size={13}/></button>
        <button className="pt-iconbtn" title="Compose"><window.I.plus size={13}/></button>
      </div>
      <div className="pt-ix-search">
        <window.I.search size={12} />
        <input placeholder="search threads, names, txids…" />
        <kbd>⌘F</kbd>
      </div>
      <div className="pt-ix-filters">
        {filters.map((f) => (
          <button key={f.id}
                  className={`pt-pill ${filter === f.id ? "is-on" : ""}`}
                  onClick={() => setFilter(f.id)}>
            {f.label}
            <span className="pt-pill-num">{f.count}</span>
          </button>
        ))}
      </div>
      <ul className="pt-ix-threads">
        {threads.map((t) => <PtIxThread key={t.id} t={t} active={t.id === activeId} onClick={() => onSelect(t.id)} />)}
      </ul>
    </div>
  );
}

function PtIxThread({ t, active, onClick }) {
  const Ch = window.I[t.channel];
  return (
    <li className={`pt-ixt ${active ? "is-active" : ""} ${t.unread ? "is-unread" : ""}`}
        onClick={onClick}>
      <div className="pt-ixt-av" data-channel={t.channel}>
        <span>{(t.name.match(/[A-Z]/g) || [t.name[0]]).slice(0,2).join("")}</span>
        <i className={`pt-thread-ch pt-ch-${t.channel}`}><Ch size={9} /></i>
      </div>
      <div className="pt-ixt-mid">
        <div className="pt-ixt-row1">
          <span className="pt-ixt-name">{t.name}</span>
          <span className="pt-ixt-time mono">{fmtMins(t.minsAgo)}</span>
        </div>
        <div className="pt-ixt-row2">
          <span className="pt-ixt-snip">{t.snippet}</span>
          {t.unread > 0 && <span className="pt-thread-unread">{t.unread}</span>}
        </div>
        <div className="pt-ixt-row3">
          {t.tags.includes("vip") && <span className="pt-tag pt-tag-vip">VIP</span>}
          {t.tags.includes("new") && <span className="pt-tag pt-tag-new">new</span>}
          {t.tags.includes("waitlist") && <span className="pt-tag">waitlist</span>}
          {t.tags.includes("payment") && <span className="pt-tag pt-tag-warn">payment</span>}
          {t.tags.includes("repeat") && !t.tags.includes("vip") && <span className="pt-tag pt-tag-soft">repeat</span>}
          {t.tags.includes("shipping") && <span className="pt-tag pt-tag-soft">shipping</span>}
          {t.tags.includes("reorder") && <span className="pt-tag pt-tag-soft">reorder</span>}
          <span className="pt-ixt-trust mono">trust {t.trust}</span>
        </div>
      </div>
    </li>
  );
}

// ─── Conversation pane ──────────────────────────────────────────────────────
function PtConversation({ thread, messages, onSend }) {
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread.id, messages.length]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    onSend(thread.id, text);
    setDraft("");
    setTimeout(() => setSending(false), 400);
  };

  const Ch = window.I[thread.channel];
  const channelName = ({ wa: "WhatsApp", tg: "Telegram", em: "Email" })[thread.channel];

  return (
    <div className={`pt-ix-conv pt-ix-${thread.channel}`}>
      <div className="pt-ix-conv-hd">
        <div className="pt-ix-conv-id">
          <div className="pt-ixt-av" data-channel={thread.channel}>
            <span>{(thread.name.match(/[A-Z]/g) || [thread.name[0]]).slice(0,2).join("")}</span>
            <i className={`pt-thread-ch pt-ch-${thread.channel}`}><Ch size={9} /></i>
          </div>
          <div>
            <div className="pt-ix-conv-name">{thread.name}</div>
            <div className="pt-ix-conv-meta">
              <span className="mono">{thread.handle}</span>
              <span className="pt-dot pt-dot-cool"/>
              <span>{channelName}</span>
              <span className="pt-dot pt-dot-cool"/>
              <span><i className="pt-dot pt-dot-ok"/> e2e encrypted</span>
            </div>
          </div>
        </div>
        <div className="pt-ix-conv-actions">
          <button className="pt-btn pt-btn-ghost"><window.I.clock size={12}/> Snooze</button>
          <button className="pt-btn pt-btn-ghost"><window.I.check size={12}/> Mark done</button>
          <button className="pt-iconbtn"><window.I.more size={14}/></button>
        </div>
      </div>

      <div ref={scrollRef} className="pt-ix-stream">
        <div className="pt-ix-day">Apr 18, 2026</div>
        {messages.map((m) => <PtBubble key={m.id} m={m} channel={thread.channel} />)}
        <div className="pt-ix-typing">
          <span className="pt-typing-dot"/><span className="pt-typing-dot"/><span className="pt-typing-dot"/>
          <span className="pt-typing-lbl">{thread.name.split(" ")[0]} is typing…</span>
        </div>
      </div>

      <PtComposer
        thread={thread}
        draft={draft}
        setDraft={setDraft}
        onSend={send}
        sending={sending}
      />
    </div>
  );
}

function PtBubble({ m, channel }) {
  if (m.kind === "wallet") {
    return (
      <div className={`pt-bubble pt-bubble-${m.from} pt-bubble-card`}>
        <div className="pt-cardbubble">
          <div className="pt-cardbubble-hd">
            <span className="pt-cardbubble-asset">USDT · TRC20</span>
            <span className="pt-cardbubble-amt mono">$330.00</span>
          </div>
          <div className="pt-cardbubble-addr mono">T9XbnH4kQ4fM2pLrGv8WqRcXm6tPxJjN8a</div>
          <div className="pt-cardbubble-actions">
            <button className="pt-btn pt-btn-ghost">Copy</button>
            <button className="pt-btn pt-btn-ghost">QR</button>
          </div>
        </div>
        <div className="pt-bubble-meta">{m.at}</div>
      </div>
    );
  }
  if (m.kind === "tx") {
    return (
      <div className={`pt-bubble pt-bubble-${m.from}`}>
        <div className="pt-tx">
          <div className="pt-tx-row">
            <span className="pt-tx-asset">USDT</span>
            <span className="pt-tx-id mono">0xb39…e21</span>
            <span className="pt-tx-state"><i className="pt-dot pt-dot-warn"/> 2/3 conf</span>
          </div>
        </div>
        <div className="pt-bubble-meta">{m.at} · pending</div>
      </div>
    );
  }
  return (
    <div className={`pt-bubble pt-bubble-${m.from} ${m.optimistic ? "is-optimistic" : ""}`}>
      <div className="pt-bubble-text">{m.text}</div>
      <div className="pt-bubble-meta">
        {m.at} {m.optimistic && <span className="pt-bubble-pending">· sending…</span>}
        {m.from === "me" && !m.optimistic && <span className="pt-bubble-read">· read</span>}
      </div>
    </div>
  );
}

// ─── Composer ───────────────────────────────────────────────────────────────
function PtComposer({ thread, draft, setDraft, onSend, sending }) {
  const taRef = React.useRef(null);
  const onKey = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSend(); }
  };
  const insertQR = (id) => {
    const text = window.PT_QUICK_TEXT[id] || "";
    if (!text) return;
    setDraft((d) => d ? d + "\n\n" + text : text);
    setTimeout(() => taRef.current && taRef.current.focus(), 0);
  };

  return (
    <div className="pt-ix-composer">
      <div className="pt-quicks pt-quicks-bar">
        <span className="pt-quicks-lbl">Quick</span>
        {window.PT_QUICK_REPLIES.slice(0, 5).map((q) => (
          <button key={q.id} className="pt-quick" onClick={() => insertQR(q.id)}>
            {q.label}
          </button>
        ))}
        <button className="pt-quick pt-quick-more">+3 more</button>
      </div>
      <div className="pt-composer-field">
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={`Message ${thread.name} via ${({wa:"WhatsApp",tg:"Telegram",em:"Email"})[thread.channel]}…`}
          rows={3}
        />
        <div className="pt-composer-tools">
          <div className="pt-composer-l">
            <button className="pt-iconbtn" title="Attach"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-2.8-2.8L15 8.5"/></svg></button>
            <button className="pt-iconbtn" title="Drop COA / file"><window.I.flask size={14}/></button>
            <button className="pt-iconbtn" title="Send wallet"><window.I.vault size={14}/></button>
            <span className="pt-composer-sep"/>
            <button className="pt-tag pt-tag-soft" title="Templates">{`{{ template }}`}</button>
          </div>
          <div className="pt-composer-r">
            <span className="pt-composer-hint">⌘↵ to send</span>
            <button className={`pt-btn pt-btn-primary ${sending ? "is-sending" : ""}`}
                    onClick={onSend} disabled={!draft.trim()}>
              <window.I.send size={12}/> Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Right rail (richer than dashboard's) ───────────────────────────────────
function PtConversationRail({ thread }) {
  return (
    <aside className="pt-ix-rail">
      <PtCustomerCard t={thread} />

      <div className="pt-right-section">
        <div className="pt-right-hd"><span>Open order</span><button className="pt-link">Order →</button></div>
        <div className="pt-rail-order">
          <div className="pt-rail-order-row">
            <span className="mono pt-rail-order-id">#A-2241</span>
            <span className="pt-tag pt-tag-warn">awaiting payment</span>
          </div>
          <ul className="pt-rail-items">
            <li>
              <span>Retatrutide 10mg</span>
              <span className="mono">×2</span>
              <span className="mono">$330</span>
            </li>
          </ul>
          <div className="pt-rail-order-meta">
            <div><span className="lbl">Lot</span><span className="mono">L24-131</span></div>
            <div><span className="lbl">Ship to</span><span>same as #A-2188</span></div>
          </div>
          <div className="pt-rail-order-pay">
            <div className="pt-rail-pay-row">
              <span className="pt-pay-asset" data-asset="USDT">USDT</span>
              <div className="pt-rail-pay-mid">
                <div className="pt-rail-pay-state">2/3 confirmations · 4m ago</div>
                <div className="pt-confbar"><div className="pt-confbar-fill" style={{width:"66%"}}/></div>
              </div>
              <button className="pt-btn pt-btn-primary pt-btn-sm">Mark paid</button>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-right-section">
        <div className="pt-right-hd"><span>Notes</span><button className="pt-right-add"><window.I.plus size={11}/></button></div>
        <div className="pt-rail-note">
          <div className="pt-rail-note-meta">3w ago</div>
          <div>prefers tues/thurs ship. uses signal if WA goes down — handle <span className="mono">@gymrat84</span></div>
        </div>
        <div className="pt-rail-note">
          <div className="pt-rail-note-meta">2mo ago</div>
          <div>asked about tirz/reta stack. sent dosing protocol v2.</div>
        </div>
      </div>

      <div className="pt-right-section">
        <div className="pt-right-hd"><span>Activity</span></div>
        <ul className="pt-rail-activity">
          <li><i className="pt-act-dot pt-bul-cool"/><div><b>Order placed</b> · #A-2241 · $330<div className="pt-act-time">11:38 today</div></div></li>
          <li><i className="pt-act-dot"/><div><b>Tag added</b> · vip<div className="pt-act-time">2d ago</div></div></li>
          <li><i className="pt-act-dot pt-bul-warn"/><div><b>Reorder ping sent</b><div className="pt-act-time">11d ago</div></div></li>
          <li><i className="pt-act-dot"/><div><b>Order delivered</b> · #A-2188<div className="pt-act-time">14d ago</div></div></li>
        </ul>
      </div>
    </aside>
  );
}

Object.assign(window, { PtInboxView });
