# Order Payment Flow Redesign

## Goal

Add a `created` pre-payment status to the order lifecycle, remove `customer_chooses`, and replace the implicit "order starts awaiting" model with an explicit payment setup step: merchant creates order → selects payment method on the detail page → sends payment details → order moves to `awaiting`.

## Architecture

Three independent layers:

1. **Schema + types** — new `created` status, nullable `payment_asset`, remove `customer_chooses`
2. **Order creation** — payment dropdown removed; orders start as `created` with no asset
3. **Created status panel** — new panel on `OrderDetailView` with method dropdown, crypto link row, and send flow that mirrors the `PendingApprovalCard` state machine

---

## Files

| File | Change |
|------|--------|
| `supabase/migrations/<timestamp>_order_created_status.sql` | Add `created` to enum, default status to `created`, make `payment_asset` nullable, remove `customer_chooses` |
| `src/types/orders.ts` | Add `'created'` to `OrderStatus` |
| `src/types/payments.ts` | Remove `'customer_chooses'` from `PaymentType` |
| `src/app/orders/actions.ts` | Make `paymentAsset` optional in `createOrder`; add `setOrderPaymentMethod`; update `sendOrderPaymentDetails` to transition `created → awaiting` |
| `src/components/orders/CreateOrderForm.tsx` | Remove payment dropdown |
| `src/components/orders/OrderDetailView.tsx` | Add `created` status panel with method picker, crypto link row, send state machine |

---

## Detailed Design

### 1. Schema migration

```sql
-- Add 'created' to the order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'created' BEFORE 'awaiting';

-- Change default so new orders start as 'created'
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'created';

-- Make payment_asset nullable
ALTER TABLE orders ALTER COLUMN payment_asset DROP NOT NULL;

-- Migrate existing customer_chooses rows to null
UPDATE orders SET payment_asset = NULL WHERE payment_asset = 'customer_chooses';

-- Remove customer_chooses from the payment_type enum
-- (two-step: no rows remain with this value after the UPDATE above)
ALTER TYPE payment_type RENAME TO payment_type_old;
CREATE TYPE payment_type AS ENUM (
  'usdt_trc20', 'usdt_erc20', 'btc', 'eth', 'usdc_erc20',
  'ltc', 'xmr', 'sol', 'bank_transfer', 'cash'
);
ALTER TABLE orders
  ALTER COLUMN payment_asset TYPE payment_type USING payment_asset::text::payment_type;
DROP TYPE payment_type_old;
```

### 2. Type changes

**`src/types/orders.ts`**

```typescript
// Before
export type OrderStatus = 'awaiting' | 'confirming' | 'packing' | 'shipped' | 'delivered'

// After
export type OrderStatus = 'created' | 'awaiting' | 'confirming' | 'packing' | 'shipped' | 'delivered'
```

**`src/types/payments.ts`**

Remove `'customer_chooses'` from `PaymentType`. The type becomes:

```typescript
export type PaymentType =
  | 'usdt_trc20' | 'usdt_erc20' | 'btc' | 'eth' | 'usdc_erc20'
  | 'ltc' | 'xmr' | 'sol' | 'bank_transfer' | 'cash'
```

`DbOrderRow.payment_asset` in `src/types/orders.ts` should be typed `PaymentType | null` (was `string`).

### 3. Server actions

**`createOrder` — make `paymentAsset` optional**

```typescript
export async function createOrder(data: {
  customerId: string
  conversationId?: string
  paymentAsset?: string        // was required, now optional
  paymentAmount: number
  // ...rest unchanged
}): Promise<{ success: true; orderId: string; refNumber: string } | { error: string }>
```

The insert omits `payment_asset` when not provided (DB column is now nullable, default is `null`). The `status` column default (`'created'`) handles the initial status — no explicit insert needed.

**New action: `setOrderPaymentMethod`**

```typescript
export async function setOrderPaymentMethod(
  orderId: string,
  asset: PaymentType,
): Promise<{ ok: true } | { error: string }>
```

Updates `orders.payment_asset = asset` for the given order. No status transition — just persists the selection. RLS ensures the tenant can only update their own orders.

**Updated: `sendOrderPaymentDetails`**

Signature unchanged. New behaviour: after sending the message, if the order's current status is `'created'`, the action also updates `status = 'awaiting'` in the same DB call:

```typescript
// After successful send, inside sendOrderPaymentDetails:
if (order.status === 'created') {
  await supabase
    .from('orders')
    .update({ status: 'awaiting' })
    .eq('id', orderId)
}
```

The `checkoutUrl` parameter continues to work as before — callers pass the crypto link's `hosted_url` when available.

### 4. Order creation — remove payment dropdown

**`CreateOrderForm.tsx`**

- Remove the payment method `<select>` and its associated state (`paymentAsset` / `setPaymentAsset`)
- Remove the `paymentAsset` field from the `createOrder` call
- No other changes — customer, products, notes, amounts remain as-is

The form becomes simpler. Orders are created with `status = 'created'` and `payment_asset = null` by default.

### 5. Created status panel — `OrderDetailView`

A new panel renders when `order.status === 'created'`. It replaces the awaiting banner for this status only.

**Visual structure:**

```
┌──────────────────────────────────────────────────────────┐
│▌ PAYMENT SETUP                                           │
│                                                          │
│  Method   [Select method ▾]                              │
│                                                          │
│  [Send payment details]   ← disabled until method set   │
└──────────────────────────────────────────────────────────┘
```

When a crypto asset is selected:

```
┌──────────────────────────────────────────────────────────┐
│▌ PAYMENT SETUP                                           │
│                                                          │
│  Method      [USDT TRC20 ▾]                              │
│  Crypto link [Create payment link →]  (or View →)        │
│                                                          │
│  [Send payment details]                                  │
└──────────────────────────────────────────────────────────┘
```

**Method dropdown population:**

The dropdown lists all active payment configs for the tenant, in the same order they appear in the payment method settings. Labels use human-readable names (e.g. "USDT TRC20", "Bank Transfer", "Cash"). The options are derived from the `paymentConfigs` prop already passed to `OrderDetailView`.

**Method autosave:**

On `onChange` of the method dropdown, the component calls `setOrderPaymentMethod(order.id, asset)`. This persists the selection immediately so navigating away and back preserves the choice. No debounce needed — the action is idempotent.

**Crypto link row:**

Appears only when the selected `payment_asset` is a crypto type (i.e. `CRYPTO_ASSETS.has(selectedAsset)`). Reuses the identical JSX already present in the Payment card's `showCryptoLinkField` block:

- Link exists → `[View in Payments →]` navigating to `/payments?link=<id>`
- No link → `[Create payment link →]` navigating to `/payments`

**Send button state:**

- Disabled when `selectedAsset === null`
- Enabled once any method is selected
- No additional gating for crypto without a link — if no link exists, the send falls back to the wallet address (same behaviour as before)

**Component state:**

```typescript
const [selectedAsset, setSelectedAsset] = useState<PaymentType | null>(
  order.payment_asset ?? null
)
type SendState = 'idle' | 'confirming' | 'sending' | 'sent' | 'error'
const [sendState, setSendState] = useState<SendState>('idle')
const [sendError, setSendError] = useState('')
const [sentConvId, setSentConvId] = useState<string | null>(null)
```

`selectedAsset` is seeded from `order.payment_asset` so a previously-saved selection is reflected on load.

### 6. Send state machine — mirrors `PendingApprovalCard`

The send button triggers the same `idle → confirming → sending → sent | error` flow used in `src/components/shared/PendingApprovalCard.tsx`.

**`idle`:** "Send payment details" button (disabled until method selected).

**`confirming`:** Inline preview panel appears below the method row showing the message text that will be sent. "Send" and "Cancel" buttons. Message is read-only in this context (no inline editing needed — unlike automations, the payment message content is deterministic from the order data). Cancel returns to `idle`.

**`sending`:** Progress bar animation (reuse `.pt-pac-progressbar` CSS class). Calls:

```typescript
const checkoutUrl =
  CRYPTO_ASSETS.has(selectedAsset!) && cryptoPaymentLink
    ? cryptoPaymentLink.hosted_url
    : undefined
const result = await sendOrderPaymentDetails(order.id, checkoutUrl)
```

**`sent`:** Checkmark + "Sent!" label + "Go to chat →" button navigating to `/inbox?conversation=<sentConvId>`. After setting `sendState = 'sent'`, the component calls `router.refresh()` so the server component re-fetches the order — the `created` panel is replaced by the slim awaiting banner without a full page navigation.

**`error`:** Error message inline + "Try again" button returns to `confirming`.

---

## What Is Removed

- `customer_chooses` — from DB enum, `PaymentType`, `CreateOrderForm`, and all render paths in `OrderDetailView`
- Payment method dropdown from `CreateOrderForm`
- `paymentAsset` as a required field in `createOrder`
- The `order.payment_asset === 'customer_chooses'` branch from the `showCryptoLinkField` condition in the Payment card — the condition simplifies to `CRYPTO_ASSETS.has(order.payment_asset)` only

---

## Out of Scope

- Quoting / price negotiation before order creation
- Inline message editing in the confirming step (preview is read-only)
- Any changes to the `awaiting`, `confirming`, `packing`, `shipped`, or `delivered` status panels
- Changing `PaymentLinkDetail`, `CreatePaymentLinkModal`, or `PaymentsView`
- Handling orders that were previously `customer_chooses` in any special way — they become `null` asset and will show the method dropdown when viewed
