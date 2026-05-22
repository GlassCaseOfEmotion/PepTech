# Crypto Payments — Design Spec
**Date:** 2026-05-22  
**Status:** Draft

---

## Context

Peptech tenants (peptide merchants) currently track payment manually — they configure a static wallet address in Settings, tell customers to send crypto to it, and manually mark orders as paid. There is no automation, no payment confirmation, and no aggregated balance view.

This spec describes a managed crypto payment system where:
- Each tenant gets a Privy-managed Solana USDC wallet provisioned by Peptech
- Tenants generate a payment link per order — customers can pay in BTC, ETH, XRP, SOL, USDC, or any major token
- NOWPayments handles multi-chain acceptance, converts to USDC, and forwards to the tenant's wallet
- Peptech tracks the balance and transaction history
- Withdrawals (to bank or Kast) are explicitly out of scope for v1

**What this is not:**
- Fiat payments (card, bank transfer) — those happen outside Peptech already
- A custodial wallet Peptech controls — Privy wallets are owned by the tenant
- A money transmitter service — Peptech is the platform layer on top of licensed providers (NOWPayments, Privy)

---

## Architecture

```
Tenant generates payment link for an order
              ↓
Peptech calls NOWPayments API
  → amount_usd, payout_address = tenant's Privy wallet (Solana USDC)
  → NOWPayments returns: payment_id, hosted_url, expires_at
              ↓
Peptech stores crypto_payment_link row, links to order
Tenant shares the hosted URL or QR code with customer
              ↓
Customer visits NOWPayments hosted page
  → selects token (BTC / ETH / XRP / SOL / USDC / …)
  → sees address + amount in that token
  → sends from their wallet
              ↓
NOWPayments detects payment on-chain
  → converts to USDC
  → sends USDC to tenant's Privy wallet (Solana)
  → fires webhook to Peptech: /api/webhooks/nowpayments
              ↓
Peptech webhook handler:
  → marks crypto_payment_link as completed
  → writes wallet_transactions row
  → updates tenant_crypto_wallets.balance_usdc
  → marks order as paid (updates payment_asset, tx_hash)
              ↓
Helius webhook (secondary):
  → fires when USDC arrives in tenant's Solana wallet
  → used for reconciliation only — verifies DB matches on-chain
```

---

## External Dependencies

### Privy (privy.io)
- **Role:** Server wallet infrastructure. Creates and manages one Solana wallet per tenant via REST API.
- **Key endpoints:** `POST /v1/wallets` (create), `GET /v1/wallets/:id` (inspect)
- **Pricing:** Free tier covers 0–499 active wallets. $299/month for 500–2,499. No per-wallet creation fee.
- **KYC:** Peptech registers once as a platform. No per-tenant verification required.

### NOWPayments (nowpayments.io)
- **Role:** Multi-chain payment gateway. Accepts 300+ tokens, converts to USDC, forwards to tenant's Solana wallet.
- **Key endpoints:** `POST /v1/payment` (create payment), `GET /v1/payment/:id` (status)
- **Webhooks:** Fires on payment status changes (waiting → confirming → confirmed → finished)
- **Pricing:** 0.5% on conversions. USDC → USDC is near-zero.
- **KYC:** Peptech registers as platform. One NOWPayments account covers all tenants.
- **Settlement:** USDC forwarded to the payout_address specified per payment (tenant's Privy wallet).

### Helius (helius.dev)
- **Role:** Solana RPC + webhook infrastructure. Fires when USDC arrives in a watched wallet address.
- **Purpose in this system:** Reconciliation only. NOWPayments webhook is the primary notification path.
- **Pricing:** Free tier covers development and early production volumes.

---

## Data Model

### New table: `tenant_crypto_wallets`
One row per tenant. Created when the tenant first enables crypto payments.

```sql
CREATE TABLE tenant_crypto_wallets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL UNIQUE REFERENCES tenants(id),
  privy_wallet_id  text NOT NULL,          -- Privy's internal wallet ID
  solana_address   text NOT NULL,          -- public Solana wallet address
  balance_usdc     numeric(14,6) NOT NULL DEFAULT 0,  -- cached, updated on each confirmed payment
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_synced_at   timestamptz
);

ALTER TABLE tenant_crypto_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON tenant_crypto_wallets
  USING (tenant_id = auth_tenant_id());
```

### New table: `crypto_payment_links`
One row per payment link generated for an order.

```sql
CREATE TABLE crypto_payment_links (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  order_id              uuid NOT NULL REFERENCES orders(id),
  nowpayments_id        text NOT NULL UNIQUE,   -- NOWPayments payment ID
  hosted_url            text NOT NULL,           -- URL to share with customer
  amount_usd            numeric(10,2) NOT NULL,
  status                text NOT NULL DEFAULT 'waiting',
    -- waiting | confirming | confirmed | finished | failed | expired
  payout_address        text NOT NULL,           -- tenant's Solana wallet address at time of creation
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz,
  confirmed_at          timestamptz,
  paid_token            text,                    -- token customer actually paid with (e.g. 'BTC')
  paid_amount           numeric(20,8),           -- amount in that token
  usdc_received         numeric(14,6),           -- USDC forwarded to wallet
  nowpayments_tx_id     text                     -- NOWPayments internal transaction ID
);

ALTER TABLE crypto_payment_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON crypto_payment_links
  USING (tenant_id = auth_tenant_id());

CREATE INDEX ON crypto_payment_links (order_id);
CREATE INDEX ON crypto_payment_links (tenant_id, status);
```

### New table: `wallet_transactions`
Immutable ledger of all USDC received. Append-only.

```sql
CREATE TABLE wallet_transactions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  crypto_payment_link_id uuid REFERENCES crypto_payment_links(id),
  amount_usdc          numeric(14,6) NOT NULL,
  solana_tx_signature  text,                     -- on-chain signature (from Helius reconciliation)
  source_token         text,                     -- e.g. 'BTC', 'ETH', 'USDC'
  source_amount        numeric(20,8),
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON wallet_transactions
  USING (tenant_id = auth_tenant_id());

CREATE INDEX ON wallet_transactions (tenant_id, created_at DESC);
```

### Changes to existing `orders` table
No schema changes needed. On payment confirmation, Peptech writes to the existing columns:
- `payment_asset` → token the customer paid with (e.g. `'BTC'`)
- `payment_amount` → amount in that token
- `tx_hash` → NOWPayments transaction ID (or Solana signature when available)

The `crypto_payment_link_id` relationship lives on the `crypto_payment_links` table (via `order_id` FK), so no new column needed on orders.

---

## Core Flows

### 1. Wallet provisioning

Triggered once per tenant — either at onboarding or lazily on first payment link generation.

```
POST /api/crypto-wallet/provision
  → check tenant_crypto_wallets — if exists, return early
  → call Privy: POST /v1/wallets { chainType: 'solana' }
  → store privy_wallet_id + solana_address in tenant_crypto_wallets
```

Recommendation: **lazy provisioning** on first payment link generation. Avoids creating wallets for tenants who never use crypto payments.

### 2. Payment link generation

Triggered when a tenant clicks "Generate crypto payment link" on an order.

```
POST /api/payment-links/create { order_id }
  → verify order belongs to tenant, get amount (order.payment_amount in USD)
  → provision wallet if not yet created
  → call NOWPayments: POST /v1/payment {
      price_amount: order.payment_amount,
      price_currency: 'usd',
      payout_currency: 'usdcsol',          -- USDC on Solana
      payout_address: tenant.solana_address,
      order_id: order.id,                   -- echoed back in webhook
      order_description: order.ref_number
    }
  → store crypto_payment_links row
  → return { hosted_url, expires_at }
```

### 3. Payment webhook handler

`POST /api/webhooks/nowpayments` — receives NOWPayments IPN (Instant Payment Notification).

```
verify HMAC signature (x-nowpayments-sig header)
parse: payment_id, order_id, payment_status, pay_currency, pay_amount, actually_paid_amount
  → if status != 'finished': update crypto_payment_links.status only, return 200
  → if status == 'finished':
      update crypto_payment_links:
        status = 'finished', confirmed_at = now(),
        paid_token, paid_amount, usdc_received, nowpayments_tx_id
      insert wallet_transactions row
      update tenant_crypto_wallets.balance_usdc += usdc_received
      update orders: payment_asset = pay_currency, payment_amount = pay_amount, tx_hash = nowpayments_tx_id
      return 200
```

All DB writes in a single transaction. Idempotent — check if wallet_transactions row already exists for this nowpayments_tx_id before inserting.

### 4. Helius reconciliation (nightly)

Supabase Edge Function on cron. Calls Helius to fetch recent USDC transfers to each tenant wallet. Compares against wallet_transactions. If a USDC arrival has no matching transaction row (webhook was missed), creates the row and updates balance. Logs any discrepancies.

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/crypto-wallet/provision` | Create Privy wallet for tenant |
| `GET` | `/api/crypto-wallet/balance` | Return cached balance + recent transactions |
| `POST` | `/api/payment-links/create` | Generate NOWPayments link for an order |
| `GET` | `/api/payment-links/:id` | Poll payment link status |
| `POST` | `/api/webhooks/nowpayments` | NOWPayments IPN handler (public, HMAC-verified) |
| `POST` | `/api/webhooks/helius` | Helius wallet event handler (reconciliation) |

---

## Supported Tokens (v1)

NOWPayments supports 300+ tokens but we surface a curated list on the payment page:

| Token | Network | Notes |
|-------|---------|-------|
| USDC | Solana | Near-zero fee — no conversion |
| USDT | Tron (TRC20) | Most common USDT |
| BTC | Bitcoin | Auto-converted to USDC |
| ETH | Ethereum | Auto-converted to USDC |
| XRP | XRP Ledger | Auto-converted to USDC |
| SOL | Solana | Auto-converted to USDC |

Additional tokens can be added by exposing more of NOWPayments' currency list.

---

## Environment Variables Required

```
PRIVY_APP_ID=
PRIVY_APP_SECRET=
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=     # for HMAC webhook verification
HELIUS_API_KEY=
HELIUS_WEBHOOK_SECRET=
```

---

## Out of Scope (v1)

- **Withdrawals** — to bank account or Kast/external wallet. Designed for v2.
- **Fiat payments** — handled outside Peptech via bank transfer / Stripe / PayPal.
- **KYC for tenants** — not required under the platform PayFac model.
- **Payment expiry handling** — links expire (NOWPayments default 24h); UI can show expired state but no auto-regeneration.
- **Refunds** — crypto refunds require a withdrawal capability. Deferred.
- **Multi-currency balance display** — balance is always shown as USDC / USD equivalent.

---

## Open Questions (for UI design review)

1. Where in the order flow does "Generate payment link" appear? Button on the order detail page?
2. How is the payment link shared with the customer — copied URL, QR code in chat, or both?
3. Does the tenant see a "Wallet" section in their dashboard, or is it surfaced elsewhere?
4. Payment link status on the order — how do we show waiting / confirming / paid states?
5. (These will be answered when reviewing the payment flow designs.)
