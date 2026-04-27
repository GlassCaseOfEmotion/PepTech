// catalog.jsx — Catalog / Product shelf

const PT_CATALOG = [
  {
    sku: "BPC-157", name: "BPC-157 5mg", category: "Healing",
    stock: 142, threshold: 60, price: 38, cost: 9.50, margin: 0.75,
    demand7d: [10, 14, 9, 12, 18, 22, 16],
    velocityWk: 28, daysCover: 35,
    batches: [
      { id: "L24-118", made: "Apr 04", qty: 200, sold: 58, coa: true, purity: 99.4 },
      { id: "L24-091", made: "Mar 12", qty: 150, sold: 150, coa: true, purity: 99.1 },
    ],
    affinity: ["TB-500", "GHK-Cu", "MOTS-c"],
    note: "Best-selling healing peptide. Pair with TB-500 for 60% of customers.",
  },
  {
    sku: "TB-500", name: "TB-500 10mg", category: "Healing",
    stock: 88, threshold: 40, price: 72, cost: 22, margin: 0.69,
    demand7d: [6, 8, 5, 7, 11, 9, 8],
    velocityWk: 14, daysCover: 44,
    batches: [
      { id: "L24-122", made: "Apr 09", qty: 120, sold: 32, coa: true, purity: 98.9 },
    ],
    affinity: ["BPC-157", "GHK-Cu"],
    note: "Steady mover. No restock pressure.",
  },
  {
    sku: "RETA-10", name: "Retatrutide 10mg", category: "GLP-1",
    stock: 24, threshold: 35, price: 165, cost: 41, margin: 0.75,
    demand7d: [3, 5, 6, 5, 9, 7, 8],
    velocityWk: 11, daysCover: 15,
    batches: [
      { id: "L24-131", made: "Apr 16", qty: 80, sold: 56, coa: true, purity: 98.7 },
    ],
    affinity: ["TIRZ-30", "SEMA-10"],
    note: "Below threshold. Order from supplier-A by Friday.",
    flag: "low",
  },
  {
    sku: "TIRZ-30", name: "Tirzepatide 30mg", category: "GLP-1",
    stock: 9, threshold: 25, price: 220, cost: 56, margin: 0.75,
    demand7d: [4, 6, 5, 8, 9, 7, 11],
    velocityWk: 13, daysCover: 5,
    batches: [
      { id: "L24-127", made: "Apr 11", qty: 60, sold: 51, coa: true, purity: 99.2 },
    ],
    affinity: ["RETA-10", "SEMA-10"],
    note: "Critical. 7 customers on waitlist. Last batch sold thru in 11 days.",
    flag: "critical",
  },
  {
    sku: "GHK-CU", name: "GHK-Cu 50mg", category: "Cosmetic",
    stock: 61, threshold: 30, price: 55, cost: 12, margin: 0.78,
    demand7d: [4, 3, 5, 4, 6, 5, 4],
    velocityWk: 8, daysCover: 53,
    batches: [
      { id: "L24-104", made: "Mar 22", qty: 100, sold: 39, coa: true, purity: 99.6 },
    ],
    affinity: ["BPC-157", "TB-500"],
    note: "Stable. Often added to BPC orders as a +1.",
  },
  {
    sku: "MOTS-C", name: "MOTS-c 10mg", category: "Mito",
    stock: 0, threshold: 20, price: 95, cost: 28, margin: 0.71,
    demand7d: [2, 1, 2, 3, 2, 1, 2],
    velocityWk: 4, daysCover: 0,
    batches: [],
    affinity: ["BPC-157"],
    note: "Out of stock since Apr 14. Re-order placed, ETA Apr 28.",
    flag: "oos",
  },
  {
    sku: "SEMA-10", name: "Semaglutide 10mg", category: "GLP-1",
    stock: 47, threshold: 35, price: 130, cost: 32, margin: 0.75,
    demand7d: [5, 7, 6, 8, 7, 9, 6],
    velocityWk: 12, daysCover: 27,
    batches: [
      { id: "L24-129", made: "Apr 13", qty: 90, sold: 43, coa: true, purity: 98.8 },
    ],
    affinity: ["TIRZ-30", "RETA-10"],
    note: "Steady. Watch for demand bump if Reta runs low.",
  },
  {
    sku: "CJC-DAC", name: "CJC-1295 w/ DAC", category: "GH",
    stock: 33, threshold: 25, price: 48, cost: 11, margin: 0.77,
    demand7d: [2, 3, 2, 4, 3, 2, 3],
    velocityWk: 7, daysCover: 33,
    batches: [
      { id: "L24-115", made: "Apr 02", qty: 80, sold: 47, coa: true, purity: 99.0 },
    ],
    affinity: ["IPAM-2"],
    note: "Slow + steady. Often paired with Ipamorelin.",
  },
];

function PtCatalogView() {
  const [selectedSku, setSelectedSku] = React.useState("TIRZ-30");
  const [sortBy, setSortBy] = React.useState("flag");
  const [filter, setFilter] = React.useState("all");

  const filtered = PT_CATALOG.filter((p) => {
    if (filter === "all") return true;
    if (filter === "low")  return p.flag === "low" || p.flag === "critical" || p.flag === "oos";
    if (filter === "GLP-1") return p.category === "GLP-1";
    return p.category === filter;
  });

  const flagOrder = { critical: 0, oos: 1, low: 2 };
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "flag") {
      const fa = flagOrder[a.flag] ?? 99;
      const fb = flagOrder[b.flag] ?? 99;
      return fa - fb || a.daysCover - b.daysCover;
    }
    if (sortBy === "stock")    return a.stock - b.stock;
    if (sortBy === "velocity") return b.velocityWk - a.velocityWk;
    if (sortBy === "margin")   return b.margin - a.margin;
    if (sortBy === "name")     return a.name.localeCompare(b.name);
    return 0;
  });

  const selected = PT_CATALOG.find((p) => p.sku === selectedSku) || PT_CATALOG[0];

  const totalSkus = PT_CATALOG.length;
  const lowCount = PT_CATALOG.filter((p) => p.flag).length;
  const inventoryValue = PT_CATALOG.reduce((s, p) => s + p.stock * p.cost, 0);

  return (
    <div className="pt-cat" data-screen-label="Catalog">
      <div className="pt-cat-hd">
        <div>
          <h1>Catalog</h1>
          <p>{totalSkus} SKUs · {lowCount} need attention · ${Math.round(inventoryValue).toLocaleString()} on hand</p>
        </div>
        <div className="pt-cat-hd-actions">
          <button className="pt-btn pt-btn-ghost"><window.I.box size={12}/> Import COA</button>
          <button className="pt-btn pt-btn-primary"><window.I.plus size={12}/> New SKU</button>
        </div>
      </div>

      <div className="pt-cat-toolbar">
        <div className="pt-cat-filters">
          {[
            { id: "all",   label: "All" },
            { id: "low",   label: `Needs attention · ${lowCount}` },
            { id: "GLP-1", label: "GLP-1" },
            { id: "Healing",  label: "Healing" },
            { id: "Cosmetic", label: "Cosmetic" },
            { id: "Mito",     label: "Mito" },
            { id: "GH",       label: "GH" },
          ].map((f) => (
            <button
              key={f.id}
              className={`pt-cat-filter ${filter === f.id ? "is-active" : ""}`}
              onClick={() => setFilter(f.id)}
            >{f.label}</button>
          ))}
        </div>
        <div className="pt-cat-sort">
          <span className="pt-cat-sort-lbl">Sort</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="pt-cat-sort-sel">
            <option value="flag">Attention first</option>
            <option value="stock">Stock low → high</option>
            <option value="velocity">Velocity</option>
            <option value="margin">Margin</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      <div className="pt-cat-body">
        {/* ─── List ─── */}
        <div className="pt-cat-list">
          <div className="pt-cat-list-head">
            <div className="pt-cat-cell-name">Product</div>
            <div className="pt-cat-cell-stock">Stock</div>
            <div className="pt-cat-cell-velocity">Vel · 7d</div>
            <div className="pt-cat-cell-cover">Cover</div>
            <div className="pt-cat-cell-price">Price</div>
            <div className="pt-cat-cell-margin">Margin</div>
          </div>
          <ul>
            {sorted.map((p) => {
              const stockPct = Math.min(1, p.stock / (p.threshold * 2));
              const isSel = selectedSku === p.sku;
              const flagInfo = {
                critical: { cls: "critical", label: "critical" },
                oos:      { cls: "oos",      label: "out of stock" },
                low:      { cls: "low",      label: "below threshold" },
              }[p.flag];
              return (
                <li
                  key={p.sku}
                  className={`pt-cat-row ${isSel ? "is-active" : ""} ${p.flag ? `pt-cat-row-${p.flag}` : ""}`}
                  onClick={() => setSelectedSku(p.sku)}
                >
                  <div className="pt-cat-cell-name">
                    <div className="pt-cat-name-main">
                      <span className="pt-cat-cat-pill" data-cat={p.category}>{p.category}</span>
                      <span className="pt-cat-prod-name">{p.name}</span>
                    </div>
                    <div className="pt-cat-sku mono">{p.sku}</div>
                  </div>
                  <div className="pt-cat-cell-stock">
                    <div className="pt-cat-stock-row">
                      <span className="pt-cat-stock-num mono">{p.stock}</span>
                      {flagInfo && <span className={`pt-cat-flag pt-cat-flag-${flagInfo.cls}`}>{flagInfo.label}</span>}
                    </div>
                    <div className="pt-cat-stock-bar">
                      <div className={`pt-cat-stock-fill ${p.flag ? `is-${p.flag}` : ""}`}
                           style={{ width: `${stockPct*100}%` }}/>
                      <div className="pt-cat-stock-thr"
                           style={{ left: `${Math.min(100, p.threshold/(p.threshold*2)*100)}%` }}
                           title={`threshold ${p.threshold}`}/>
                    </div>
                  </div>
                  <div className="pt-cat-cell-velocity">
                    <PtSparkline data={p.demand7d} />
                    <span className="pt-cat-vel mono">{p.velocityWk}/wk</span>
                  </div>
                  <div className="pt-cat-cell-cover">
                    <span className={`pt-cat-cover-num mono ${p.daysCover < 14 ? "is-warn" : ""} ${p.daysCover === 0 ? "is-zero" : ""}`}>
                      {p.daysCover === 0 ? "—" : `${p.daysCover}d`}
                    </span>
                  </div>
                  <div className="pt-cat-cell-price mono">${p.price}</div>
                  <div className="pt-cat-cell-margin mono">{Math.round(p.margin*100)}%</div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ─── Detail panel ─── */}
        <PtCatalogDetail product={selected}/>
      </div>
    </div>
  );
}

function PtSparkline({ data, w = 60, h = 16 }) {
  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i*step).toFixed(1)},${(h - (v/max)*h).toFixed(1)}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg className="pt-cat-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <polygon points={area} fill="var(--pt-accent-soft)" stroke="none"/>
      <polyline points={pts} fill="none" stroke="var(--pt-accent)" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  );
}

function PtCatalogDetail({ product: p }) {
  if (!p) return null;
  const stockPct = Math.min(1, p.stock / (p.threshold * 2));
  const totalBatchQty = p.batches.reduce((s, b) => s + b.qty, 0);
  const totalBatchSold = p.batches.reduce((s, b) => s + b.sold, 0);

  return (
    <aside className="pt-cat-detail">
      <header className="pt-cat-detail-hd">
        <div>
          <span className="pt-cat-cat-pill" data-cat={p.category}>{p.category}</span>
          <h2>{p.name}</h2>
          <div className="pt-cat-sku mono">{p.sku}</div>
        </div>
        <div className="pt-cat-detail-actions">
          <button className="pt-btn pt-btn-ghost">Edit</button>
          <button className="pt-btn pt-btn-primary">Re-order</button>
        </div>
      </header>

      {p.note && (
        <div className={`pt-cat-note ${p.flag ? `pt-cat-note-${p.flag}` : ""}`}>
          {p.flag && <i className="pt-cat-note-dot"/>}
          <span>{p.note}</span>
        </div>
      )}

      <div className="pt-cat-stat-grid">
        <div className="pt-cat-stat">
          <div className="lbl">In stock</div>
          <div className="val mono">{p.stock}<span className="u">vials</span></div>
          <div className="pt-cat-stock-bar">
            <div className={`pt-cat-stock-fill ${p.flag ? `is-${p.flag}` : ""}`} style={{ width: `${stockPct*100}%` }}/>
            <div className="pt-cat-stock-thr" style={{ left: `${Math.min(100, p.threshold/(p.threshold*2)*100)}%` }}/>
          </div>
          <div className="pt-cat-stat-sub">threshold {p.threshold}</div>
        </div>
        <div className="pt-cat-stat">
          <div className="lbl">Velocity</div>
          <div className="val mono">{p.velocityWk}<span className="u">/wk</span></div>
          <PtSparkline data={p.demand7d} w={120} h={22}/>
          <div className="pt-cat-stat-sub">last 7 days</div>
        </div>
        <div className="pt-cat-stat">
          <div className="lbl">Cover</div>
          <div className={`val mono ${p.daysCover < 14 ? "is-warn" : ""} ${p.daysCover === 0 ? "is-zero" : ""}`}>
            {p.daysCover === 0 ? "—" : p.daysCover}<span className="u">days</span>
          </div>
          <div className="pt-cat-stat-sub">at current velocity</div>
        </div>
        <div className="pt-cat-stat">
          <div className="lbl">Unit econ</div>
          <div className="val mono">${p.price}</div>
          <div className="pt-cat-stat-sub">cost ${p.cost} · margin {Math.round(p.margin*100)}%</div>
        </div>
      </div>

      <section className="pt-card pt-cat-section">
        <header className="pt-card-hd">
          <div>
            <h3>Batches</h3>
            <p>{p.batches.length} on shelf · {totalBatchSold}/{totalBatchQty} sold</p>
          </div>
          <button className="pt-link">Re-order →</button>
        </header>
        <div className="pt-card-body">
          {p.batches.length === 0 ? (
            <div className="pt-cat-empty">
              <span>No active batch.</span>
              <button className="pt-btn pt-btn-ghost">Mark restocked</button>
            </div>
          ) : (
            <table className="pt-cat-batches">
              <thead>
                <tr><th>Lot</th><th>Made</th><th>Sold</th><th>Purity</th><th>COA</th><th></th></tr>
              </thead>
              <tbody>
                {p.batches.map((b) => {
                  const pct = b.sold / b.qty;
                  return (
                    <tr key={b.id}>
                      <td className="mono">{b.id}</td>
                      <td>{b.made}</td>
                      <td>
                        <div className="pt-cat-batch-sold">
                          <span className="mono">{b.sold}/{b.qty}</span>
                          <div className="pt-cat-batch-bar">
                            <div className="pt-cat-batch-fill" style={{ width: `${pct*100}%` }}/>
                          </div>
                        </div>
                      </td>
                      <td className="mono">{b.purity}%</td>
                      <td>{b.coa
                        ? <span className="pt-cat-coa is-on"><window.I.check size={10}/> Janoshik</span>
                        : <span className="pt-cat-coa">—</span>}</td>
                      <td><button className="pt-link">View →</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="pt-card pt-cat-section">
        <header className="pt-card-hd">
          <div>
            <h3>Often paired with</h3>
            <p>Customers buying {p.sku} also buy</p>
          </div>
        </header>
        <div className="pt-card-body pt-cat-affinity-body">
          {p.affinity.map((sku) => {
            const ap = PT_CATALOG.find((x) => x.sku === sku);
            if (!ap) return null;
            return (
              <div key={sku} className="pt-cat-aff">
                <span className="pt-cat-cat-pill" data-cat={ap.category}>{ap.category}</span>
                <div>
                  <div className="pt-cat-aff-name">{ap.name}</div>
                  <div className="pt-cat-aff-sub mono">{ap.sku} · ${ap.price}</div>
                </div>
                <span className={`pt-cat-aff-stock ${ap.flag ? "is-low" : ""} mono`}>{ap.stock}</span>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

Object.assign(window, { PtCatalogView, PT_CATALOG });
