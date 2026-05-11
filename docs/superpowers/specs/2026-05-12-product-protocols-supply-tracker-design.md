# Product Protocols & Customer Supply Tracker — Design

## Scope

Two tightly coupled sub-systems built together:

1. **Product Protocols** — tenants configure dosage/usage instructions per product in the catalog
2. **Customer Supply Tracker** — per-customer supply remaining, derived on-the-fly from order history + protocols, surfaced in customer detail and customer list

The downstream **reorder intelligence & engagement** layer (automated reorder prompts, broadcast targeting) is explicitly out of scope and will follow as a separate sub-project once this foundation is in place.

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Protocol level | Per-product with per-customer override | Products differ by compound+vial-size; customers vary in dose |
| Supply calculation | Most recent order only (no cumulative history) | Reorders indicate ~90% depletion; simpler and accurate enough |
| Cycle storage | Fully derived — no cycle tracking table | Avoids manual maintenance; order history + protocol is sufficient |
| Dosage units | mL for all dosing fields; mg/mcg for vial strength display only | Practitioners think and measure in mL |
| Product definition | compound + vial strength = one product row | Already the case in the DB; BPC-157-5MG ≠ BPC-157-10MG |

---

## Data Model

### New table: `product_protocols`

One row per product per tenant. The UNIQUE constraint enforces one protocol per product.

```sql
CREATE TABLE product_protocols (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- display
  vial_strength    text,                        -- e.g. '5mg' — display only
  -- calculator fields (required for supply math)
  reconstitution_ml  numeric(6,2) NOT NULL,     -- e.g. 2.0
  draw_volume_ml     numeric(6,3) NOT NULL,     -- e.g. 0.1
  frequency          text NOT NULL,             -- see enum below
  -- informational fields (optional)
  timing             text,                      -- e.g. 'nightly, empty stomach'
  cycle_length_weeks integer,                   -- e.g. 12
  storage            text,                      -- e.g. 'refrigerate after reconstituting'
  notes              text,                      -- free text: needle type, preloading, etc.
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id)
);

CREATE INDEX product_protocols_tenant_id_idx ON product_protocols (tenant_id);

ALTER TABLE product_protocols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON product_protocols
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
```

**`frequency` values:**

| Value | Injections/day |
|---|---|
| `once_daily` | 1.0 |
| `twice_daily` | 2.0 |
| `eod` | 0.5 |
| `3x_weekly` | 3/7 ≈ 0.4286 |
| `weekly` | 1/7 ≈ 0.1429 |

### New table: `customer_protocol_overrides`

One row per customer+product — only created when a customer's protocol differs from the product default. Stores only the overriding fields.

```sql
CREATE TABLE customer_protocol_overrides (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id      uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- nullable — only set if overriding the product default
  draw_volume_ml   numeric(6,3),
  frequency        text,
  notes            text,                        -- e.g. 'uses 0.2ml, high bodyweight'
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, product_id)
);

CREATE INDEX customer_protocol_overrides_tenant_idx ON customer_protocol_overrides (tenant_id);
CREATE INDEX customer_protocol_overrides_customer_idx ON customer_protocol_overrides (customer_id);

ALTER TABLE customer_protocol_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON customer_protocol_overrides
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
```

### No changes to existing tables

`products`, `orders`, `order_items` unchanged. Supply data is derived from existing columns.

---

## Supply Calculation

All supply state is computed in the application layer. No stored supply columns.

```
-- For each product a customer has ordered:
most_recent_order   = latest order_item for this customer × product_id
units_ordered       = order_item.qty from most_recent_order

effective_draw_ml   = customer_protocol_overrides.draw_volume_ml
                      ?? product_protocols.draw_volume_ml
effective_frequency = customer_protocol_overrides.frequency
                      ?? product_protocols.frequency

draws_per_vial      = reconstitution_ml ÷ effective_draw_ml
injections_per_day  = frequencyToDaily(effective_frequency)
days_per_vial       = draws_per_vial ÷ injections_per_day
total_days          = units_ordered × days_per_vial
days_elapsed        = today − most_recent_order.created_at (in days)
days_remaining      = total_days − days_elapsed
pct_remaining       = days_remaining ÷ total_days
```

**Supply status thresholds:**

| Status | Condition | Colour |
|---|---|---|
| `ok` | pct_remaining > 0.25 AND days_remaining > 10 | Green |
| `low` | pct_remaining ≤ 0.25 OR days_remaining ≤ 10 | Orange |
| `critical` | days_remaining ≤ 0 | Red ("Supply elapsed") |

A product with no configured protocol is shown but excluded from status calculation.

The **worst-case status** across all a customer's active products determines their list-level indicator.

---

## UI — Catalog: Protocol Section

**Location:** New section appended to the existing product detail panel in `CatalogView.tsx`, below the Batches section.

**Empty state:** "No protocol configured. Add one to enable supply tracking for customers who order this product." + "Add protocol" button.

**View mode:** Key–value list showing all configured fields. Derived label "X doses/vial" shown next to draw volume. "Edit" button top-right.

**Edit mode (inline):** 2-column grid form:
- Row 1: Vial strength (text, optional) · Frequency (select, required)
- Row 2: Reconstitution volume mL (numeric, required) · Draw volume mL (numeric, required)
- Row 3: Timing (text, optional, full width)
- Row 4: Cycle length weeks (integer, optional) · Storage (text, optional)
- Row 5: Usage notes (textarea, optional, full width)
- Actions: Save · Cancel

Live-derived "→ X doses/vial" label updates as the operator types, providing immediate sanity-check feedback.

**Validation:** reconstitution_ml, draw_volume_ml, and frequency are required. draw_volume_ml must be > 0 and ≤ reconstitution_ml.

---

## UI — Customer Detail: Active Cycles

**Location:** Replaces the mock `MOCK_CYCLES` data in the existing "Active cycles" card in `src/app/customers/[customerId]/page.tsx`.

**Data source:** Server-side query — for the customer, find the most recent `order_item` per `product_id`, join with `product_protocols` and `customer_protocol_overrides`, compute supply fields.

**Per-row layout:**
```
[Product name]            [protocol badge: "0.1ml · daily"]    [days remaining]
[━━━━━━━━━━━━░░░░░░░░░]  ← supply bar, colour-coded by status
[Ordered Apr 1 · 2 vials · 52 day supply]         [Est. end May 23]
```

- **Protocol badge:** shows effective draw volume + frequency. If customer has an override, badge appended with `★ custom`.
- **Progress bar:** shows supply *remaining* (full bar = full supply), drains left-to-right as days pass. Colour: green / orange / red by status.
- **Days remaining:** numeric, colour-coded. "Supply elapsed" when days_remaining ≤ 0.
- **No protocol row:** product shown with "No protocol — configure in Catalog →" link instead of bar.

**Per-customer override:** Edit icon on each row opens an inline form to set draw_volume_ml and frequency overrides + notes for that customer+product. Saving upserts `customer_protocol_overrides`.

**Subtitle:** Changed from "Inferred from order cadence + product half-life" to "Derived from order history + configured protocols".

---

## UI — Customer List: Supply Indicator

**Location:** Right side of each row in `CustomersListView.tsx`, between the existing trust pill and the "Message →" link.

**Format (Option A — coloured dot + label):**

| State | Dot colour | Label |
|---|---|---|
| All ok | Green `●` | `supply ok` (muted text) |
| At least one low | Orange `●` | `X low` |
| At least one critical | Red `●` | `out` |
| No active protocols | — | `—` |

**Data source:** Supply status is computed server-side for each customer when loading the customers list. Requires joining orders + order_items + product_protocols per customer — query should be efficient with the existing indexes. Only customers with at least one product that has a configured protocol show a meaningful indicator.

---

## Files to Create / Modify

### New
- `supabase/migrations/20260512000001_product_protocols.sql`
- `src/types/protocols.ts` — `ProductProtocol`, `CustomerProtocolOverride`, `SupplyStatus`, `ActiveCycle` types + `computeSupply()` helper
- `src/lib/__tests__/protocols.test.ts` — unit tests for `computeSupply()`
- `src/app/catalog/actions.ts` — `upsertProtocol()` server action
- `src/app/customers/actions.ts` — `upsertProtocolOverride()` server action

### Modified
- `src/components/catalog/CatalogView.tsx` — add Protocol section to product detail panel
- `src/app/customers/[customerId]/page.tsx` — replace MOCK_CYCLES with real computed supply data; add override inline form
- `src/components/customers/CustomersListView.tsx` — add supply dot indicator per customer

---

## Out of Scope

- Reorder intelligence / automated engagement (separate sub-project)
- Displaying protocol instructions to customers (invoices, inbox — separate sub-project)
- Supply history charting
- Multi-product stack analysis ("these two products interact")
- Pausing / manually adjusting cycles
