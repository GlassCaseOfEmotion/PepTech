# Order Payment Section Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cramped awaiting-payment banner with a slim action strip, add a Crypto Link field to the Payment card that surfaces link status and deep-links to the detail view, and fix the logic bug that hides crypto link info for `customer_chooses` orders.

**Architecture:** Four sequential changes: export `CRYPTO_ASSETS` so the UI can import it; slim the banner CSS and delete a conflicting CSS block in `orders.css`; rewrite the banner JSX and add the Crypto Link field to the Payment card; add `searchParams` deep-link support to the payments page and wire `PaymentsView` to open the matching link directly.

**Tech Stack:** Next.js 15 App Router, TypeScript, `pt-*` CSS design system (no Tailwind), Vitest

---

## File Map

| File | Change |
|------|--------|
| `src/lib/payments.ts` | Add `export` to `CRYPTO_ASSETS` |
| `styles/order-detail.css` | Slim padding on `.pt-od-payment-panel`; remove `padding-bottom` from `.pt-od-payment-hd` |
| `styles/orders.css` | Delete entire "Order Detail Payment Panel" section (~lines 219–237) |
| `src/components/orders/OrderDetailView.tsx` | Import `CRYPTO_ASSETS`; delete banner body JSX; replace `isCryptoAsset` with `showCryptoLinkField`; add Crypto Link field to Payment card |
| `src/app/payments/page.tsx` | Accept `searchParams`; pass `initialLinkId` to `PaymentsView` |
| `src/components/payments/PaymentsView.tsx` | Accept `initialLinkId` prop; seed `selectedId` and `view` from it |

---

## Task 1: Export CRYPTO_ASSETS from payments.ts

**Files:**
- Modify: `src/lib/payments.ts:11`

- [ ] **Step 1: Read the file**

Read `src/lib/payments.ts`. The `CRYPTO_ASSETS` constant is at line 11:
```typescript
const CRYPTO_ASSETS = new Set([
  'usdt_trc20', 'usdt_erc20', 'btc', 'eth', 'usdc_erc20', 'ltc', 'xmr', 'sol',
])
```

- [ ] **Step 2: Add `export`**

Change it to:
```typescript
export const CRYPTO_ASSETS = new Set([
  'usdt_trc20', 'usdt_erc20', 'btc', 'eth', 'usdc_erc20', 'ltc', 'xmr', 'sol',
])
```

- [ ] **Step 3: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 10
```

Expected: no output (no errors).

- [ ] **Step 4: Commit**

```powershell
git add src/lib/payments.ts
git commit -m "feat: export CRYPTO_ASSETS from payments.ts"
```

---

## Task 2: CSS — slim banner and remove conflicting block

**Files:**
- Modify: `styles/order-detail.css:381–404`
- Modify: `styles/orders.css` (delete the "Order Detail Payment Panel" section)

**Context:** `orders.css` has a `.pt-od-payment-panel` block that was written before `order-detail.css`. It sets `border-radius`, `border`, and `padding: 12px 16px` which fight the `order-detail.css` rules (left-border glow, full-bleed appearance). CSS loads `orders.css` before `order-detail.css` so `order-detail.css` wins on same-specificity properties, but `border-radius` in `orders.css` still shows because `order-detail.css` doesn't reset it.

- [ ] **Step 1: Read both CSS files**

Read `styles/orders.css` lines 217–245.
Read `styles/order-detail.css` lines 380–430.

- [ ] **Step 2: Update `styles/order-detail.css`**

Replace the `.pt-od-payment-panel` and `.pt-od-payment-hd` rules (lines 381–404):

```css
/* ── Payment action banner ──────────────────────────────────────────────── */
.pt-od-payment-panel {
  border-bottom: 0.5px solid var(--pt-line);
  padding: 8px 20px 8px 17px;
  display: flex; flex-direction: column; gap: 0;
}
.pt-od-payment-panel.is-awaiting {
  background: var(--pt-warn-soft);
  box-shadow: inset 3px 0 0 var(--pt-warn);
}
.pt-od-payment-panel.is-confirmed {
  background: var(--pt-ok-soft);
  box-shadow: inset 3px 0 0 var(--pt-ok);
}

.pt-od-payment-hd {
  display: flex; align-items: center; justify-content: space-between;
  gap: 14px;
}
.pt-od-payment-hd > span {
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.07em;
}
.is-awaiting .pt-od-payment-hd > span { color: var(--pt-warn); }
.is-confirmed .pt-od-payment-hd > span { color: var(--pt-ok); }
```

(The only changes from the existing rules: padding shrinks from `10px 22px 12px 19px` to `8px 20px 8px 17px`; `padding-bottom: 8px` removed from `.pt-od-payment-hd`.)

- [ ] **Step 3: Delete the conflicting block from `styles/orders.css`**

In `styles/orders.css`, find the comment `/* ─── Order Detail Payment Panel */` and delete from that comment through the end of the `.pt-od-confirm-dialog` closing brace. It looks like this — delete the entire block:

```css
/* ─── Order Detail Payment Panel ────────────────────────────────────────── */
.pt-od-payment-panel {
  background: var(--pt-surface);
  border: 0.5px solid var(--pt-line);
  border-radius: var(--pt-radius);
  padding: 12px 16px;
  margin: 0 0 16px;
}
.pt-od-payment-hd {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px; font-size: 12px; font-weight: 600;
}
.pt-od-payment-body { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.pt-od-payment-asset { font-size: 12px; font-weight: 600; }
.pt-od-payment-addr { font-size: 11px; color: var(--pt-fg-3); }
.pt-od-confirm-dialog {
  margin-top: 12px; padding-top: 12px;
  border-top: 0.5px solid var(--pt-line-soft);
}
```

- [ ] **Step 4: Verify TypeScript (CSS changes don't need tsc, but confirm no build errors)**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 10
```

Expected: no output.

- [ ] **Step 5: Commit**

```powershell
git add styles/order-detail.css styles/orders.css
git commit -m "fix: slim payment banner CSS; remove conflicting orders.css payment panel block"
```

---

## Task 3: OrderDetailView — slim banner JSX + Crypto Link field

**Files:**
- Modify: `src/components/orders/OrderDetailView.tsx`

**Context:** The awaiting-payment panel currently has a `pt-od-payment-body` div with asset name, address, exchange rate, and crypto link status. All of that moves out of the banner — the banner becomes a single header row only. The Payment card (further down in the same component) gains a "CRYPTO LINK" field row. The existing `isCryptoAsset` variable is replaced by `showCryptoLinkField` which also covers `customer_chooses` orders.

- [ ] **Step 1: Read the current file**

Read `src/components/orders/OrderDetailView.tsx` in full.

- [ ] **Step 2: Update the import line for payments actions**

Find the line:
```typescript
import { updateOrderStatus, saveOrderNotes, confirmPayment, packOrder, sendOrderPaymentDetails } from '@/app/orders/actions'
```

Add an import for `CRYPTO_ASSETS` from `@/lib/payments` (this file already imports `buildPaymentMessage` — wait, that was removed. Add a fresh import):

Add this line after the existing `@/lib/currency` import:
```typescript
import { CRYPTO_ASSETS } from '@/lib/payments'
```

- [ ] **Step 3: Replace `isCryptoAsset` with `showCryptoLinkField`**

Find:
```typescript
  const isCryptoAsset = !['bank_transfer', 'cash', 'customer_chooses'].includes(order.payment_asset)
```

Replace with:
```typescript
  const showCryptoLinkField =
    cryptoPaymentLink !== null ||
    order.payment_asset === 'customer_chooses' ||
    CRYPTO_ASSETS.has(order.payment_asset)
```

- [ ] **Step 4: Delete the `pt-od-payment-body` div from the awaiting banner**

Find and delete the entire block (keep everything else in the panel — header row and confirm dialog stay):

```tsx
          <div className="pt-od-payment-body">
            <span className="pt-od-payment-asset">
              {PAYMENT_LABELS[order.payment_asset as keyof typeof PAYMENT_LABELS] ?? order.payment_asset}
            </span>

            {isCryptoAsset && cryptoPaymentLink && (
              <a
                href="/payments"
                style={{
                  fontSize: 11,
                  color: cryptoPaymentLink.status === 'finished' ? 'var(--pt-ok)' : 'var(--pt-fg-3)',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  textDecoration: 'none',
                }}
              >
                {cryptoPaymentLink.status === 'finished' ? '✓ Confirmed' :
                 cryptoPaymentLink.status === 'confirming' ? '↻ Confirming' :
                 '● Waiting for payment'} →
              </a>
            )}
            {isCryptoAsset && !cryptoPaymentLink && (
              <a
                href="/payments"
                className="pt-btn pt-btn-ghost"
                style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Icons.send size={10} /> Create payment link →
              </a>
            )}

            {!isCryptoAsset && order.payment_address && (
              <span className="pt-od-payment-addr mono">{order.payment_address}</span>
            )}

            {order.payment_asset === 'customer_chooses' && (
              <span style={{ fontSize: 11, color: 'var(--pt-fg-4)' }}>All configured methods offered</span>
            )}
            {order.exchange_rate && (
              <span style={{ fontSize: 11, color: 'var(--pt-fg-4)' }}>
                rate: 1 {PAYMENT_BADGE[order.payment_asset]?.key?.toUpperCase() ?? order.payment_asset} = {formatAmount(order.exchange_rate, order.currency ?? 'USD')}
              </span>
            )}
          </div>
```

After deletion, the awaiting panel should look like:
```tsx
      {status === 'awaiting' && order.payment_asset !== 'cash' && (
        <div className="pt-od-payment-panel is-awaiting">
          <div className="pt-od-payment-hd">
            <span>Awaiting payment</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* send state machine buttons */}
              ...
              <button className="pt-btn pt-btn-primary" ...>Mark as received</button>
            </div>
          </div>

          {showConfirmDialog && (
            <div className="pt-od-confirm-dialog">
              ...
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 5: Add the Crypto Link field to the Payment card**

Find the Payment card's `pt-od-pay-grid` div. It currently ends with:
```tsx
                <div>
                  <div className="pt-od-pay-lbl">Reference</div>
                  <div className="pt-od-pay-val mono">PT-{order.ref_number}</div>
                </div>
              </div>
```

After the Reference field (and before `</div>` that closes `pt-od-pay-grid`), insert:

```tsx
                {showCryptoLinkField && (
                  <div>
                    <div className="pt-od-pay-lbl">Crypto link</div>
                    <div className="pt-od-pay-val">
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
                  </div>
                )}
```

- [ ] **Step 6: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: no output. If TypeScript complains about `isCryptoAsset` being used somewhere, find the remaining reference and replace it with `showCryptoLinkField` or delete it.

- [ ] **Step 7: Run tests**

```powershell
npm run test:run
```

Expected: same pass/fail as before.

- [ ] **Step 8: Commit**

```powershell
git add src/components/orders/OrderDetailView.tsx
git commit -m "feat: slim order payment banner; add Crypto Link field to payment card"
```

---

## Task 4: Deep-link — /payments?link=<id> opens detail view

**Files:**
- Modify: `src/app/payments/page.tsx`
- Modify: `src/components/payments/PaymentsView.tsx:120–131`

**Context:** `PaymentsView` currently initialises `selectedId` and `view` as static `null` / `'list'`. To support deep-linking from the order page, the server component reads `searchParams.link` and passes it as `initialLinkId`. `PaymentsView` then seeds its state from that prop, so the detail view opens immediately if a match is found.

- [ ] **Step 1: Read the current payments page**

Read `src/app/payments/page.tsx`.

- [ ] **Step 2: Update `PaymentsPage` to read searchParams**

Replace the entire file with:

```typescript
// src/app/payments/page.tsx
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { PaymentsView } from '@/components/payments/PaymentsView'
import { getWallet, getPaymentLinks, getTenantCurrency } from './actions'

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>
}) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const { link: initialLinkId } = await searchParams

  const [{ wallet, recentTransactions }, paymentLinks, baseCurrency] = await Promise.all([
    getWallet(),
    getPaymentLinks(),
    getTenantCurrency(),
  ])

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

- [ ] **Step 3: Read the current PaymentsView**

Read `src/components/payments/PaymentsView.tsx` lines 120–135.

- [ ] **Step 4: Update PaymentsView props and initial state**

Find the function signature (around line 120):
```typescript
export function PaymentsView({
  wallet,
  recentTransactions,
  paymentLinks,
  baseCurrency,
}: {
  wallet: TenantCryptoWallet | null
  recentTransactions: WalletTransaction[]
  paymentLinks: CryptoPaymentLinkWithOrder[]
  baseCurrency?: string
}) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
```

Replace with:
```typescript
export function PaymentsView({
  wallet,
  recentTransactions,
  paymentLinks,
  baseCurrency,
  initialLinkId,
}: {
  wallet: TenantCryptoWallet | null
  recentTransactions: WalletTransaction[]
  paymentLinks: CryptoPaymentLinkWithOrder[]
  baseCurrency?: string
  initialLinkId?: string | null
}) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>(initialLinkId ? 'detail' : 'list')
  const [selectedId, setSelectedId] = useState<string | null>(initialLinkId ?? null)
```

- [ ] **Step 5: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: no output.

- [ ] **Step 6: Run tests**

```powershell
npm run test:run
```

Expected: same pass/fail as before.

- [ ] **Step 7: Commit and push**

```powershell
git add src/app/payments/page.tsx src/components/payments/PaymentsView.tsx
git commit -m "feat: deep-link /payments?link=<id> opens payment link detail directly"
git push origin master
```

---

## Self-Review

**Spec coverage:**
- ✅ Slim banner — Task 2 (CSS) + Task 3 (JSX body deleted)
- ✅ Crypto Link field in Payment card — Task 3 Step 5
- ✅ `customer_chooses` orders show crypto link info — Task 3 Step 3 (`showCryptoLinkField` includes `customer_chooses`)
- ✅ "View in Payments →" deep-links to `/payments?link=<id>` — Task 3 Step 5 + Task 4
- ✅ "Create payment link →" when no link exists — Task 3 Step 5
- ✅ Remove conflicting CSS in `orders.css` — Task 2 Step 3
- ✅ Export `CRYPTO_ASSETS` — Task 1
- ✅ "All configured methods offered" text removed — Task 3 Step 4 (it lived in the deleted banner body)

**Placeholder scan:** None found.

**Type consistency:**
- `initialLinkId: string | null` defined in Task 4 Step 2 (`PaymentsPage`) and consumed in Task 4 Step 4 (`PaymentsView`) — match.
- `showCryptoLinkField` defined in Task 3 Step 3 and used in Task 3 Steps 4 and 5 — consistent.
- `cryptoPaymentLink.id` used in Task 3 Step 5 — this field is present in `CryptoLinkSummary` (defined in `src/app/orders/[orderId]/page.tsx`) as `id: string` — consistent.
