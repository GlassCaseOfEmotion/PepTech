# Payment Methods — Sub-projects 1 & 2 Design

## Scope

Two tightly coupled sub-projects:

1. **Payment Config** — tenants configure their wallet addresses and bank details in Settings → Wallets & Assets.
2. **Order Payment Flow** — addresses auto-assign to orders, payment instructions reach the customer via the inbox composer and invoice PDF, and the operator manually confirms receipt.

Sub-project 3 (on-chain automated detection) and Sub-project 4 (Vault dashboard with real data) are out of scope here and follow separately.

---

## Supported Payment Methods (v1)

| Type | Key | Detection in v1 |
|---|---|---|
| USDT (TRC20) | `usdt_trc20` | Manual |
| BTC | `btc` | Manual |
| ETH | `eth` | Manual |
| USDC (ERC20) | `usdc_erc20` | Manual |
| LTC | `ltc` | Manual |
| XMR | `xmr` | Manual (privacy coin — automated detection deferred) |
| Bank Transfer | `bank_transfer` | Manual (reference code matching) |
| Cash | `cash` | No config needed — always available |

---

## Data Model

### New table: `tenant_payment_configs`

```sql
CREATE TABLE tenant_payment_configs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  type           text NOT NULL,
  -- crypto fields
  wallet_address text,
  -- bank transfer fields
  bank_name      text,
  account_name   text,
  account_number text,
  sort_code      text,
  iban           text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, type)
);

ALTER TABLE tenant_payment_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON tenant_payment_configs
  USING (tenant_id = auth_tenant_id());
```

One row per `(tenant_id, type)`. The `UNIQUE` constraint enforces a single config per payment type per tenant.

### Orders table — no schema changes needed

Existing columns cover all requirements:
- `payment_asset` (text) — stores the type key (e.g. `'usdt_trc20'`) or `'customer_chooses'` for the multi-method case
- `payment_address` (text, nullable) — wallet address for single-coin orders; null for bank transfer and "customer chooses"
- `tx_hash` (text, nullable) — populated manually by operator on confirmation; auto-populated by monitor in sub-project 3
- `ref_number` (text) — serves as the bank transfer payment reference (e.g. `A-1234`)

### `payment_asset` values on orders

Expand from current `'USDT'`, `'BTC'`, `'Cash'`, `'Other'` to:
`'usdt_trc20'`, `'btc'`, `'eth'`, `'usdc_erc20'`, `'ltc'`, `'xmr'`, `'bank_transfer'`, `'cash'`, `'customer_chooses'`

Existing orders with old values (`'USDT'`, `'BTC'`, etc.) remain valid — display layer maps them gracefully.

---

## Sub-project 1: Settings → Wallets & Assets

### Route
`/settings/wallets` — currently a stub. Replace stub content with real UI.

### UI Structure

**Crypto addresses panel**

A row per supported coin: USDT (TRC20), BTC, ETH, USDC (ERC20), LTC, XMR.

Each row:
- Coin name + icon
- Configured address, masked to first 6 and last 4 chars (e.g. `T9XbnH...N8a`). "Not configured" if unset.
- Active/inactive toggle (disabled if no address configured)
- Edit button → inline form with a single textarea for the wallet address. Save and Cancel buttons. No address format validation in v1.

**Bank transfer panel**

Below the crypto panel. Fields:
- Bank name (text)
- Account name (text, required)
- Account number (text)
- Sort code (text)
- IBAN (text)

Validation: account name required + at least one of (sort code + account number) or IBAN must be present. Active/inactive toggle.

**Empty state**

If no methods configured: "Add a payment method to start accepting payments."

---

## Sub-project 2: Order Payment Flow

### 2a. Order Creation Form

The `payment_asset` dropdown is dynamically populated:
- Always includes **Cash**
- Includes each coin type where the tenant has an active `tenant_payment_configs` row
- Includes **Bank Transfer** if tenant has an active bank transfer config
- Includes **Customer chooses** if the tenant has 2 or more active payment methods

On selection:
- **Single crypto coin selected:** `orders.payment_address` auto-populated from config. Shown as a read-only field in the form.
- **Bank Transfer selected:** `orders.payment_address` left null. Reference is `orders.ref_number`.
- **Customer chooses:** `orders.payment_address` left null. `payment_asset` stored as `'customer_chooses'`.
- **Cash:** No address, no reference.

If tenant has no configured payment methods: dropdown shows Cash only, with helper text: "Configure payment methods in Settings → Wallets & Assets."

### 2b. Order Detail View — Payment Panel

Displayed between order header and order items. State-aware. The view fetches the tenant's active `tenant_payment_configs` rows on load — needed to render the correct addresses and to build the payment message.

**State: `awaiting`**

Shows assigned address (single coin) or a summary listing of all active payment methods (customer chooses).

Actions:
- **"Send payment details"** button
  - If order has a linked `conversation_id`: navigates to `/inbox?conversation={id}&prefill={encoded_message}` — the inbox composer opens pre-filled with the payment message.
  - If no linked conversation: shows a modal with the formatted message as copyable text.
- **"Copy address"** button (crypto orders, single address only) — copies full address to clipboard.

**State: `awaiting` → operator clicks "Mark as received"**

Opens a confirmation dialog:
- If `payment_asset = 'customer_chooses'`: required dropdown — "Which method did they use?" (shows all active configured types)
- Transaction ID field (optional): labelled "Transaction ID — paste from your wallet or block explorer. Leave blank if unavailable."
- Confirm button → updates `payment_asset` to the selected method (if customer_chooses), populates `tx_hash` if provided, advances order status to `confirming`

**State: `confirming` and beyond**

Shows: confirmed payment method, tx hash (truncated monospace + copy button), confirmation timestamp. No further payment actions.

### 2c. Inbox Composer — Pre-fill via URL Param

The inbox composer reads a `prefill` query parameter on mount and populates the message input. URL-encoded. Cleared from the URL after reading (replaceState) to avoid re-population on refresh.

**Payment message format:**

Single coin:
```
Payment details for order A-1234 · $330

USDT (TRC20): T9XbnH4kQ4fM2pLrGv8WqRcXm6tPxJjN8a

Please send the exact amount shown on the invoice.
```

Customer chooses (all active methods listed):
```
Payment details for order A-1234 · $330

USDT (TRC20): T9XbnH4kQ4fM2pLrGv8WqRcXm6tPxJjN8a
BTC: bc1q...x4t9
Bank Transfer: Alan Ambrose · 12345678 · Sort: 04-00-04 · Ref: A-1234

Please include the reference number for bank transfers.
```

Bank transfer only:
```
Payment details for order A-1234 · $330

Bank Transfer:
  Name: Alan Ambrose
  Account: 12345678
  Sort code: 04-00-04
  Reference: A-1234 (please include this)
```

### 2d. Invoice PDF — Payment Instructions Section

Added below the line items in `InvoicePDF.tsx`.

- **Single coin:** Coin name + full wallet address.
- **Customer chooses:** "Payment Options" heading, each active method listed with its details.
- **Bank Transfer:** Bank name, account name, account number, sort code/IBAN, reference code.
- **Cash / no config:** Section omitted entirely.

---

## Files to Create / Modify

### New
- `supabase/migrations/20260511000001_tenant_payment_configs.sql`
- `src/components/settings/WalletsForm.tsx` — payment config UI component
- `src/types/payments.ts` — shared types (`PaymentType`, `TenantPaymentConfig`, `PaymentMethodConfig`)

### Modified
- `src/app/settings/wallets/page.tsx` — replace stub, render WalletsForm
- `src/app/orders/actions.ts` — `createOrder()` auto-populates `payment_address` from config; `confirmPayment()` new action
- `src/components/orders/OrderDetailView.tsx` — payment panel, send payment details button, confirm dialog
- `src/components/inbox/InboxView.tsx` — read `prefill` URL param, inject into composer
- `src/components/invoices/InvoicePDF.tsx` — Payment Instructions section
- `src/lib/payments.ts` — new: `buildPaymentMessage(order, configs)` helper

---

## Display Labels

```ts
export const PAYMENT_LABELS: Record<string, string> = {
  usdt_trc20:      'USDT (TRC20)',
  btc:             'BTC',
  eth:             'ETH',
  usdc_erc20:      'USDC (ERC20)',
  ltc:             'LTC',
  xmr:             'XMR',
  bank_transfer:   'Bank Transfer',
  cash:            'Cash',
  customer_chooses:'Customer chooses',
}
```

---

## Error Handling

- Order creation with no matching config for selected asset: blocked in UI (only configured methods shown in dropdown).
- `buildPaymentMessage` called with missing config: returns a safe fallback ("Payment details unavailable — contact the operator").
- Composer prefill URL param exceeds URL length limits (~2000 chars): truncate gracefully, operator sees partial message and can edit.

---

## Out of Scope (Sub-projects 3 & 4)

- On-chain transaction monitoring (Tronscan, mempool.space, Etherscan APIs)
- Auto-advancing order status on blockchain confirmation
- Vault dashboard with real balances and transaction feed
- Per-order address rotation (HD wallet derivation)
- XMR automated detection (monero-wallet-rpc)
