# Order Payment Section Redesign

## Goal

Replace the cramped full-bleed awaiting-payment banner with a slim action strip, and enrich the Payment card with a Crypto Link field that surfaces payment link status and deep-links directly to the link detail view.

## Architecture

Two independent surface changes plus one logic fix:

1. **Slim banner** — the `is-awaiting` panel loses its body row entirely and becomes a single-line action strip (label + buttons only)
2. **Enriched Payment card** — a new "CRYPTO LINK" field row is appended to the card's body whenever the order could have a crypto payment link
3. **Deep-link support** — `/payments?link=<id>` reads the query param and opens the matching link's detail view immediately

## Files

| File | Change |
|------|--------|
| `src/components/orders/OrderDetailView.tsx` | Slim banner JSX; new Crypto Link field in Payment card |
| `styles/order-detail.css` | Updated `.pt-od-payment-panel` slim padding rule |
| `styles/orders.css` | Remove conflicting `.pt-od-payment-panel` block (overrides padding and adds unwanted border-radius) |
| `src/lib/payments.ts` | Export `CRYPTO_ASSETS` set so `OrderDetailView` can import it |
| `src/app/payments/page.tsx` | Read `searchParams.link`; pass as `initialLinkId` to `PaymentsView` |
| `src/components/payments/PaymentsView.tsx` | Accept `initialLinkId?: string`; initialise `selectedId` + `view` from it |

---

## Detailed Design

### 1. Slim awaiting banner

**Before:** Full-bleed panel with label row + body row (asset name, address, crypto link status, send/mark buttons). Padding is uneven and the body row duplicates information already in the Payment card.

**After:** Single-row strip — "AWAITING PAYMENT" label on the left, action buttons on the right. No body row at all.

```
┌──────────────────────────────────────────────────────────────────┐
│▌ AWAITING PAYMENT        [Send payment details]  [Mark received] │
└──────────────────────────────────────────────────────────────────┘
```

CSS change in `order-detail.css`:
- `.pt-od-payment-panel` padding becomes `8px 20px 8px 17px`
- `.pt-od-payment-body` display becomes `none` (or removed from JSX entirely)
- Remove the conflicting `.pt-od-payment-panel` block in `styles/orders.css` (it overrides padding and adds a border-radius that fights the left-border treatment)

JSX change in `OrderDetailView.tsx`:
- Delete the entire `<div className="pt-od-payment-body">…</div>` block from the awaiting panel (JSX deletion, not a CSS hide — there is no reason to keep dead markup)
- Keep `showConfirmDialog` block in place (it stays inside the panel below the header row)

The send state machine buttons (`sendState === 'idle'` → `'sending'` → `'sent'` → `'error'`) remain in the banner header row, unchanged.

### 2. Crypto Link field in Payment card

A new field row is appended to the Payment card's `pt-od-pay-grid` whenever the order's `payment_asset` is a crypto type **or** `customer_chooses`. It is always the last field in the grid.

**When a link exists** (`cryptoPaymentLink !== null`):

```
CRYPTO LINK
[View in Payments →]        ← square-edged blue outlined button
```

Clicking navigates to `/payments?link=<cryptoPaymentLink.id>`.

**When no link exists yet**:

```
CRYPTO LINK
[Create payment link →]     ← same square-edged button style
```

Clicking navigates to `/payments`.

Button style (both states): `font-size: 11px`, `padding: 3px 9px`, `border-radius: 5px`, `border: 0.5px solid var(--pt-cool)`, `background: var(--pt-cool-soft)`, `color: var(--pt-cool)`. Matches the existing `.pt-tag` link pill used elsewhere in the design system.

**Visibility logic:**

```typescript
const showCryptoLinkField =
  cryptoPaymentLink !== null ||
  order.payment_asset === 'customer_chooses' ||
  CRYPTO_ASSETS.has(order.payment_asset)
```

`CRYPTO_ASSETS` is the set `['usdt_trc20', 'usdt_erc20', 'btc', 'eth', 'usdc_erc20', 'ltc', 'xmr', 'sol']` — currently a private constant in `src/lib/payments.ts`. It must be exported (`export const CRYPTO_ASSETS = …`) so `OrderDetailView` can import it directly.

This fixes the existing bug where `customer_chooses` orders never showed crypto link info because the old `isCryptoAsset` variable excluded that payment type.

### 3. Deep-link: `/payments?link=<id>`

**`src/app/payments/page.tsx`**

Change signature to receive `searchParams`:

```typescript
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>
}) {
  const { link: initialLinkId } = await searchParams
  // ...
  return (
    <Shell section="Payments">
      <PaymentsView
        wallet={wallet}
        recentTransactions={recentTransactions}
        paymentLinks={paymentLinks}
        baseCurrency={baseCurrency}
        initialLinkId={initialLinkId ?? null}
      />
    </Shell>
  )
}
```

**`src/components/payments/PaymentsView.tsx`**

Add `initialLinkId: string | null` to props. Use it to seed the initial state:

```typescript
const [selectedId, setSelectedId] = useState<string | null>(initialLinkId)
const [view, setView] = useState<'list' | 'detail'>(initialLinkId ? 'detail' : 'list')
```

No other changes to `PaymentsView` — the existing detail rendering logic already handles a non-null `selectedId`.

---

## What Is Removed

- The body row (`pt-od-payment-body`) from the awaiting banner — asset name, address, exchange rate, and the old crypto link status span all move to (or already live in) the Payment card
- The `isCryptoAsset` variable in `OrderDetailView` — replaced by `showCryptoLinkField`
- "Copy address" button — it was in the banner body, which is now gone. The address is still visible in the Payment card's grid.
- "All configured methods offered" text — it was in the banner body
- The redundant `.pt-od-payment-panel` CSS block in `styles/orders.css`

---

## Out of Scope

- Changing the Payment card's existing grid fields (Asset, Receiving address, Tx hash, Reference)
- Changing the "Payment confirmed" panel (shown when `status !== 'awaiting'`)
- Adding a status label (Waiting / Confirming / Confirmed) next to the "View in Payments →" button — the detail view has full status; the card just needs a way in
- Any changes to `PaymentLinkDetail` or `CreatePaymentLinkModal`
