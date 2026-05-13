# Multi-Currency Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenant-level base currency setting (starting with USD and IDR), store all order amounts in that currency, and auto-calculate crypto payment equivalents using live exchange rates (Frankfurter for fiat/stablecoins, CoinGecko for volatile crypto).

**Architecture:** `tenant.base_currency` is the source of truth. Orders gain a `currency` column (set at creation from the tenant's base currency) and an `exchange_rate` column (set for crypto payments, recording how many base-currency units equal 1 unit of the payment asset). A shared `formatAmount(amount, currency)` utility wraps `Intl.NumberFormat` and is the only place currency display logic lives. Exchange rates are cached in a DB table with a 1-hour TTL, accessed via a thin `/api/rates` route used by both the order form (for live preview) and the `createOrder` server action (for persistence).

**Tech Stack:** Next.js 15 server actions + API routes, Supabase PostgreSQL, Frankfurter API (fiat), CoinGecko API (crypto), `Intl.NumberFormat` (formatting — no package needed).

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260513000001_multi_currency.sql` | **Create** — base_currency on tenants, currency + exchange_rate on orders, exchange_rates cache table |
| `src/lib/currency.ts` | **Create** — formatAmount, STABLECOIN_ASSETS, COINGECKO_IDS, fetchFiatRate, fetchAssetToBaseRate |
| `src/lib/__tests__/currency.test.ts` | **Create** — unit tests for formatting and asset/stablecoin classification |
| `src/app/api/rates/route.ts` | **Create** — GET /api/rates?asset=&base= with DB cache |
| `src/app/api/tenant/currency/route.ts` | **Create** — GET base_currency for current tenant (used by client form) |
| `src/app/settings/currency/page.tsx` | **Create** — settings page (server component) |
| `src/app/settings/currency/CurrencyForm.tsx` | **Create** — client form with base_currency select |
| `src/app/settings/currency/actions.ts` | **Create** — saveBaseCurrency server action |
| `src/components/settings/SettingsNav.tsx` | **Modify** — add Currency nav item |
| `src/types/orders.ts` | **Modify** — add currency to DbOrderRow and OrderCard, update dbOrderToCard |
| `src/app/orders/page.tsx` | **Modify** — add currency to ORDER_SELECT |
| `src/app/orders/actions.ts` | **Modify** — createOrder sets currency + exchange_rate from tenant |
| `src/components/orders/CreateOrderForm.tsx` | **Modify** — fetch base_currency, show live crypto equivalent |
| `src/components/orders/OrderDetailView.tsx` | **Modify** — formatAmount replacing hardcoded $ |
| `src/components/orders/OrdersView.tsx` | **Modify** — formatAmount on kanban card amount |
| `src/types/invoices.ts` | **Modify** — add currency to InvoiceData |
| `src/app/api/invoices/generate/route.ts` | **Modify** — fetch currency from order + tenant |
| `src/components/invoices/InvoicePDF.tsx` | **Modify** — formatAmount replacing hardcoded $ |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260513000001_multi_currency.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- base_currency on tenants (default USD for all existing tenants)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'USD';

ALTER TABLE tenants
  ADD CONSTRAINT tenants_base_currency_check
    CHECK (base_currency IN ('USD', 'IDR'));

-- currency: what currency payment_amount is stored in
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

ALTER TABLE orders
  ADD CONSTRAINT orders_currency_check
    CHECK (currency IN ('USD', 'IDR'));

-- exchange_rate: how many `currency` units equal 1 unit of the payment asset
-- e.g., USDT order with currency=IDR and exchange_rate=16000 means 1 USDT = Rp 16,000
-- NULL for cash, bank_transfer, and orders where base_currency = USD
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18, 6);

-- Global exchange rate cache — no tenant_id, no RLS (reference data)
CREATE TABLE IF NOT EXISTS exchange_rates (
  from_currency text           NOT NULL,
  to_currency   text           NOT NULL,
  rate          numeric(18, 6) NOT NULL,
  fetched_at    timestamptz    NOT NULL DEFAULT now(),
  PRIMARY KEY (from_currency, to_currency)
);
```

- [ ] **Step 2: Push migration**

```bash
npx supabase db push --include-all
```

Expected: no errors. Verify in Supabase dashboard:
- `tenants` has `base_currency` column (default `'USD'`)
- `orders` has `currency` (default `'USD'`) and `exchange_rate` columns
- `exchange_rates` table exists with no RLS enabled

---

## Task 2: Currency utility + tests

**Files:**
- Create: `src/lib/currency.ts`
- Create: `src/lib/__tests__/currency.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/__tests__/currency.test.ts
import { describe, it, expect } from 'vitest'
import { formatAmount, STABLECOIN_ASSETS, COINGECKO_IDS } from '../currency'

describe('formatAmount', () => {
  it('formats USD with 2 decimal places and $ symbol', () => {
    expect(formatAmount(39.99, 'USD')).toBe('$39.99')
  })

  it('formats USD $0.00', () => {
    expect(formatAmount(0, 'USD')).toBe('$0.00')
  })

  it('formats IDR with no decimal places', () => {
    const result = formatAmount(50000, 'IDR')
    expect(result).not.toContain('.')
    expect(result).toContain('50')
  })

  it('formats IDR rounds to whole number', () => {
    const a = formatAmount(50000, 'IDR')
    const b = formatAmount(50000.9, 'IDR')
    expect(a).toBe(b)
  })

  it('IDR result contains Rp', () => {
    const result = formatAmount(1000, 'IDR')
    expect(result.toLowerCase()).toMatch(/rp/)
  })
})

describe('STABLECOIN_ASSETS', () => {
  it('includes usdt_trc20 and usdc_erc20', () => {
    expect(STABLECOIN_ASSETS.has('usdt_trc20')).toBe(true)
    expect(STABLECOIN_ASSETS.has('usdc_erc20')).toBe(true)
  })

  it('does not include volatile crypto', () => {
    expect(STABLECOIN_ASSETS.has('btc')).toBe(false)
    expect(STABLECOIN_ASSETS.has('eth')).toBe(false)
  })
})

describe('COINGECKO_IDS', () => {
  it('maps btc, eth, ltc, xmr to gecko IDs', () => {
    expect(COINGECKO_IDS['btc']).toBe('bitcoin')
    expect(COINGECKO_IDS['eth']).toBe('ethereum')
    expect(COINGECKO_IDS['ltc']).toBe('litecoin')
    expect(COINGECKO_IDS['xmr']).toBe('monero')
  })

  it('does not include stablecoins', () => {
    expect(COINGECKO_IDS['usdt_trc20']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm run test:run -- src/lib/__tests__/currency.test.ts
```

Expected: FAIL — `formatAmount` not defined.

- [ ] **Step 3: Write `src/lib/currency.ts`**

```typescript
// src/lib/currency.ts

const LOCALE: Record<string, string>   = { USD: 'en-US', IDR: 'id-ID' }
const DECIMALS: Record<string, number> = { USD: 2, IDR: 0 }

// Format a monetary amount for display using the browser/Node Intl API.
// Works in both client and server contexts.
export function formatAmount(amount: number, currency: string): string {
  const decimals = DECIMALS[currency] ?? 2
  return new Intl.NumberFormat(LOCALE[currency] ?? 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(amount)
}

// Payment assets pegged 1:1 to USD — use fiat rate for conversion
export const STABLECOIN_ASSETS = new Set(['usdt_trc20', 'usdc_erc20'])

// CoinGecko IDs for volatile crypto assets — use crypto price feed
export const COINGECKO_IDS: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  ltc: 'litecoin',
  xmr: 'monero',
}

// Returns how many `to` units equal 1 `from` unit.
// e.g. fetchFiatRate('USD', 'IDR') → 16000
export async function fetchFiatRate(from: string, to: string): Promise<number> {
  if (from === to) return 1
  const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`)
  if (!res.ok) throw new Error(`Frankfurter error ${res.status}`)
  const data = await res.json() as { rates: Record<string, number> }
  const rate = data.rates[to]
  if (!rate) throw new Error(`No ${from}→${to} rate from Frankfurter`)
  return rate
}

// Returns how many `baseCurrency` units equal 1 unit of `paymentAsset`.
// e.g. fetchAssetToBaseRate('usdt_trc20', 'IDR') → 16000 (1 USDT = Rp 16,000)
// e.g. fetchAssetToBaseRate('btc', 'IDR') → 1_640_000_000 (1 BTC = Rp 1.64B)
export async function fetchAssetToBaseRate(paymentAsset: string, baseCurrency: string): Promise<number> {
  if (STABLECOIN_ASSETS.has(paymentAsset)) {
    // Stablecoins are USD-pegged — fetch fiat rate
    return fetchFiatRate('USD', baseCurrency)
  }
  const geckoId = COINGECKO_IDS[paymentAsset]
  if (!geckoId) throw new Error(`No CoinGecko mapping for: ${paymentAsset}`)
  const cur = baseCurrency.toLowerCase()
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=${cur}`
  )
  if (!res.ok) throw new Error(`CoinGecko error ${res.status}`)
  const data = await res.json() as Record<string, Record<string, number>>
  const rate = data[geckoId]?.[cur]
  if (!rate) throw new Error(`No CoinGecko rate for ${geckoId}/${cur}`)
  return rate
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm run test:run -- src/lib/__tests__/currency.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/currency.ts src/lib/__tests__/currency.test.ts
git commit -m "feat: currency utility — formatAmount and exchange rate helpers"
```

---

## Task 3: Rate API + tenant currency API

**Files:**
- Create: `src/app/api/rates/route.ts`
- Create: `src/app/api/tenant/currency/route.ts`

- [ ] **Step 1: Create `src/app/api/rates/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { fetchAssetToBaseRate, STABLECOIN_ASSETS, COINGECKO_IDS } from '@/lib/currency'

const RATE_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function GET(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const asset = searchParams.get('asset') ?? ''
  const base  = searchParams.get('base')  ?? 'USD'

  if (!asset) return NextResponse.json({ error: 'asset param required' }, { status: 400 })
  if (!STABLECOIN_ASSETS.has(asset) && !COINGECKO_IDS[asset]) {
    return NextResponse.json({ error: `Unknown asset: ${asset}` }, { status: 400 })
  }
  if (base === 'USD' && STABLECOIN_ASSETS.has(asset)) {
    // Stablecoin in USD base — always 1:1, no API call needed
    return NextResponse.json({ rate: 1, asset, base })
  }

  const supabase = await createClient()

  const { data: cached } = await supabase
    .from('exchange_rates')
    .select('rate, fetched_at')
    .eq('from_currency', asset)
    .eq('to_currency', base)
    .single()

  if (cached) {
    const ageMs = Date.now() - new Date(cached.fetched_at).getTime()
    if (ageMs < RATE_TTL_MS) {
      return NextResponse.json({ rate: Number(cached.rate), asset, base })
    }
  }

  let rate: number
  try {
    rate = await fetchAssetToBaseRate(asset, base)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Rate fetch failed' },
      { status: 502 }
    )
  }

  await supabase.from('exchange_rates').upsert(
    { from_currency: asset, to_currency: base, rate, fetched_at: new Date().toISOString() },
    { onConflict: 'from_currency,to_currency' }
  )

  return NextResponse.json({ rate, asset, base })
}
```

- [ ] **Step 2: Create `src/app/api/tenant/currency/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'

export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createClient()
  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: tenant } = await supabase
    .from('tenants').select('base_currency').eq('id', userRow.tenant_id).single()
  return NextResponse.json({ base_currency: tenant?.base_currency ?? 'USD' })
}
```

- [ ] **Step 3: Run full test suite**

```bash
npm run test:run
```

Expected: same pass/fail as before (no new failures).

- [ ] **Step 4: Manual smoke test**

```bash
# Start dev server
npm run dev
```

Open a browser and visit (replace with a valid session cookie):
```
/api/tenant/currency
```
Should return `{ "base_currency": "USD" }`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/rates/route.ts src/app/api/tenant/currency/route.ts
git commit -m "feat: exchange rate API and tenant currency API with DB caching"
```

---

## Task 4: Currency settings page

**Files:**
- Create: `src/app/settings/currency/page.tsx`
- Create: `src/app/settings/currency/CurrencyForm.tsx`
- Create: `src/app/settings/currency/actions.ts`
- Modify: `src/components/settings/SettingsNav.tsx`

- [ ] **Step 1: Create `src/app/settings/currency/actions.ts`**

```typescript
'use server'

import { createClient, getServerUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const ALLOWED_CURRENCIES = new Set(['USD', 'IDR'])

export async function saveBaseCurrency(
  currency: string
): Promise<{ success: true } | { error: string }> {
  if (!ALLOWED_CURRENCIES.has(currency)) return { error: 'Unsupported currency' }
  const user = await getServerUser()
  if (!user) return { error: 'Unauthorized' }
  const supabase = await createClient()
  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'Unauthorized' }
  const { error } = await supabase
    .from('tenants')
    .update({ base_currency: currency })
    .eq('id', userRow.tenant_id)
  if (error) return { error: error.message }
  revalidatePath('/settings/currency')
  return { success: true }
}
```

- [ ] **Step 2: Create `src/app/settings/currency/CurrencyForm.tsx`**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { saveBaseCurrency } from './actions'

const CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'IDR', label: 'IDR — Indonesian Rupiah (Rp)' },
]

export function CurrencyForm({ baseCurrency }: { baseCurrency: string }) {
  const [value, setValue]   = useState(baseCurrency)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')
  const [pending, start]    = useTransition()

  const save = () => {
    setSaved(false); setError('')
    start(async () => {
      const result = await saveBaseCurrency(value)
      if ('error' in result) { setError(result.error); return }
      setSaved(true)
    })
  }

  return (
    <div className="pt-st-card">
      <div className="pt-st-field">
        <label className="pt-st-lbl">Base currency</label>
        <select
          className="pt-input"
          style={{ maxWidth: 280 }}
          value={value}
          onChange={e => { setValue(e.target.value); setSaved(false) }}
        >
          {CURRENCIES.map(c => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        <p style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 6 }}>
          All new order amounts and invoices will use this currency.
          Existing orders are stored with their original currency and are unaffected.
        </p>
      </div>
      {error && <p style={{ fontSize: 12, color: 'var(--pt-danger)', margin: '8px 0 0' }}>{error}</p>}
      {saved && <p style={{ fontSize: 12, color: 'var(--pt-ok)',    margin: '8px 0 0' }}>Saved.</p>}
      <button
        className="pt-btn pt-btn-primary"
        style={{ marginTop: 14 }}
        onClick={save}
        disabled={pending || value === baseCurrency}
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/app/settings/currency/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { CurrencyForm } from './CurrencyForm'

export default async function CurrencyPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  const { data: tenant } = await supabase
    .from('tenants').select('base_currency').eq('id', userRow!.tenant_id).single()

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>Currency</h2>
          <p>Base currency for order amounts and invoices.</p>
        </div>
      </div>
      <CurrencyForm baseCurrency={tenant?.base_currency ?? 'USD'} />
    </div>
  )
}
```

- [ ] **Step 4: Add Currency to `SettingsNav.tsx`**

In `src/components/settings/SettingsNav.tsx`, add to the `SECTIONS` array after `'wallets'`:

```typescript
{ id: 'currency', label: 'Currency', icon: Icons.card, href: '/settings/currency', built: true },
```

- [ ] **Step 5: Run tests + verify**

```bash
npm run test:run
```

Expected: same pass/fail as before. Navigate to `/settings/currency` in the dev server — should show the currency selector. Save with IDR, reload — should persist.

- [ ] **Step 6: Commit**

```bash
git add src/app/settings/currency/ src/components/settings/SettingsNav.tsx
git commit -m "feat: currency settings page with base_currency selector"
```

---

## Task 5: Order creation — currency + live conversion preview

**Files:**
- Modify: `src/types/orders.ts`
- Modify: `src/app/orders/page.tsx`
- Modify: `src/app/orders/actions.ts`
- Modify: `src/components/orders/CreateOrderForm.tsx`

- [ ] **Step 1: Add `currency` to `DbOrderRow` and `OrderCard`**

In `src/types/orders.ts`, add `currency` to `DbOrderRow` (after `payment_amount`):

```typescript
  payment_amount: number
  currency: string
  exchange_rate: number | null
```

Add `currency` to `OrderCard` (after `paymentAmount`):

```typescript
  paymentAmount: number
  currency: string
```

Update `dbOrderToCard` to pass currency:

```typescript
    paymentAmount: o.payment_amount,
    currency: o.currency ?? 'USD',
```

- [ ] **Step 2: Add `currency` to `ORDER_SELECT` in `src/app/orders/page.tsx`**

Find the `ORDER_SELECT` string (line 10) and add `currency, exchange_rate,` after `payment_amount`:

```typescript
const ORDER_SELECT = `
  id, ref_number, customer_id, conversation_id, status,
  payment_asset, payment_amount, currency, exchange_rate, payment_address, tx_hash,
  shipping_address, carrier, tracking_number, notes,
  created_at, updated_at,
  customers (
    id, display_name, trust_score, ltv,
    customer_channels (channel_type, display_handle, is_primary)
  ),
  order_items (
    id, qty, unit_price_snapshot,
    products (sku, name),
    batches (batch_number, coa_path)
  )
`
```

Do the same in the `ORDER_SELECT` inside `src/app/api/invoices/generate/route.ts`:

```typescript
const ORDER_SELECT = `
  id, ref_number, payment_asset, payment_amount, currency, exchange_rate, payment_address, created_at,
  customers ( display_name ),
  order_items ( qty, unit_price_snapshot, products ( name, sku ) )
`
```

- [ ] **Step 3: Update `createOrder` in `src/app/orders/actions.ts` to set `currency` and `exchange_rate`**

Inside the `try` block of `createOrder`, after `getTenantId()` and before the `next_order_ref` RPC call, add:

```typescript
    // Fetch tenant's base currency
    const { data: tenantRow } = await supabase
      .from('tenants').select('base_currency').eq('id', tenantId).single()
    const currency = tenantRow?.base_currency ?? 'USD'

    // For crypto payments with non-USD base currency, fetch and cache exchange rate
    const FIAT_ASSETS = new Set(['cash', 'bank_transfer', 'customer_chooses'])
    const isCrypto = !FIAT_ASSETS.has(data.paymentAsset)
    let exchangeRate: number | null = null

    if (isCrypto && currency !== 'USD') {
      const TTL_MS = 60 * 60 * 1000
      const { data: cached } = await supabase
        .from('exchange_rates')
        .select('rate, fetched_at')
        .eq('from_currency', data.paymentAsset)
        .eq('to_currency', currency)
        .single()

      if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
        exchangeRate = Number(cached.rate)
      } else {
        try {
          const { fetchAssetToBaseRate } = await import('@/lib/currency')
          exchangeRate = await fetchAssetToBaseRate(data.paymentAsset, currency)
          await supabase.from('exchange_rates').upsert(
            { from_currency: data.paymentAsset, to_currency: currency, rate: exchangeRate, fetched_at: new Date().toISOString() },
            { onConflict: 'from_currency,to_currency' }
          )
        } catch {
          // Non-fatal: order created without exchange_rate
        }
      }
    }
```

Then in the `supabase.from('orders').insert(...)` call, add `currency` and `exchange_rate` to the inserted object:

```typescript
      currency,
      exchange_rate: exchangeRate,
```

- [ ] **Step 4: Update `CreateOrderForm.tsx` to fetch base currency and show conversion preview**

Add these state variables and effects after the existing `useEffect` blocks:

```typescript
  const [baseCurrency, setBaseCurrency]   = useState('USD')
  const [conversionRate, setConversionRate] = useState<number | null>(null)
  const [rateLoading, setRateLoading]     = useState(false)

  // Fetch tenant base currency once
  useEffect(() => {
    fetch('/api/tenant/currency')
      .then(r => r.json())
      .then((d: { base_currency: string }) => setBaseCurrency(d.base_currency))
      .catch(() => {})
  }, [])

  // Fetch conversion rate when crypto asset selected + base currency is not USD
  useEffect(() => {
    const FIAT_ASSETS = new Set(['cash', 'bank_transfer', 'customer_chooses'])
    if (FIAT_ASSETS.has(paymentAsset) || baseCurrency === 'USD') {
      setConversionRate(null)
      return
    }
    setRateLoading(true)
    fetch(`/api/rates?asset=${encodeURIComponent(paymentAsset)}&base=${baseCurrency}`)
      .then(r => r.json())
      .then((d: { rate: number }) => { setConversionRate(d.rate); setRateLoading(false) })
      .catch(() => { setConversionRate(null); setRateLoading(false) })
  }, [paymentAsset, baseCurrency])
```

Replace the total display in the JSX (currently `<span className="mono">${total.toFixed(2)}</span>`) with:

```typescript
import { formatAmount, PAYMENT_BADGE } from '@/types/payments'
// NOTE: formatAmount is imported from @/lib/currency, not payments
```

Actually import at the top of the file:
```typescript
import { formatAmount } from '@/lib/currency'
import { PAYMENT_BADGE } from '@/types/payments'
```

And replace the total area (around line 222–227):

```tsx
          <div className="pt-co-total">
            <span className="pt-co-total-lbl">{selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''}</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span className="mono">{formatAmount(total, baseCurrency)}</span>
              {conversionRate && total > 0 && (
                <span style={{ fontSize: 10.5, color: 'var(--pt-fg-4)' }}>
                  {rateLoading ? 'fetching rate…' : `≈ ${(total / conversionRate).toFixed(4).replace(/\.?0+$/, '')} ${PAYMENT_BADGE[paymentAsset]?.label ?? paymentAsset}`}
                </span>
              )}
            </div>
          </div>
```

Also replace the product unit price and subtotal displays (lines ~199, 203) with:
```tsx
<div className="pt-co-product-meta mono">{p.sku} · {formatAmount(p.unit_price, baseCurrency)}</div>
// ...
<span className="pt-co-product-subtotal mono">{formatAmount(qty * p.unit_price, baseCurrency)}</span>
```

- [ ] **Step 5: Run full test suite**

```bash
npm run test:run
```

Expected: same pass/fail as before.

- [ ] **Step 6: Manual smoke test**

1. Set base currency to IDR in `/settings/currency`
2. Open create order form
3. Select a crypto payment method (USDT)
4. Add a product — verify amount shows as `Rp X` (no decimals)
5. Verify the conversion preview shows `≈ X.XX USDT` below the total

- [ ] **Step 7: Commit**

```bash
git add src/types/orders.ts src/app/orders/page.tsx src/app/orders/actions.ts src/components/orders/CreateOrderForm.tsx
git commit -m "feat: order creation sets currency + exchange_rate, form shows live crypto conversion"
```

---

## Task 6: Display updates and invoice

**Files:**
- Modify: `src/components/orders/OrderDetailView.tsx`
- Modify: `src/components/orders/OrdersView.tsx`
- Modify: `src/types/invoices.ts`
- Modify: `src/app/api/invoices/generate/route.ts`
- Modify: `src/components/invoices/InvoicePDF.tsx`

- [ ] **Step 1: Update `OrderDetailView.tsx` to use `formatAmount`**

Add the import at the top:
```typescript
import { formatAmount } from '@/lib/currency'
```

Replace every hardcoded `$` amount in the line items table and payment card. There are 4 occurrences (lines ~320–328 and ~353):

```tsx
// Line items table — replace these three:
<td className="pt-od-num mono">{formatAmount(it.unit_price_snapshot, order.currency ?? 'USD')}</td>
<td className="pt-od-num mono">{formatAmount(it.qty * it.unit_price_snapshot, order.currency ?? 'USD')}</td>
// tfoot subtotal/total (two rows):
<td className="pt-od-num mono">{formatAmount(total, order.currency ?? 'USD')}</td>

// Payment card — asset + amount (line ~353):
<span className="mono" style={{ marginLeft: 8 }}>{formatAmount(order.payment_amount, order.currency ?? 'USD')}</span>
```

For the payment panel (awaiting state), also add the crypto amount below the asset address if `order.exchange_rate` is set. After the `order.payment_address` span, add:

```tsx
{order.exchange_rate && (
  <span style={{ fontSize: 11, color: 'var(--pt-fg-4)' }}>
    rate: 1 {PAYMENT_BADGE[order.payment_asset]?.label ?? order.payment_asset} = {formatAmount(order.exchange_rate, order.currency ?? 'USD')}
  </span>
)}
```

Import `PAYMENT_BADGE` if not already imported:
```typescript
import { PAYMENT_LABELS, PAYMENT_BADGE } from '@/types/payments'
```

- [ ] **Step 2: Update `OrdersView.tsx` kanban card amount**

Add import:
```typescript
import { formatAmount } from '@/lib/currency'
```

Replace (line ~85):
```tsx
<span className="pt-or-card-amt mono">{formatAmount(o.paymentAmount, o.currency)}</span>
```

- [ ] **Step 3: Add `currency` to `InvoiceData` and `buildInvoiceData`**

In `src/types/invoices.ts`, add `currency: string` to the `InvoiceData` interface (after `total`):

```typescript
  total: number
  currency: string
```

Update `buildInvoiceData` signature to accept `currency`:

```typescript
export function buildInvoiceData(
  order: {
    ref_number: string
    payment_asset: string
    payment_amount: number
    currency?: string
    payment_address: string | null
    created_at: string
    customers: { display_name: string } | null
    order_items: { qty: number; unit_price_snapshot: number; products?: { name: string; sku: string } | null }[]
  },
  businessName: string,
  logoUrl: string | null,
  configs: TenantPaymentConfig[] = [],
): InvoiceData {
```

And in the returned object:
```typescript
  return {
    ...existingFields,
    currency: order.currency ?? 'USD',
  }
```

- [ ] **Step 4: Fetch `currency` in invoice generate route**

In `src/app/api/invoices/generate/route.ts`, add `currency` + `exchange_rate` to `ORDER_SELECT` (already done in Task 5 Step 2). Pass it through to `buildInvoiceData`:

The `buildInvoiceData` call already passes the order — `currency` will be present since `ORDER_SELECT` now includes it. No other change needed.

- [ ] **Step 5: Update `InvoicePDF.tsx` to use `formatAmount`**

Add import:
```typescript
import { formatAmount } from '@/lib/currency'
```

The `InvoicePDF` component receives `data: InvoiceData` which now has `data.currency`. Replace the existing `fmt` function (line 35):

```typescript
// Delete this line:
const fmt = (n: number) => `$${n.toFixed(2)}`

// Replace all usages of fmt(n) with:
formatAmount(n, data.currency)
```

Find every `fmt(...)` call in `InvoicePDF.tsx` and replace with `formatAmount(..., data.currency)`.

- [ ] **Step 6: Run full test suite**

```bash
npm run test:run
```

Expected: same pass/fail as before (6 pre-existing network failures only).

- [ ] **Step 7: Manual smoke test**

1. Ensure base currency = IDR in settings
2. Create a new order with USDT payment
3. Open the order — amounts should show as `Rp X` (no decimal places)
4. Generate an invoice — PDF amounts should show as `Rp X`
5. Kanban card should show `Rp X` amount
6. Switch base currency back to USD — new orders show `$X.XX`, existing IDR orders still show `Rp X` (because `order.currency` is stored per-order)

- [ ] **Step 8: Commit**

```bash
git add src/components/orders/OrderDetailView.tsx src/components/orders/OrdersView.tsx src/types/invoices.ts src/app/api/invoices/generate/route.ts src/components/invoices/InvoicePDF.tsx
git commit -m "feat: formatAmount across order display and invoices, thread currency through invoice PDF"
```
