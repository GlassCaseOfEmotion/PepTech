# Currency Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining multi-currency scope: store order amounts in base currency for clean LTV aggregation, update the LTV trigger to sum from the new column, regenerate DB types, and replace all remaining hardcoded `$` symbols with `formatAmount` across dashboard, inbox, customer detail, and order detail.

**Architecture:** A new `payment_amount_base` column on `orders` stores each order's total expressed in the tenant's base currency at write time (equal to `payment_amount` since amounts are already in base currency by construction). The `recalculate_customer_ltv` trigger is updated to SUM this column, giving a clean single-currency LTV. `base_currency` is fetched once per server component page and threaded as a prop through the component tree to all client components that display monetary values.

**Tech Stack:** Supabase PostgreSQL (trigger update), Next.js 15 server components (base_currency fetch), `formatAmount` from `src/lib/currency.ts` (already built).

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260513000002_payment_amount_base.sql` | **Create** — payment_amount_base column, updated LTV trigger, backfill |
| `src/types/database.ts` | **Regenerate** — pick up new columns |
| `src/app/orders/actions.ts` | **Modify** — createOrder sets payment_amount_base |
| `src/app/page.tsx` | **Modify** — fetch tenant base_currency, pass to DashboardLayout |
| `src/components/shell/DashboardLayout.tsx` | **Modify** — add baseCurrency prop, pass to DashboardView + DashboardRightRail |
| `src/components/dashboard/DashboardView.tsx` | **Modify** — formatAmount for KPIs, revenue, pending amounts, LTV |
| `src/app/inbox/page.tsx` | **Modify** — fetch base_currency, pass to InboxView |
| `src/components/inbox/InboxView.tsx` | **Modify** — add baseCurrency prop, formatAmount for thread LTV |
| `src/components/inbox/CustomerRail.tsx` | **Modify** — add baseCurrency prop, formatAmount for LTV |
| `src/app/customers/[customerId]/page.tsx` | **Modify** — fetch base_currency, formatAmount for LTV + order amounts |
| `src/components/orders/OrderDetailView.tsx` | **Modify** — formatAmount for customer rail LTV using order.currency |

---

## Task 1: payment_amount_base schema + LTV trigger + database.ts regen

**Files:**
- Create: `supabase/migrations/20260513000002_payment_amount_base.sql`
- Modify: `src/types/database.ts` (regenerate)

**Background:** The `customers.ltv` column is computed by `recalculate_customer_ltv()` which currently sums `orders.payment_amount`. Since `payment_amount` is always stored in the tenant's base currency (established by the multi-currency feature), a new `payment_amount_base` column makes this contract explicit. The LTV trigger switches to summing it, and existing orders are backfilled (all existing tenants were USD, all existing orders have USD amounts).

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/20260513000002_payment_amount_base.sql

-- payment_amount_base: the order total expressed in the tenant's base currency.
-- Equal to payment_amount for all current orders (base currency was USD before multi-currency).
-- Set explicitly on every new order so LTV can sum a single clean column.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_amount_base numeric(14, 4);

-- Update the LTV trigger to sum payment_amount_base instead of payment_amount.
-- Orders with NULL payment_amount_base (pre-backfill edge cases) are excluded from the sum.
CREATE OR REPLACE FUNCTION recalculate_customer_ltv()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  v_customer_id := COALESCE(NEW.customer_id, OLD.customer_id);

  UPDATE public.customers
  SET ltv = (
    SELECT COALESCE(SUM(payment_amount_base), 0)
    FROM public.orders
    WHERE customer_id = v_customer_id
      AND status NOT IN ('cancelled')
      AND payment_amount_base IS NOT NULL
  )
  WHERE id = v_customer_id;

  RETURN NULL;
END;
$$;

-- Backfill: all pre-multi-currency orders used USD amounts and all existing tenants
-- were USD, so payment_amount_base = payment_amount for every existing order.
UPDATE orders
SET payment_amount_base = payment_amount
WHERE payment_amount_base IS NULL;
```

- [ ] **Step 2: Push migration**

```bash
npx supabase db push --include-all
```

Expected: no errors. Verify in Supabase dashboard: `orders` table has `payment_amount_base` column, all existing rows have it populated.

- [ ] **Step 3: Regenerate database.ts**

```bash
npx supabase gen types typescript --linked 2>/dev/null > src/types/database.ts
```

Expected: file updated, no error output (stderr goes to /dev/null).

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```

Expected: same pass/fail as before (178 pass, 6 pre-existing network failures).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260513000002_payment_amount_base.sql src/types/database.ts
git commit -m "feat: payment_amount_base on orders, LTV trigger uses base-currency sum"
```

---

## Task 2: createOrder sets payment_amount_base

**Files:**
- Modify: `src/app/orders/actions.ts`

`payment_amount` in `createOrder` is the total from the form, which is calculated from product unit prices. Since product prices are set by the operator in their base currency, `payment_amount` is always in base currency — so `payment_amount_base = payment_amount` at write time.

- [ ] **Step 1: Write a test documenting the invariant**

Add to `src/app/orders/__tests__/actions.test.ts` at the end:

```typescript
describe('payment_amount_base invariant', () => {
  it('payment_amount equals payment_amount_base for base-currency orders', () => {
    // payment_amount is always in tenant base_currency by construction,
    // so payment_amount_base is always equal to payment_amount
    const paymentAmount = 500000
    const paymentAmountBase = paymentAmount // base currency = order currency
    expect(paymentAmountBase).toBe(paymentAmount)
  })
})
```

- [ ] **Step 2: Run test — expect PASS (it's a documentation test)**

```bash
npm run test:run -- src/app/orders/__tests__/actions.test.ts
```

Expected: all tests including the new one pass.

- [ ] **Step 3: Add payment_amount_base to the orders INSERT in createOrder**

Read `src/app/orders/actions.ts`. Find the `supabase.from('orders').insert({...})` call inside `createOrder`. It currently includes `payment_amount: data.paymentAmount`. Add `payment_amount_base` immediately after it:

```typescript
      payment_amount: data.paymentAmount,
      payment_amount_base: data.paymentAmount,
      currency,
      exchange_rate: exchangeRate,
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```

Expected: same pass/fail as before.

- [ ] **Step 5: Commit**

```bash
git add src/app/orders/actions.ts src/app/orders/__tests__/actions.test.ts
git commit -m "feat: createOrder sets payment_amount_base for clean LTV tracking"
```

---

## Task 3: Thread baseCurrency through dashboard and inbox components

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/shell/DashboardLayout.tsx`
- Modify: `src/components/dashboard/DashboardView.tsx`
- Modify: `src/app/inbox/page.tsx`
- Modify: `src/components/inbox/InboxView.tsx`
- Modify: `src/components/inbox/CustomerRail.tsx`

**Background:** `formatAmount` already exists in `src/lib/currency.ts`. The pattern: fetch `tenant.base_currency` once in the server page component, pass as a prop down the client component tree. Never fetch it inside a client component (use the server-provided value).

The hardcoded `$` locations being fixed:
- `DashboardView`: KPI revenue (line ~99), pending total (line ~105), payments card amount (line ~244), revenue subtitle (line ~270), bar chart tooltips (line ~283)
- `DashboardRightRail`: focus customer LTV (line ~463)
- `InboxView`: thread LTV (line ~660)
- `CustomerRail`: customer LTV (line ~41)

- [ ] **Step 1: Update `src/app/page.tsx` to fetch base_currency**

Read the file. After the existing `Promise.all([...])` block (which already destructures `userRow`), add two sequential awaits to fetch the tenant id and then base_currency. Insert this immediately before `const stats: DashboardStats = ...`:

```typescript
  // Fetch tenant base currency for display formatting
  const tenantId = (await supabase.from('users').select('tenant_id').eq('id', user.id).single()).data?.tenant_id
  const baseCurrency: string = tenantId
    ? ((await supabase.from('tenants').select('base_currency').eq('id', tenantId).single()).data?.base_currency ?? 'USD')
    : 'USD'
```

Then update the `DashboardLayout` JSX to pass `baseCurrency`:

```tsx
  return (
    <DashboardLayout
      displayName={displayName}
      connectedChannels={connectedChannels}
      threads={threads}
      stockProducts={stockProducts}
      stats={stats}
      baseCurrency={baseCurrency}
    />
  )
```

- [ ] **Step 2: Update `src/components/shell/DashboardLayout.tsx`**

Read the file. Add `baseCurrency: string` to `DashboardLayoutProps` and the function params. Pass it to both `DashboardView` and `DashboardRightRail`:

```typescript
interface DashboardLayoutProps {
  displayName: string
  connectedChannels: string[]
  threads: InboxThread[]
  stockProducts: CatalogProduct[]
  stats: DashboardStats
  baseCurrency: string
}

export function DashboardLayout({ displayName, connectedChannels, threads, stockProducts, stats, baseCurrency }: DashboardLayoutProps) {
  // ... existing state ...
  return (
    <div className={`pt-root${rightOpen ? '' : ' no-right'}`}>
      <Sidebar displayName={displayName} />
      <main className="pt-main">
        <TopBar ... />
        <DashboardView threads={threads} stockProducts={stockProducts} stats={stats} baseCurrency={baseCurrency} />
      </main>
      {rightOpen && <DashboardRightRail focusThread={focusThread} baseCurrency={baseCurrency} />}
    </div>
  )
}
```

- [ ] **Step 3: Update `src/components/dashboard/DashboardView.tsx`**

Add `import { formatAmount } from '@/lib/currency'` at the top.

**a) `KpiRow` (line 87)** — add `baseCurrency` and replace two values:

```typescript
function KpiRow({ active, needsReply, stats, baseCurrency }: { active: number; needsReply: number; stats: DashboardStats; baseCurrency: string }) {
  const { revenue7d, revenuePrev7d, revenue90dDaily, pendingOrders, pendingTotal } = stats
  // ...
  const kpis = [
    {
      label: 'Revenue · 7d',
      value: formatAmount(revenue7d, baseCurrency),   // was: `$${revenue7d.toLocaleString()}`
      delta,
      spark: spark7d,
    },
    {
      label: 'Pending crypto',
      value: formatAmount(pendingTotal, baseCurrency), // was: `$${pendingTotal.toLocaleString()}`
      // ...
    },
```

**b) `PaymentsCard` (line 222)** — add `baseCurrency` and replace amount display:

```typescript
function PaymentsCard({ orders, baseCurrency }: { orders: PendingOrder[]; baseCurrency: string }) {
```

Find inside `PaymentsCard` (line ~244):
```tsx
// was:
<div className="pt-pay-amt">${o.amount.toLocaleString()}</div>
// replace with:
<div className="pt-pay-amt">{formatAmount(o.amount, baseCurrency)}</div>
```

**c) `RevenueCard` (line 258)** — add `baseCurrency` and replace subtitle + bar tooltips:

```typescript
function RevenueCard({ daily90d, baseCurrency }: { daily90d: { d: string; v: number }[]; baseCurrency: string }) {
```

Line 270 (subtitle):
```tsx
// was:
subtitle={`Last ${period} · $${total.toLocaleString()} total`}
// replace with:
subtitle={`Last ${period} · ${formatAmount(total, baseCurrency)} total`}
```

Line 283 (bar tooltip):
```tsx
// was:
{d.v > 0 && <span className="pt-bar-tip">${d.v.toLocaleString()}</span>}
// replace with:
{d.v > 0 && <span className="pt-bar-tip">{formatAmount(d.v, baseCurrency)}</span>}
```

**d) `DashboardView` export (line 493)** — add `baseCurrency` prop, thread to children:

```typescript
export function DashboardView({ threads, stockProducts, stats, baseCurrency }: {
  threads: InboxThread[]
  stockProducts: CatalogProduct[]
  stats: DashboardStats
  baseCurrency: string
}) {
```

Lines 512–517 (where sub-components are rendered):
```tsx
<KpiRow active={active} needsReply={needsReply} stats={stats} baseCurrency={baseCurrency} />
// ...
<PaymentsCard orders={stats.pendingOrders} baseCurrency={baseCurrency} />
<RevenueCard daily90d={stats.revenue90dDaily} baseCurrency={baseCurrency} />
```

**e) `DashboardRightRail` (line 401)** — add `baseCurrency`, replace LTV (line 463):

```typescript
export function DashboardRightRail({ focusThread, baseCurrency }: { focusThread: InboxThread | null; baseCurrency: string }) {
```

```tsx
// was (line 463):
<div className="val mono">${t.ltv.toLocaleString()}</div>
// replace with:
<div className="val mono">{formatAmount(t.ltv, baseCurrency)}</div>
```

- [ ] **Step 4: Update `src/app/inbox/page.tsx` to fetch base_currency**

Read the file. After the existing `Promise.all([...])`, add:

```typescript
  const { data: userTenant } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  const baseCurrency = userTenant?.tenant_id
    ? ((await supabase.from('tenants').select('base_currency').eq('id', userTenant.tenant_id).single()).data?.base_currency ?? 'USD')
    : 'USD'
```

Pass `baseCurrency` to `InboxView`:
```tsx
  return (
    <InboxView
      initialConversations={...}
      quickReplies={...}
      templates={...}
      initialResolvedCount={...}
      initialActiveId={...}
      initialInvoicePath={...}
      initialInvoiceName={...}
      initialPrefill={...}
      baseCurrency={baseCurrency}
    />
  )
```

- [ ] **Step 5: Update `src/components/inbox/InboxView.tsx`**

Add `import { formatAmount } from '@/lib/currency'` at the top.

Add `baseCurrency: string` to `InboxViewProps` interface and the function params.

Find the thread LTV display (around line 660):
```tsx
// was: <div className="val mono">${thread.ltv.toLocaleString()}</div>
<div className="val mono">{formatAmount(thread.ltv, baseCurrency)}</div>
```

Find where `CustomerRail` is rendered inside `InboxView` and pass `baseCurrency` to it:
```tsx
<CustomerRail conversation={selectedConversation} baseCurrency={baseCurrency} />
```

- [ ] **Step 6: Update `src/components/inbox/CustomerRail.tsx`**

Add `import { formatAmount } from '@/lib/currency'` at the top.

Add `baseCurrency: string` to `CustomerRailProps` and the function params.

Replace around line 41:
```tsx
// was: <div className="val mono">${customer.ltv.toLocaleString()}</div>
<div className="val mono">{formatAmount(customer.ltv, baseCurrency)}</div>
```

- [ ] **Step 7: Run full test suite**

```bash
npm run test:run
```

Expected: same pass/fail as before.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx src/components/shell/DashboardLayout.tsx src/components/dashboard/DashboardView.tsx src/app/inbox/page.tsx src/components/inbox/InboxView.tsx src/components/inbox/CustomerRail.tsx
git commit -m "feat: thread baseCurrency through dashboard and inbox, formatAmount for all LTV and revenue displays"
```

---

## Task 4: Customer detail and order detail LTV displays

**Files:**
- Modify: `src/app/customers/[customerId]/page.tsx`
- Modify: `src/components/orders/OrderDetailView.tsx`

**Background:**
- The customer detail page is a large server component that renders customer stats, LTV, order history amounts inline. It already has a Supabase client — just add a base_currency fetch and use `formatAmount` for all monetary displays.
- `OrderDetailView` already receives `order.currency` (set to tenant base_currency at order creation). Use `order.currency ?? 'USD'` for the customer rail LTV display — avoids adding an extra prop.

- [ ] **Step 1: Update `src/app/customers/[customerId]/page.tsx`**

Read the file. It already imports supabase and fetches customer data. Add a base_currency fetch after the existing data fetches:

```typescript
  // Fetch tenant's base currency for display formatting
  const { data: userTenant } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  const baseCurrency = userTenant?.tenant_id
    ? ((await supabase.from('tenants').select('base_currency').eq('id', userTenant.tenant_id).single()).data?.base_currency ?? 'USD')
    : 'USD'
```

Add `import { formatAmount } from '@/lib/currency'` at the top.

Find all occurrences of hardcoded `$` monetary displays in this file. They are:
- `${customer.ltv.toLocaleString()}` — the LTV stat (×2: once in the KPI strip, once in order history subtitle)
- `${o.payment_amount.toLocaleString()}` — the order history table amount column
- Any avgOrder display computed from `customer.ltv / totalOrders`

Replace each:
```typescript
// LTV stat value:
formatAmount(customer.ltv, baseCurrency)

// Order history subtitle (e.g. "$2,294 LTV"):
formatAmount(customer.ltv, baseCurrency)

// Order row amount:
formatAmount(o.payment_amount, o.currency ?? baseCurrency)

// Average order (derived value):
formatAmount(Math.round(customer.ltv / totalOrders), baseCurrency)
```

- [ ] **Step 2: Update `src/components/orders/OrderDetailView.tsx`**

Read the file. Find the customer rail LTV display (around line 469):
```tsx
<span className="mono">${order.customers.ltv.toLocaleString()}</span>
```

`formatAmount` is already imported. `order.currency` is already available as a field on `DbOrderRow`. Replace:
```tsx
<span className="mono">{formatAmount(order.customers.ltv, order.currency ?? 'USD')}</span>
```

- [ ] **Step 3: Run full test suite**

```bash
npm run test:run
```

Expected: same pass/fail as before.

- [ ] **Step 4: Commit**

```bash
git add src/app/customers/[customerId]/page.tsx src/components/orders/OrderDetailView.tsx
git commit -m "feat: formatAmount for LTV and order amounts on customer detail and order detail pages"
```

---

## Verification checklist (manual, after all 4 tasks)

1. Create a test order with an IDR tenant → `customers.ltv` should update with the IDR amount
2. `DashboardView` KPIs show `Rp X` not `$X` for IDR tenant
3. Payments card in dashboard shows `Rp X` for pending IDR orders
4. Inbox thread list shows `Rp X` for LTV
5. Customer detail page: LTV stat, order history subtitle, and order row amounts all show `Rp X`
6. Order detail page: customer rail LTV shows `Rp X`
7. Switch back to USD in settings → all displays revert to `$X.XX` on new orders
