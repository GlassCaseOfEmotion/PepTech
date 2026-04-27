// vault.jsx — Wallet ledger with multi-chain balances and address rotation

const PT_BALANCES = [
  {
    asset: "USDT", chain: "TRC20", decimals: 2,
    balance: 8420.50, balanceUsd: 8420.50,
    delta24h: +1380.00,
    spark: [6800, 7100, 6900, 7400, 7200, 7900, 8420],
    color: "oklch(0.62 0.13 145)",
  },
  {
    asset: "BTC", chain: "Mainnet", decimals: 6,
    balance: 0.418, balanceUsd: 27240.20,
    delta24h: +890.30,
    spark: [25600, 26100, 25900, 26800, 27100, 26900, 27240],
    color: "oklch(0.66 0.14 60)",
  },
  {
    asset: "XMR", chain: "Mainnet", decimals: 4,
    balance: 12.84, balanceUsd: 1944.92,
    delta24h: -42.10,
    spark: [2010, 2080, 2030, 2010, 1990, 1970, 1944],
    color: "oklch(0.55 0.05 30)",
  },
  {
    asset: "Cash", chain: "Stash", decimals: 0,
    balance: 1850, balanceUsd: 1850,
    delta24h: +200,
    spark: [1450, 1500, 1500, 1650, 1650, 1650, 1850],
    color: "oklch(0.50 0.03 100)",
  },
];

const PT_WALLETS = [
  // Hot — receiving
  { id: "w1", kind: "hot", role: "receiving", asset: "USDT", chain: "TRC20",
    addr: "TQrZ8jH2…mK4n9pX",  fullAddr: "TQrZ8jH2vN3rL5kPMXfQ7yT8mK4n9pXabc",
    balance: 1240.00, lastActivity: "4m ago", rxCount: 14, rotateIn: "soon" },
  { id: "w2", kind: "hot", role: "receiving", asset: "BTC", chain: "Mainnet",
    addr: "bc1q7x…f2k0a", fullAddr: "bc1q7xpzv5e6h3wq8jr4ld2t9c0fnvm6gk7y8z3pf2k0a",
    balance: 0.0612, lastActivity: "22m ago", rxCount: 8, rotateIn: "ok" },
  { id: "w3", kind: "hot", role: "receiving", asset: "XMR", chain: "Mainnet",
    addr: "4ABc…f2e1", fullAddr: "4ABcXdEfGhIjKlMnOpQrStUvWxYzAaBbCcDdEeFf2e1",
    balance: 2.84,  lastActivity: "1h ago", rxCount: 6, rotateIn: "ok" },

  // Cold — vault
  { id: "w4", kind: "cold", role: "vault", asset: "USDT", chain: "TRC20",
    addr: "TXq9…mP3v", fullAddr: "TXq9aBcDeFgHiJkLmNoPqRsTuVwXyZmP3v",
    balance: 7180.50, lastActivity: "Apr 14", rxCount: 0 },
  { id: "w5", kind: "cold", role: "vault", asset: "BTC", chain: "Mainnet",
    addr: "bc1p…qm8s", fullAddr: "bc1p4kx9zt2hvqmf6jrl0wn3c5gx7sbqm8s",
    balance: 0.357, lastActivity: "Apr 10", rxCount: 0 },
  { id: "w6", kind: "cold", role: "vault", asset: "XMR", chain: "Mainnet",
    addr: "8DEf…1xY9", fullAddr: "8DEfXdEfGhIjKlMnOpQrStUvWxYzAaBbCcDdEeFf1xY9",
    balance: 10.0, lastActivity: "Apr 03", rxCount: 0 },
];

const PT_LEDGER = [
  { id: "tx1", at: "13:18", date: "Today", dir: "in",  asset: "USDT", amt: 330.00,
    counterparty: "K. (gymrat_84)", custId: "t01", orderId: "A-2241",
    confirms: 8, needs: 12, txHash: "0x71c4…ae93", state: "confirming" },
  { id: "tx2", at: "12:54", date: "Today", dir: "in",  asset: "BTC",  amt: 0.0033,
    amtUsd: 220, counterparty: "T.B.", custId: "t12", orderId: "A-2243",
    confirms: 2, needs: 3,  txHash: "bc1q…0x4a", state: "confirming" },
  { id: "tx3", at: "12:11", date: "Today", dir: "in",  asset: "XMR",  amt: 1.59,
    amtUsd: 241, counterparty: "irongoblin", custId: "t09", orderId: "A-2242",
    confirms: 6, needs: 10, txHash: "4ABc…f2e1", state: "confirming" },
  { id: "tx4", at: "10:42", date: "Today", dir: "in",  asset: "USDT", amt: 220.00,
    counterparty: "ladyswole", custId: "t05", orderId: "A-2240",
    confirms: 24, needs: 12, txHash: "0x5f3a…b1c8", state: "confirmed" },
  { id: "tx5", at: "09:30", date: "Today", dir: "out", asset: "USDT", amt: 1500.00,
    counterparty: "supplier-A (re-up)", note: "Reta + Tirz lots",
    confirms: 28, needs: 12, state: "confirmed" },
  { id: "tx6", at: "08:11", date: "Today", dir: "in",  asset: "USDT", amt: 165.00,
    counterparty: "M.R.", custId: "t07", orderId: "A-2238",
    confirms: 24, needs: 12, txHash: "0x9c2b…d4f7", state: "confirmed" },
  { id: "tx7", at: "23:48", date: "Yesterday", dir: "out", asset: "BTC", amt: 0.0290,
    amtUsd: 1880, counterparty: "Cold storage rotation",
    state: "confirmed", confirms: 18, needs: 3 },
  { id: "tx8", at: "21:14", date: "Yesterday", dir: "in",  asset: "USDT", amt: 720.00,
    counterparty: "T.B. (bulk reorder)", custId: "t12", orderId: "A-2237",
    confirms: 26, needs: 12, txHash: "0x4d1e…a8c2", state: "confirmed" },
  { id: "tx9", at: "18:22", date: "Yesterday", dir: "out", asset: "USDT", amt: 2400.00,
    counterparty: "Off-ramp · Cash via meet",
    state: "confirmed", confirms: 30, needs: 12 },
  { id: "tx10", at: "16:05", date: "Yesterday", dir: "in",  asset: "USDT", amt: 480.00,
    counterparty: "swolepriest", custId: "t04", orderId: "A-2236",
    confirms: 26, needs: 12, txHash: "0x82af…91e3", state: "confirmed" },
  { id: "tx11", at: "14:33", date: "Yesterday", dir: "in",  asset: "BTC",  amt: 0.0025,
    amtUsd: 165, counterparty: "M.S.", orderId: "A-2235",
    confirms: 14, needs: 3,  txHash: "bc1q…ab12", state: "confirmed" },
  { id: "tx12", at: "11:02", date: "Apr 21", dir: "in",  asset: "USDT", amt: 152.00,
    counterparty: "Cash via meet", note: "BPC-157 ×4 (M.S.)",
    state: "confirmed", confirms: 0, needs: 0 },
];

function PtVaultView() {
  const [filter, setFilter] = React.useState("all");
  const [assetFilter, setAssetFilter] = React.useState("all");
  const [walletKind, setWalletKind] = React.useState("hot");
  const [copied, setCopied] = React.useState(null);

  const totalUsd = PT_BALANCES.reduce((s, b) => s + b.balanceUsd, 0);
  const total24h = PT_BALANCES.reduce((s, b) => s + b.delta24h, 0);

  const filteredLedger = PT_LEDGER.filter((t) => {
    if (filter === "in"  && t.dir !== "in")  return false;
    if (filter === "out" && t.dir !== "out") return false;
    if (filter === "confirming" && t.state !== "confirming") return false;
    if (assetFilter !== "all" && t.asset !== assetFilter) return false;
    return true;
  });

  // Group ledger by date
  const ledgerByDate = filteredLedger.reduce((acc, t) => {
    (acc[t.date] = acc[t.date] || []).push(t);
    return acc;
  }, {});

  const wallets = PT_WALLETS.filter((w) => w.kind === walletKind);

  const onCopy = (id, addr) => {
    if (navigator.clipboard) navigator.clipboard.writeText(addr).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="pt-vt" data-screen-label="Vault">
      <div className="pt-vt-hd">
        <div>
          <h1>Vault</h1>
          <p>${Math.round(totalUsd).toLocaleString()} on hand · {total24h >= 0 ? "+" : ""}${Math.round(total24h).toLocaleString()} 24h · {PT_LEDGER.filter((x) => x.state === "confirming").length} pending</p>
        </div>
        <div className="pt-vt-hd-actions">
          <button className="pt-btn pt-btn-ghost"><window.I.send size={12}/> Send</button>
          <button className="pt-btn pt-btn-ghost"><window.I.box size={12}/> Sweep to cold</button>
          <button className="pt-btn pt-btn-primary"><window.I.plus size={12}/> Receive</button>
        </div>
      </div>

      <div className="pt-vt-body">
        {/* ─── Asset balance strip ─── */}
        <div className="pt-vt-balances">
          {PT_BALANCES.map((b) => (
            <PtBalanceCard
              key={b.asset}
              data={b}
              isActive={assetFilter === b.asset}
              onClick={() => setAssetFilter(assetFilter === b.asset ? "all" : b.asset)}
            />
          ))}
        </div>

        <div className="pt-vt-grid">
          {/* ─── Wallets ─── */}
          <section className="pt-card pt-vt-wallets">
            <header className="pt-card-hd">
              <div>
                <h3>Wallets</h3>
                <p>{walletKind === "hot" ? "Receiving addresses · rotate after ~10 receipts" : "Cold storage · long-hold"}</p>
              </div>
              <div className="pt-vt-tabs">
                <button className={`pt-vt-tab ${walletKind === "hot"  ? "is-active" : ""}`} onClick={() => setWalletKind("hot")}>Hot</button>
                <button className={`pt-vt-tab ${walletKind === "cold" ? "is-active" : ""}`} onClick={() => setWalletKind("cold")}>Cold</button>
              </div>
            </header>
            <div className="pt-card-body">
              <ul className="pt-vt-wlist">
                {wallets.map((w) => (
                  <li key={w.id} className={`pt-vt-w pt-vt-w-${w.asset.toLowerCase()}`}>
                    <div className="pt-vt-w-id">
                      <span className="pt-pay-asset" data-asset={w.asset}>{w.asset}</span>
                      <span className="pt-vt-w-chain">{w.chain}</span>
                    </div>
                    <div className="pt-vt-w-addr">
                      <span className="mono">{w.addr}</span>
                      <button className="pt-vt-copy" onClick={() => onCopy(w.id, w.fullAddr)}
                              title={w.fullAddr}>
                        {copied === w.id
                          ? <><window.I.check size={11}/> copied</>
                          : <span>copy</span>}
                      </button>
                    </div>
                    <div className="pt-vt-w-bal">
                      <div className="mono pt-vt-w-bal-num">
                        {w.balance.toLocaleString(undefined, { maximumFractionDigits: w.asset === "BTC" ? 4 : w.asset === "XMR" ? 3 : 2 })}
                      </div>
                      <div className="pt-vt-w-bal-meta">
                        {w.kind === "hot"
                          ? <>{w.rxCount} rx · {w.lastActivity}</>
                          : <>locked · {w.lastActivity}</>}
                      </div>
                    </div>
                    {w.kind === "hot" && (
                      <div className="pt-vt-w-actions">
                        {w.rotateIn === "soon" && (
                          <span className="pt-vt-rotate-warn" title="Address used 14× — rotate soon">
                            <i/> rotate soon
                          </span>
                        )}
                        <button className="pt-vt-w-btn">Rotate</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ─── Ledger ─── */}
          <section className="pt-card pt-vt-ledger">
            <header className="pt-card-hd">
              <div>
                <h3>Ledger</h3>
                <p>{filteredLedger.length} {filteredLedger.length === 1 ? "tx" : "txs"} · {assetFilter === "all" ? "all assets" : assetFilter} {filter !== "all" ? `· ${filter}` : ""}</p>
              </div>
              <div className="pt-vt-filters">
                {[
                  { id: "all", label: "All" },
                  { id: "in", label: "In" },
                  { id: "out", label: "Out" },
                  { id: "confirming", label: "Pending" },
                ].map((f) => (
                  <button key={f.id}
                          className={`pt-vt-filter ${filter === f.id ? "is-active" : ""}`}
                          onClick={() => setFilter(f.id)}>{f.label}</button>
                ))}
              </div>
            </header>
            <div className="pt-card-body pt-vt-ledger-body">
              {Object.entries(ledgerByDate).map(([date, txs]) => (
                <div key={date} className="pt-vt-day">
                  <div className="pt-vt-day-hd">{date}</div>
                  <ul>
                    {txs.map((t) => <PtTxRow key={t.id} t={t}/>)}
                  </ul>
                </div>
              ))}
              {filteredLedger.length === 0 && (
                <div className="pt-vt-empty">No transactions match.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PtBalanceCard({ data: b, isActive, onClick }) {
  const max = Math.max(...b.spark);
  const min = Math.min(...b.spark);
  const range = max - min || 1;
  const w = 100, h = 24;
  const step = w / (b.spark.length - 1);
  const pts = b.spark.map((v, i) => `${(i*step).toFixed(1)},${(h - ((v - min) / range) * (h - 2) - 1).toFixed(1)}`).join(" ");
  const deltaPct = (b.delta24h / (b.balanceUsd - b.delta24h)) * 100;

  return (
    <button className={`pt-vt-bal ${isActive ? "is-active" : ""}`} onClick={onClick}>
      <div className="pt-vt-bal-hd">
        <span className="pt-pay-asset" data-asset={b.asset}>{b.asset}</span>
        <span className="pt-vt-bal-chain">{b.chain}</span>
      </div>
      <div className="pt-vt-bal-num mono">
        {b.balance.toLocaleString(undefined, { maximumFractionDigits: b.decimals })}
        <span> {b.asset === "Cash" ? "USD" : b.asset}</span>
      </div>
      <div className="pt-vt-bal-usd mono">≈ ${Math.round(b.balanceUsd).toLocaleString()}</div>
      <div className="pt-vt-bal-foot">
        <span className={`pt-vt-bal-delta ${b.delta24h >= 0 ? "is-up" : "is-down"} mono`}>
          {b.delta24h >= 0 ? "▲" : "▼"} {b.delta24h >= 0 ? "+" : ""}{b.delta24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          <span className="pt-vt-bal-delta-pct">({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)</span>
        </span>
        <svg className="pt-vt-bal-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio="none">
          <polyline points={pts} fill="none" stroke={b.color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"/>
        </svg>
      </div>
    </button>
  );
}

function PtTxRow({ t }) {
  const isIn = t.dir === "in";
  const isPending = t.state === "confirming";
  const fracDisplay = (() => {
    if (t.asset === "BTC") return t.amt.toFixed(4);
    if (t.asset === "XMR") return t.amt.toFixed(3);
    return t.amt.toFixed(2);
  })();
  return (
    <li className={`pt-vt-tx ${isIn ? "is-in" : "is-out"} ${isPending ? "is-pending" : ""}`}>
      <span className="pt-vt-tx-time mono">{t.at}</span>
      <span className={`pt-vt-tx-arrow pt-vt-tx-arrow-${isIn ? "in" : "out"}`}>
        {isIn ? "↓" : "↑"}
      </span>
      <div className="pt-vt-tx-mid">
        <div className="pt-vt-tx-row1">
          <span className="pt-vt-tx-cp">{t.counterparty}</span>
          {t.orderId && <span className="pt-vt-tx-order mono">#{t.orderId}</span>}
        </div>
        <div className="pt-vt-tx-row2">
          {t.txHash && <span className="pt-vt-tx-hash mono">{t.txHash}</span>}
          {t.note && <span className="pt-vt-tx-note">{t.note}</span>}
          {isPending && (
            <span className="pt-vt-tx-conf mono">
              <i/> {t.confirms}/{t.needs} confirmations
            </span>
          )}
        </div>
      </div>
      <div className="pt-vt-tx-amt">
        <div className={`pt-vt-tx-amt-num mono ${isIn ? "is-in" : "is-out"}`}>
          {isIn ? "+" : "−"}{fracDisplay} <span className="pt-vt-tx-amt-asset">{t.asset}</span>
        </div>
        {t.amtUsd && <div className="pt-vt-tx-amt-usd mono">≈ ${t.amtUsd.toLocaleString()}</div>}
      </div>
    </li>
  );
}

Object.assign(window, { PtVaultView, PT_BALANCES, PT_WALLETS, PT_LEDGER });
