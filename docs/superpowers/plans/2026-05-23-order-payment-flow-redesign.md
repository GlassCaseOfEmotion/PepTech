# Order Payment Flow Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `created` pre-payment status, remove `customer_chooses`, and give merchants an explicit payment setup step on the order detail page that transitions the order to `awaiting` on send.

**Architecture:** Schema first, then TypeScript types, then server actions, then the two affected components — each task compiles cleanly before the next begins. TypeScript errors introduced in Task 2 are fully resolved by Tasks 3–6.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL), Vitest + React Testing Library, `pt-*` CSS design system (no Tailwind).

---

## File map

| File | Change |
|------|--------|
| `supabase/migrations/20260523000002_order_created_status.sql` | Create — default status to `created`, nullable `payment_asset`, migrate `customer_chooses` rows |
| `src/types/orders.ts` | Add `'created'` to `OrderStatus`; `payment_asset` → `string \| null` in `DbOrderRow` and `OrderCard` |
| `src/types/payments.ts` | Remove `'customer_chooses'` from `PaymentType`, `PAYMENT_LABELS`, `PAYMENT_BADGE` |
| `src/lib/payments.ts` | Delete the `customer_chooses` branch from `buildPaymentMessage` |
| `src/app/orders/actions.ts` | Optional `paymentAsset` in `createOrder`; new `setOrderPaymentMethod`; `sendOrderPaymentDetails` transitions `created → awaiting` |
| `src/components/orders/CreateOrderForm.tsx` | Remove payment dropdown, `paymentAsset` / `paymentAddress` state, `paymentOptions`, and the conversion-rate `useEffect` |
| `src/components/orders/OrderDetailView.tsx` | Add `created` panel with method picker + send state machine; remove all `customer_chooses` references |

---

## Task 1: DB migration

**Files:**
- Create: `supabase/migrations/20260523000002_order_created_status.sql`

- [ ] **Step 1: Write the migration**

`status` and `payment_asset` are plain text columns — no enum manipulation needed.

```sql
-- New orders start as 'created' instead of 'awaiting'
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'created';

-- Orders are created without a payment method; it is set on the detail page
ALTER TABLE orders ALTER COLUMN payment_asset DROP NOT NULL;

-- Legacy rows — migrate customer_chooses to null
UPDATE orders SET payment_asset = NULL WHERE payment_asset = 'customer_chooses';
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push --include-all`
Expected: exits 0, no error output.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260523000002_order_created_status.sql
git commit -m "feat: default order status to created, nullable payment_asset, remove customer_chooses rows"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `src/types/orders.ts`
- Modify: `src/types/payments.ts`

**Note:** After this task TypeScript will surface errors in files that still reference `customer_chooses` or the old `OrderStatus`. Those are resolved in Tasks 3–6 — they are expected.

- [ ] **Step 1: Write the failing type test**

Create `src/lib/__tests__/orders.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { OrderStatus } from '@/types/orders'

describe('OrderStatus', () => {
  it('includes created', () => {
    const s: OrderStatus = 'created'
    expect(s).toBe('created')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm run test:run -- src/lib/__tests__/orders.test.ts`
Expected: FAIL — type error (Type '"created"' is not assignable to type 'OrderStatus')

- [ ] **Step 3: Update `src/types/orders.ts`**

Line 1 — add `'created'` as the first status:
```typescript
export type OrderStatus = 'created' | 'awaiting' | 'confirming' | 'packing' | 'shipped' | 'delivered'
```

Line 18 in `DbOrderRow` — make nullable:
```typescript
payment_asset: string | null
```

Line 65 in `OrderCard` — make nullable:
```typescript
paymentAsset: string | null
```

Line 116 in `dbOrderToCard` — handle null:
```typescript
paymentAsset: o.payment_asset ?? null,
```

- [ ] **Step 4: Update `src/types/payments.ts`**

Remove `'customer_chooses'` from `PaymentType` (delete line 12):
```typescript
export type PaymentType =
  | 'usdt_trc20'
  | 'usdt_erc20'
  | 'btc'
  | 'eth'
  | 'usdc_erc20'
  | 'ltc'
  | 'xmr'
  | 'sol'
  | 'bank_transfer'
  | 'cash'
```

Remove from `PAYMENT_LABELS` (delete the `customer_chooses` line):
```typescript
// Delete:
customer_chooses: 'Customer chooses',
```

Remove from `PAYMENT_BADGE` (delete the `customer_chooses` line):
```typescript
// Delete:
customer_chooses: { label: 'Multi', key: 'multi' },
```

`PAYMENT_METHODS` (line 49) already excludes `customer_chooses` — no change needed.

- [ ] **Step 5: Run test to confirm it passes**

Run: `npm run test:run -- src/lib/__tests__/orders.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/orders.ts src/types/payments.ts src/lib/__tests__/orders.test.ts
git commit -m "feat: add created to OrderStatus, nullable payment_asset, remove customer_chooses type"
```

---

## Task 3: Server actions

**Files:**
- Modify: `src/app/orders/actions.ts`

Three changes: (a) optional `paymentAsset` in `createOrder`, (b) new `setOrderPaymentMethod`, (c) `sendOrderPaymentDetails` transitions `created → awaiting`.

- [ ] **Step 1: Write the failing test**

Create `src/app/orders/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [] })) }))

describe('setOrderPaymentMethod', () => {
  it('is exported from actions', async () => {
    const mod = await import('@/app/orders/actions')
    expect(typeof mod.setOrderPaymentMethod).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm run test:run -- src/app/orders/__tests__/actions.test.ts`
Expected: FAIL — `setOrderPaymentMethod` is not a function / not exported

- [ ] **Step 3: Update `STATUS_LABELS` (lines 20–23)**

```typescript
const STATUS_LABELS: Record<string, string> = {
  created: 'Order created',
  awaiting: 'Awaiting payment', confirming: 'Confirming',
  packing: 'Packing', shipped: 'Shipped', delivered: 'Delivered',
}
```

- [ ] **Step 4: Update `createOrder` — make `paymentAsset` optional**

Change line 28 in the function signature:
```typescript
paymentAsset?: string          // was: paymentAsset: string
```

Change lines 52–53 — update `FIAT_ASSETS` and `isCrypto`:
```typescript
// Before
const FIAT_ASSETS = new Set(['cash', 'bank_transfer', 'customer_chooses'])
const isCrypto = !FIAT_ASSETS.has(data.paymentAsset)

// After
const FIAT_ASSETS = new Set(['cash', 'bank_transfer'])
const isCrypto = !!data.paymentAsset && !FIAT_ASSETS.has(data.paymentAsset)
```

Change line 90 — allow null in insert:
```typescript
payment_asset: data.paymentAsset ?? null,
```

- [ ] **Step 5: Add `setOrderPaymentMethod` after the `createOrder` function (after line 131)**

```typescript
export async function setOrderPaymentMethod(
  orderId: string,
  asset: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { data: config } = await supabase
      .from('tenant_payment_configs')
      .select('wallet_address')
      .eq('tenant_id', tenantId)
      .eq('type', asset)
      .eq('is_active', true)
      .maybeSingle()
    const { error } = await supabase
      .from('orders')
      .update({ payment_asset: asset, payment_address: config?.wallet_address ?? null })
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath(`/orders/${orderId}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 6: Update `sendOrderPaymentDetails` — add `status` to the select + null guard + transition**

At the select query (lines 545–549), add `status` to the select list:
```typescript
.select('id, ref_number, status, payment_asset, payment_amount, payment_address, customer_id, customers(display_name, customer_channels(channel_type, is_primary))')
```

After line 550 (`if (!order) return { error: 'Order not found' }`), add a null guard:
```typescript
if (!(order as any).payment_asset) return { error: 'No payment method selected for this order' }
```

Change the empty-message guard at line 578–579. Cash orders skip the send but still transition status:
```typescript
// Before
if (!msg) return { error: 'No payment message to send (cash orders cannot be sent)' }

// After
if (!msg) {
  if ((order as any).status === 'created') {
    await supabase.from('orders').update({ status: 'awaiting' }).eq('id', orderId)
    revalidatePath(`/orders/${orderId}`)
  }
  return { ok: true, conversationId: convResult.conversationId }
}
```

Replace the final return at line 597 with:
```typescript
if ((order as any).status === 'created') {
  await supabase.from('orders').update({ status: 'awaiting' }).eq('id', orderId)
  revalidatePath(`/orders/${orderId}`)
}
return { ok: true, conversationId: convResult.conversationId }
```

- [ ] **Step 7: Run test to confirm it passes**

Run: `npm run test:run -- src/app/orders/__tests__/actions.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/app/orders/actions.ts src/app/orders/__tests__/actions.test.ts
git commit -m "feat: optional paymentAsset in createOrder, add setOrderPaymentMethod, transition created→awaiting on send"
```

---

## Task 4: Remove `customer_chooses` from `buildPaymentMessage`

**Files:**
- Modify: `src/lib/payments.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/payments.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildPaymentMessage } from '@/lib/payments'
import type { TenantPaymentConfig } from '@/types/payments'

const configs: TenantPaymentConfig[] = [
  {
    id: '1', tenant_id: 't1', type: 'usdt_trc20',
    wallet_address: 'TXxx', bank_name: null, account_name: null,
    account_number: null, sort_code: null, iban: null,
    is_active: true, created_at: '2026-01-01',
  },
  {
    id: '2', tenant_id: 't1', type: 'bank_transfer',
    wallet_address: null, bank_name: 'HSBC', account_name: 'Acme Ltd',
    account_number: '12345678', sort_code: '01-02-03', iban: null,
    is_active: true, created_at: '2026-01-01',
  },
]

describe('buildPaymentMessage', () => {
  it('returns empty string for cash', () => {
    expect(buildPaymentMessage(
      { ref_number: 'PT-A-1', payment_amount: 100, payment_asset: 'cash', payment_address: null },
      configs,
    )).toBe('')
  })

  it('does not contain all methods for any input (customer_chooses branch removed)', () => {
    // The multi-method wall-of-text should never appear
    const result = buildPaymentMessage(
      { ref_number: 'PT-A-1', payment_amount: 100, payment_asset: 'usdt_trc20', payment_address: 'TXxx' },
      configs,
    )
    expect(result).not.toContain('Bank Transfer:')
    expect(result).toContain('TXxx')
  })

  it('builds crypto checkout message when URL provided', () => {
    const result = buildPaymentMessage(
      { ref_number: 'PT-A-1', payment_amount: 100, payment_asset: 'usdt_trc20', payment_address: 'TXxx' },
      configs,
      'https://pay.example.com/123',
    )
    expect(result).toContain('https://pay.example.com/123')
    expect(result).not.toContain('TXxx')
  })

  it('builds bank transfer message', () => {
    const result = buildPaymentMessage(
      { ref_number: 'PT-A-1', payment_amount: 100, payment_asset: 'bank_transfer', payment_address: null },
      configs,
    )
    expect(result).toContain('Acme Ltd')
    expect(result).toContain('PT-A-1')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:run -- src/lib/__tests__/payments.test.ts`
Expected: Some tests fail (particularly the "not contain all methods" test if `customer_chooses` branch still present)

- [ ] **Step 3: Delete the `customer_chooses` branch from `buildPaymentMessage` (lines 25–42)**

Remove this entire block from `src/lib/payments.ts`:
```typescript
if (order.payment_asset === 'customer_chooses') {
  const active = configs.filter(c => c.is_active && c.type !== 'cash')
  const lines = active.map(c => {
    if (c.type === 'bank_transfer') {
      const parts: string[] = []
      if (c.account_name) parts.push(c.account_name)
      if (c.account_number) parts.push(c.account_number)
      if (c.sort_code) parts.push(`Sort: ${c.sort_code}`)
      else if (c.iban) parts.push(`IBAN: ${c.iban}`)
      parts.push(`Ref: ${order.ref_number}`)
      return `Bank Transfer: ${parts.join(' · ')}`
    }
    return `${PAYMENT_LABELS[c.type as PaymentType] ?? c.type}: ${c.wallet_address}`
  })
  const hasBankTransfer = active.some(c => c.type === 'bank_transfer')
  const note = hasBankTransfer ? '\n\nPlease include the reference number for bank transfers.' : ''
  return `${header}\n\n${lines.join('\n')}${note}`
}
```

The complete function after deletion:
```typescript
export function buildPaymentMessage(
  order: OrderPaymentInfo,
  configs: TenantPaymentConfig[],
  checkoutUrl?: string,
): string {
  if (order.payment_asset === 'cash') return ''

  const amount = `$${order.payment_amount.toFixed(2)}`
  const header = `Payment details for order ${order.ref_number} · ${amount}`

  if (order.payment_asset === 'bank_transfer') {
    const cfg = configs.find(c => c.type === 'bank_transfer')
    if (!cfg) return `${header}\n\nBank transfer — contact us for details.`
    const lines = [
      'Bank Transfer:',
      `  Name: ${cfg.account_name}`,
      cfg.account_number ? `  Account: ${cfg.account_number}` : null,
      cfg.sort_code ? `  Sort code: ${cfg.sort_code}` : null,
      cfg.iban ? `  IBAN: ${cfg.iban}` : null,
      `  Reference: ${order.ref_number} (please include this)`,
    ].filter(Boolean)
    return `${header}\n\n${lines.join('\n')}`
  }

  if (CRYPTO_ASSETS.has(order.payment_asset)) {
    const label = PAYMENT_LABELS[order.payment_asset as PaymentType] ?? order.payment_asset
    if (checkoutUrl) {
      return `${header}\n\nPay with ${label} via secure checkout:\n${checkoutUrl}`
    }
    if (!order.payment_address) {
      return `${header}\n\nPayment details unavailable — contact the operator.`
    }
    return `${header}\n\n${label}: ${order.payment_address}\n\nPlease send the exact amount shown on the invoice.`
  }

  return `${header}\n\nPayment details unavailable — contact the operator.`
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm run test:run -- src/lib/__tests__/payments.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments.ts src/lib/__tests__/payments.test.ts
git commit -m "feat: remove customer_chooses branch from buildPaymentMessage"
```

---

## Task 5: Remove payment dropdown from `CreateOrderForm`

**Files:**
- Modify: `src/components/orders/CreateOrderForm.tsx`

- [ ] **Step 1: Remove `paymentAsset`, `paymentAddress`, `conversionRate`, `rateLoading` state (lines 26–27, 38–40)**

Delete these four state lines:
```typescript
const [paymentAsset, setPaymentAsset] = useState('cash')
const [paymentAddress, setPaymentAddress] = useState('')
// ...
const [conversionRate, setConversionRate] = useState<number | null>(null)
const [rateLoading, setRateLoading]       = useState(false)
```

- [ ] **Step 2: Delete the conversion-rate `useEffect` (lines 88–100)**

Delete the entire block:
```typescript
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

- [ ] **Step 3: Delete the `paymentOptions` computed variable (lines 116–126)**

Delete the entire block:
```typescript
const paymentOptions = (() => {
  const opts: { value: string; label: string }[] = [{ value: 'cash', label: 'Cash' }]
  for (const c of paymentConfigs) {
    const label = PAYMENT_LABELS[c.type as PaymentType]
    if (label && c.type !== 'cash') opts.push({ value: c.type, label })
  }
  if (paymentConfigs.filter(c => c.type !== 'cash').length >= 1) {
    opts.push({ value: 'customer_chooses', label: PAYMENT_LABELS.customer_chooses })
  }
  return opts
})()
```

- [ ] **Step 4: Delete the `{/* Payment */}` JSX section (lines 265–299)**

Delete the entire block:
```tsx
{/* Payment */}
<div className="pt-co-section">
  <div className="pt-co-lbl">Payment</div>
  <div className="pt-co-row">
    <select
      className="pt-input"
      style={{ flex: '0 0 160px' }}
      value={paymentAsset}
      onChange={e => {
        const type = e.target.value
        setPaymentAsset(type)
        const cfg = paymentConfigs.find(c => c.type === type)
        setPaymentAddress(cfg?.wallet_address ?? '')
      }}
    >
      {paymentOptions.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    {paymentAddress && (
      <input
        className="pt-input mono"
        style={{ flex: 1, fontSize: 11 }}
        value={paymentAddress}
        readOnly
        title="Receiving address (auto-filled from your wallet config)"
      />
    )}
  </div>
  {paymentConfigs.length === 0 && (
    <p style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 4 }}>
      Configure payment methods in Settings → Wallets &amp; Assets
    </p>
  )}
</div>
```

- [ ] **Step 5: Update the `submit` function — remove `paymentAsset` and `paymentAddress` from the `createOrder` call**

```typescript
// Before
const result = await createOrder({
  customerId: resolvedCustomerId,
  conversationId,
  paymentAsset,
  paymentAmount: total,
  paymentAddress: paymentAddress || undefined,
  shippingAddress: address.ln1 ? { ...address } : undefined,
  notes: notes || undefined,
  items: selectedItems.map(p => ({
    productId: p.id,
    qty: quantities[p.id] ?? 1,
    unitPriceSnapshot: p.unit_price,
  })),
})

// After
const result = await createOrder({
  customerId: resolvedCustomerId,
  conversationId,
  paymentAmount: total,
  shippingAddress: address.ln1 ? { ...address } : undefined,
  notes: notes || undefined,
  items: selectedItems.map(p => ({
    productId: p.id,
    qty: quantities[p.id] ?? 1,
    unitPriceSnapshot: p.unit_price,
  })),
})
```

- [ ] **Step 6: Remove unused imports**

Check line 5–6. `PAYMENT_LABELS` and `PaymentType` are only used in `paymentOptions` (now deleted). Remove them if they appear nowhere else in the file:
```typescript
// Remove if unused:
import { PAYMENT_LABELS, PAYMENT_BADGE } from '@/types/payments'
import type { PaymentType } from '@/types/payments'
```

- [ ] **Step 7: Run the full test suite**

Run: `npm run test:run`
Expected: PASS (no new failures)

- [ ] **Step 8: Commit**

```bash
git add src/components/orders/CreateOrderForm.tsx
git commit -m "feat: remove payment method dropdown from order creation — method set on detail page"
```

---

## Task 6: OrderDetailView — `created` panel + remove `customer_chooses`

**Files:**
- Modify: `src/components/orders/OrderDetailView.tsx`

Read the full file before starting. All edits are in the same file. Apply them in order.

- [ ] **Step 1: Update imports (lines 7, 16)**

Add `setOrderPaymentMethod` to the actions import:
```typescript
import { updateOrderStatus, saveOrderNotes, confirmPayment, packOrder, sendOrderPaymentDetails, setOrderPaymentMethod } from '@/app/orders/actions'
```

Add `buildPaymentMessage` to the payments lib import:
```typescript
import { CRYPTO_ASSETS, buildPaymentMessage } from '@/lib/payments'
```

- [ ] **Step 2: Update status constants (lines 22–26)**

```typescript
// Before
const STATUS_ORDER: OrderStatus[] = ['awaiting', 'confirming', 'packing', 'shipped', 'delivered']
const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting: 'Awaiting payment', confirming: 'Confirming',
  packing: 'Packing', shipped: 'Shipped', delivered: 'Delivered',
}

// After
const STATUS_ORDER: OrderStatus[] = ['created', 'awaiting', 'confirming', 'packing', 'shipped', 'delivered']
const STATUS_LABELS: Record<OrderStatus, string> = {
  created: 'Order created',
  awaiting: 'Awaiting payment', confirming: 'Confirming',
  packing: 'Packing', shipped: 'Shipped', delivered: 'Delivered',
}
```

`NEXT_STATUS` and `ADVANCE_LABELS` stay unchanged — `created` has no advance button (the send panel handles its transition).

- [ ] **Step 3: Update state declarations (lines 85, 92)**

Remove `confirmAsset` state (line 85 — delete the line):
```typescript
// Delete:
const [confirmAsset, setConfirmAsset] = useState('')
```

Extend `sendState` type (line 92) to add `'confirming'`:
```typescript
const [sendState, setSendState] = useState<'idle' | 'confirming' | 'sending' | 'sent' | 'error'>('idle')
```

Add `selectedAsset` state immediately after line 94:
```typescript
const [selectedAsset, setSelectedAsset] = useState<string | null>(order.payment_asset ?? null)
```

- [ ] **Step 4: Update `showCryptoLinkField` (lines 151–153)**

```typescript
// Before
const showCryptoLinkField =
  order.payment_asset === 'customer_chooses' ||
  CRYPTO_ASSETS.has(order.payment_asset)

// After
const showCryptoLinkField = CRYPTO_ASSETS.has(order.payment_asset ?? '')
```

- [ ] **Step 5: Update `handleConfirm` (lines 170–179) — remove `customer_chooses` check**

```typescript
// Before
const handleConfirm = () => {
  if (order.payment_asset === 'customer_chooses' && !confirmAsset) {
    setConfirmError('Please select the payment method used'); return
  }
  setConfirmError('')
  startTransition(async () => {
    const result = await confirmPayment(order.id, {
      actualPaymentAsset: order.payment_asset === 'customer_chooses' ? confirmAsset : undefined,
      txHash: txHash || undefined,
    })

// After
const handleConfirm = () => {
  setConfirmError('')
  startTransition(async () => {
    const result = await confirmPayment(order.id, {
      txHash: txHash || undefined,
    })
```

- [ ] **Step 6: Add `handleAssetChange` function directly after `handleConfirm`**

```typescript
function handleAssetChange(asset: string) {
  setSelectedAsset(asset)
  setOrderPaymentMethod(order.id, asset).catch(() => {})
}
```

- [ ] **Step 7: Add `previewMessage` computed value directly after `handleAssetChange`**

Cash orders have no message to send — `buildPaymentMessage` returns `''` for cash. Show a plain note in the preview instead so the Send button stays enabled.

```typescript
const previewMessage: string = (() => {
  if (!selectedAsset) return ''
  if (selectedAsset === 'cash') return 'Cash payment — no message will be sent. The order will move to awaiting payment.'
  return buildPaymentMessage(
    {
      ref_number: order.ref_number,
      payment_amount: order.payment_amount,
      payment_asset: selectedAsset,
      payment_address: paymentConfigs.find(c => c.type === selectedAsset)?.wallet_address ?? null,
    },
    paymentConfigs,
    CRYPTO_ASSETS.has(selectedAsset) && cryptoPaymentLink
      ? cryptoPaymentLink.hosted_url
      : undefined,
  )
})()
```

- [ ] **Step 8: Remove `customer_chooses` block from the confirm dialog JSX (lines 293–304)**

Delete this entire block inside the awaiting panel's `showConfirmDialog`:
```tsx
{order.payment_asset === 'customer_chooses' && (
  <div style={{ marginBottom: 10 }}>
    <label style={{ fontSize: 11, color: 'var(--pt-fg-3)', display: 'block', marginBottom: 4 }}>
      Which method did they use?
    </label>
    <select className="pt-input" style={{ fontSize: 12 }} value={confirmAsset} onChange={e => setConfirmAsset(e.target.value)}>
      <option value="">Select…</option>
      {paymentConfigs.filter(c => c.type !== 'cash' && c.type !== 'customer_chooses').map(c => (
        <option key={c.type} value={c.type}>{PAYMENT_LABELS[c.type as keyof typeof PAYMENT_LABELS] ?? c.type}</option>
      ))}
    </select>
  </div>
)}
```

- [ ] **Step 9: Add the `created` status panel JSX**

After the closing `)}` of the awaiting panel (after line 329), add this entire block:

```tsx
{/* Payment panel — created status (payment setup step) */}
{status === 'created' && (
  <div className="pt-od-payment-panel is-setup">
    <div className="pt-od-payment-hd">
      <span>Payment setup</span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0 4px' }}>

      {/* Method dropdown — autosaves on change */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--pt-fg-3)', width: 80, flexShrink: 0 }}>Method</span>
        <select
          className="pt-input"
          style={{ fontSize: 12, flex: 1, maxWidth: 200 }}
          value={selectedAsset ?? ''}
          onChange={e => handleAssetChange(e.target.value)}
        >
          <option value="" disabled>Select method…</option>
          <option value="cash">Cash</option>
          {paymentConfigs
            .filter(c => c.is_active && c.type !== 'cash')
            .map(c => (
              <option key={c.type} value={c.type}>
                {PAYMENT_LABELS[c.type as keyof typeof PAYMENT_LABELS] ?? c.type}
              </option>
            ))}
        </select>
      </div>

      {/* Crypto link row — only when a crypto asset is selected */}
      {selectedAsset !== null && CRYPTO_ASSETS.has(selectedAsset) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--pt-fg-3)', width: 80, flexShrink: 0 }}>Crypto link</span>
          {cryptoPaymentLink ? (
            <a
              href={`/payments?link=${cryptoPaymentLink.id}`}
              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '0.5px solid var(--pt-cool)', background: 'var(--pt-cool-soft)', color: 'var(--pt-cool)', textDecoration: 'none', display: 'inline-block' }}
            >
              View in Payments →
            </a>
          ) : (
            <a
              href="/payments"
              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '0.5px solid var(--pt-cool)', background: 'var(--pt-cool-soft)', color: 'var(--pt-cool)', textDecoration: 'none', display: 'inline-block' }}
            >
              Create payment link →
            </a>
          )}
        </div>
      )}

      {/* Send state machine */}
      {sendState === 'idle' && (
        <div>
          <button
            className="pt-btn pt-btn-ghost"
            style={{ fontSize: 11 }}
            disabled={!selectedAsset}
            onClick={() => setSendState('confirming')}
          >
            <Icons.send size={11} /> Send payment details
          </button>
        </div>
      )}

      {sendState === 'confirming' && (
        <div style={{ borderRadius: 6, border: '0.5px solid var(--pt-line)', padding: '12px 14px', background: 'var(--pt-surface)', marginTop: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 8 }}>Preview message</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--pt-fg-2)', background: 'var(--pt-bg-2)', borderRadius: 4, padding: '8px 10px', marginBottom: 10 }}>
            {previewMessage || 'No message to send for this method.'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="pt-btn pt-btn-primary"
              style={{ fontSize: 11 }}
              disabled={!selectedAsset}
              onClick={async () => {
                setSendState('sending')
                setSendError('')
                const checkoutUrl = selectedAsset && CRYPTO_ASSETS.has(selectedAsset) && cryptoPaymentLink
                  ? cryptoPaymentLink.hosted_url
                  : undefined
                const result = await sendOrderPaymentDetails(order.id, checkoutUrl)
                  .catch(e => ({ error: e instanceof Error ? e.message : 'Unknown error' }))
                if ('error' in result) {
                  setSendError(result.error)
                  setSendState('error')
                } else {
                  setSentConvId(result.conversationId)
                  setSendState('sent')
                  router.refresh()
                }
              }}
            >
              Send
            </button>
            <button
              className="pt-btn pt-btn-ghost"
              style={{ fontSize: 11 }}
              onClick={() => setSendState('idle')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {sendState === 'sending' && (
        <div style={{ paddingTop: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 6 }}>Sending…</div>
          <div className="pt-pac-progressbar"><div className="pt-pac-progressbar-fill" /></div>
        </div>
      )}

      {sendState === 'sent' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--pt-ok)' }}>✓ Sent!</span>
          <button
            className="pt-btn pt-btn-ghost"
            style={{ fontSize: 11 }}
            onClick={() => sentConvId ? router.push(`/inbox?conversation=${sentConvId}`) : router.push('/inbox')}
          >
            Go to chat →
          </button>
        </div>
      )}

      {sendState === 'error' && (
        <div style={{ paddingTop: 4 }}>
          <p style={{ fontSize: 11, color: 'var(--pt-danger)', margin: '0 0 6px' }}>{sendError || 'Send failed'}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => setSendState('confirming')}>
              Retry
            </button>
            <button
              className="pt-btn pt-btn-ghost"
              style={{ fontSize: 11 }}
              onClick={() => sentConvId ? router.push(`/inbox?conversation=${sentConvId}`) : router.push('/inbox')}
            >
              Open chat
            </button>
          </div>
        </div>
      )}

    </div>
  </div>
)}
```

- [ ] **Step 10: Run the full test suite**

Run: `npm run test:run`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/components/orders/OrderDetailView.tsx
git commit -m "feat: add created status panel with method picker and send flow, remove customer_chooses"
```
