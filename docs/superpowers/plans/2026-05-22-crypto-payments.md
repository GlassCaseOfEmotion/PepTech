# Crypto Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let tenants generate per-order crypto payment links (multi-token via NOWPayments), receive USDC into a Privy-managed Solana wallet, and view balance + transaction history in a new Payments section.

**Architecture:** NOWPayments accepts BTC/ETH/XRP/SOL/USDC from the customer, converts to USDC, and forwards to the tenant's Privy server wallet (Solana). A webhook handler records the payment and updates the tenant's cached balance in Supabase. Helius provides a nightly reconciliation safety net.

**Tech Stack:** Next.js 15 App Router, Supabase, Privy REST API, NOWPayments API, Helius API, Vitest

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260522000001_crypto_wallet_tables.sql` | Create | 3 new tables + RLS |
| `src/types/database.ts` | Modify | Add new table types |
| `src/types/payments-crypto.ts` | Create | App-level TypeScript types |
| `src/lib/payments/privy.ts` | Create | Privy API client |
| `src/lib/payments/nowpayments.ts` | Create | NOWPayments API client |
| `src/lib/payments/hmac.ts` | Create | NOWPayments webhook HMAC verifier |
| `src/lib/payments/__tests__/privy.test.ts` | Create | Privy client unit tests |
| `src/lib/payments/__tests__/nowpayments.test.ts` | Create | NOWPayments client unit tests |
| `src/lib/payments/__tests__/hmac.test.ts` | Create | HMAC verifier unit tests |
| `src/app/api/crypto-wallet/provision/route.ts` | Create | POST — lazy wallet creation |
| `src/app/api/crypto-wallet/balance/route.ts` | Create | GET — balance + recent txs |
| `src/app/api/payment-links/create/route.ts` | Create | POST — create NOWPayments link |
| `src/app/api/payment-links/[id]/route.ts` | Create | GET — poll link status |
| `src/app/api/webhooks/nowpayments/route.ts` | Create | POST — IPN handler (HMAC-verified) |
| `src/app/api/webhooks/nowpayments/__tests__/route.test.ts` | Create | Webhook handler tests |
| `src/app/api/webhooks/helius/route.ts` | Create | POST — reconciliation handler |
| `src/app/payments/actions.ts` | Create | Server actions for Payments UI |
| `src/app/payments/page.tsx` | Create | Payments page (server component) |
| `src/components/payments/PaymentsView.tsx` | Create | Main payments UI (list + detail) |
| `src/components/payments/CreatePaymentLinkModal.tsx` | Create | Create-link composer modal |
| `src/components/payments/PaymentLinkDetail.tsx` | Create | Link lifecycle + timeline panel |
| `src/components/shell/Sidebar.tsx` | Modify | Add Payments nav item |
| `src/app/layout.tsx` | Modify | Import payments.css |
| `styles/payments.css` | Create | Payments-specific styles |

---

## Task A: DB Migration

**Files:**
- Create: `supabase/migrations/20260522000001_crypto_wallet_tables.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260522000001_crypto_wallet_tables.sql

CREATE TABLE tenant_crypto_wallets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL UNIQUE REFERENCES tenants(id),
  privy_wallet_id  text NOT NULL,
  solana_address   text NOT NULL,
  balance_usdc     numeric(14,6) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_synced_at   timestamptz
);
ALTER TABLE tenant_crypto_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON tenant_crypto_wallets
  USING (tenant_id = auth_tenant_id());

CREATE TABLE crypto_payment_links (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  order_id              uuid NOT NULL REFERENCES orders(id),
  nowpayments_id        text NOT NULL UNIQUE,
  hosted_url            text NOT NULL,
  amount_usd            numeric(10,2) NOT NULL,
  status                text NOT NULL DEFAULT 'waiting',
  payout_address        text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz,
  confirmed_at          timestamptz,
  paid_token            text,
  paid_amount           numeric(20,8),
  usdc_received         numeric(14,6),
  nowpayments_tx_id     text
);
ALTER TABLE crypto_payment_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON crypto_payment_links
  USING (tenant_id = auth_tenant_id());
CREATE INDEX ON crypto_payment_links (order_id);
CREATE INDEX ON crypto_payment_links (tenant_id, status);

CREATE TABLE wallet_transactions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  crypto_payment_link_id uuid REFERENCES crypto_payment_links(id),
  amount_usdc            numeric(14,6) NOT NULL,
  solana_tx_signature    text,
  source_token           text,
  source_amount          numeric(20,8),
  created_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON wallet_transactions
  USING (tenant_id = auth_tenant_id());
CREATE INDEX ON wallet_transactions (tenant_id, created_at DESC);
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push --include-all
```

Expected: migration applies cleanly, no errors.

- [ ] **Step 3: Add types to `src/types/database.ts`**

Find the `Tables` section and add after the last table definition (before the closing of `Tables:`):

```typescript
      crypto_payment_links: {
        Row: {
          id: string
          tenant_id: string
          order_id: string
          nowpayments_id: string
          hosted_url: string
          amount_usd: number
          status: string
          payout_address: string
          created_at: string
          expires_at: string | null
          confirmed_at: string | null
          paid_token: string | null
          paid_amount: number | null
          usdc_received: number | null
          nowpayments_tx_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          order_id: string
          nowpayments_id: string
          hosted_url: string
          amount_usd: number
          status?: string
          payout_address: string
          created_at?: string
          expires_at?: string | null
          confirmed_at?: string | null
          paid_token?: string | null
          paid_amount?: number | null
          usdc_received?: number | null
          nowpayments_tx_id?: string | null
        }
        Update: {
          status?: string
          confirmed_at?: string | null
          paid_token?: string | null
          paid_amount?: number | null
          usdc_received?: number | null
          nowpayments_tx_id?: string | null
        }
        Relationships: []
      }
      tenant_crypto_wallets: {
        Row: {
          id: string
          tenant_id: string
          privy_wallet_id: string
          solana_address: string
          balance_usdc: number
          created_at: string
          last_synced_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          privy_wallet_id: string
          solana_address: string
          balance_usdc?: number
          created_at?: string
          last_synced_at?: string | null
        }
        Update: {
          balance_usdc?: number
          last_synced_at?: string | null
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          id: string
          tenant_id: string
          crypto_payment_link_id: string | null
          amount_usdc: number
          solana_tx_signature: string | null
          source_token: string | null
          source_amount: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          crypto_payment_link_id?: string | null
          amount_usdc: number
          solana_tx_signature?: string | null
          source_token?: string | null
          source_amount?: number | null
          created_at?: string
        }
        Update: {
          solana_tx_signature?: string | null
        }
        Relationships: []
      }
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260522000001_crypto_wallet_tables.sql src/types/database.ts
git commit -m "feat: add crypto wallet DB tables and TypeScript types"
```

---

## Task B: App-level TypeScript types

**Files:**
- Create: `src/types/payments-crypto.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/types/payments-crypto.ts

export type CryptoPaymentStatus =
  | 'waiting'
  | 'confirming'
  | 'confirmed'
  | 'sending'
  | 'partially_paid'
  | 'finished'
  | 'failed'
  | 'expired'

// Snake_case matches Supabase column names — no converter needed
export type TenantCryptoWallet = {
  id: string
  tenant_id: string
  privy_wallet_id: string
  solana_address: string
  balance_usdc: number
  created_at: string
  last_synced_at: string | null
}

export type CryptoPaymentLink = {
  id: string
  tenant_id: string
  order_id: string
  nowpayments_id: string
  hosted_url: string
  amount_usd: number
  status: CryptoPaymentStatus
  payout_address: string
  created_at: string
  expires_at: string | null
  confirmed_at: string | null
  paid_token: string | null
  paid_amount: number | null
  usdc_received: number | null
  nowpayments_tx_id: string | null
}

export type WalletTransaction = {
  id: string
  tenant_id: string
  crypto_payment_link_id: string | null
  amount_usdc: number
  solana_tx_signature: string | null
  source_token: string | null
  source_amount: number | null
  created_at: string
}

export type WalletBalanceResponse = {
  wallet: TenantCryptoWallet | null
  recentTransactions: WalletTransaction[]
}

// NOWPayments IPN webhook payload
export type NowPaymentsWebhookPayload = {
  payment_id: string
  payment_status: CryptoPaymentStatus
  pay_address: string
  price_amount: number
  price_currency: string
  pay_amount: number
  actually_paid: number
  pay_currency: string
  order_id: string
  outcome_amount: number | null
  outcome_currency: string | null
  nowpayments_fee: number | null
}

// Helius enhanced webhook transaction payload (minimal fields we need)
export type HeliumTransactionPayload = {
  signature: string
  tokenTransfers: {
    mint: string
    toUserAccount: string
    tokenAmount: number
  }[]
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/payments-crypto.ts
git commit -m "feat: add crypto payments TypeScript types"
```

---

## Task C: Privy and NOWPayments client libraries

**Files:**
- Create: `src/lib/payments/privy.ts`
- Create: `src/lib/payments/nowpayments.ts`
- Create: `src/lib/payments/__tests__/privy.test.ts`
- Create: `src/lib/payments/__tests__/nowpayments.test.ts`

- [ ] **Step 1: Write failing tests for Privy client**

```typescript
// src/lib/payments/__tests__/privy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPrivyWallet, getPrivyWallet } from '../privy'

describe('createPrivyWallet', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('returns wallet id and address on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'wallet_abc', address: 'So1anaAddr1234' }),
    }))
    const result = await createPrivyWallet()
    expect(result).toEqual({ id: 'wallet_abc', address: 'So1anaAddr1234' })
  })

  it('throws when Privy returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }))
    await expect(createPrivyWallet()).rejects.toThrow('Privy error 401')
  })
})

describe('getPrivyWallet', () => {
  it('returns wallet data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'wallet_abc', address: 'So1anaAddr1234' }),
    }))
    const result = await getPrivyWallet('wallet_abc')
    expect(result.address).toBe('So1anaAddr1234')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/lib/payments/__tests__/privy.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write Privy client**

```typescript
// src/lib/payments/privy.ts

const BASE = 'https://auth.privy.io/api/v1'

function authHeader() {
  const appId = process.env.PRIVY_APP_ID ?? ''
  const secret = process.env.PRIVY_APP_SECRET ?? ''
  return 'Basic ' + Buffer.from(`${appId}:${secret}`).toString('base64')
}

export type PrivyWallet = { id: string; address: string }

export async function createPrivyWallet(): Promise<PrivyWallet> {
  const res = await fetch(`${BASE}/wallets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify({ chain_type: 'solana' }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Privy error ${res.status}: ${text}`)
  }
  return res.json() as Promise<PrivyWallet>
}

export async function getPrivyWallet(walletId: string): Promise<PrivyWallet> {
  const res = await fetch(`${BASE}/wallets/${walletId}`, {
    headers: { Authorization: authHeader() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Privy error ${res.status}: ${text}`)
  }
  return res.json() as Promise<PrivyWallet>
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/lib/payments/__tests__/privy.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Write failing tests for NOWPayments client**

```typescript
// src/lib/payments/__tests__/nowpayments.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNowPayment, getNowPayment } from '../nowpayments'

describe('createNowPayment', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('returns payment id and hosted url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'pay_123',
        payment_url: 'https://nowpayments.io/payment/?iid=pay_123',
        expiration_estimate_date: '2026-05-23T10:00:00Z',
        payment_status: 'waiting',
      }),
    }))
    const result = await createNowPayment({
      amountUsd: 150,
      payoutAddress: 'So1anaAddr1234',
      orderId: 'order-uuid',
      orderDescription: 'A-2001',
    })
    expect(result.id).toBe('pay_123')
    expect(result.hostedUrl).toBe('https://nowpayments.io/payment/?iid=pay_123')
    expect(result.expiresAt).toBe('2026-05-23T10:00:00Z')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    }))
    await expect(createNowPayment({
      amountUsd: 150,
      payoutAddress: 'addr',
      orderId: 'id',
      orderDescription: 'A-1',
    })).rejects.toThrow('NOWPayments error 500')
  })
})

describe('getNowPayment', () => {
  it('returns payment status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'pay_123', payment_status: 'confirming' }),
    }))
    const result = await getNowPayment('pay_123')
    expect(result.payment_status).toBe('confirming')
  })
})
```

- [ ] **Step 6: Run tests — verify they fail**

```bash
npx vitest run src/lib/payments/__tests__/nowpayments.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Write NOWPayments client**

```typescript
// src/lib/payments/nowpayments.ts

const BASE = 'https://api.nowpayments.io/v1'

function apiKey() {
  return process.env.NOWPAYMENTS_API_KEY ?? ''
}

export type CreatePaymentInput = {
  amountUsd: number
  payoutAddress: string
  orderId: string
  orderDescription: string
}

export type CreatedPayment = {
  id: string
  hostedUrl: string
  expiresAt: string | null
}

export type NowPaymentStatus = {
  id: string
  payment_status: string
  pay_currency: string | null
  pay_amount: number | null
  actually_paid: number | null
  outcome_amount: number | null
  outcome_currency: string | null
}

export async function createNowPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
  const res = await fetch(`${BASE}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey() },
    body: JSON.stringify({
      price_amount: input.amountUsd,
      price_currency: 'usd',
      payout_currency: 'usdcsol',
      payout_address: input.payoutAddress,
      order_id: input.orderId,
      order_description: input.orderDescription,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`NOWPayments error ${res.status}: ${text}`)
  }
  const data = await res.json() as {
    id: string
    payment_url: string
    expiration_estimate_date: string | null
  }
  return {
    id: data.id,
    hostedUrl: data.payment_url,
    expiresAt: data.expiration_estimate_date ?? null,
  }
}

export async function getNowPayment(paymentId: string): Promise<NowPaymentStatus> {
  const res = await fetch(`${BASE}/payment/${paymentId}`, {
    headers: { 'x-api-key': apiKey() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`NOWPayments error ${res.status}: ${text}`)
  }
  return res.json() as Promise<NowPaymentStatus>
}
```

- [ ] **Step 8: Run all payment lib tests**

```bash
npx vitest run src/lib/payments/__tests__/
```

Expected: PASS — 5 tests.

- [ ] **Step 9: Commit**

```bash
git add src/lib/payments/privy.ts src/lib/payments/nowpayments.ts \
  src/lib/payments/__tests__/privy.test.ts \
  src/lib/payments/__tests__/nowpayments.test.ts
git commit -m "feat: Privy and NOWPayments API clients"
```

---

## Task D: HMAC verification utility

**Files:**
- Create: `src/lib/payments/hmac.ts`
- Create: `src/lib/payments/__tests__/hmac.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/payments/__tests__/hmac.test.ts
import { describe, it, expect } from 'vitest'
import { verifyNowPaymentsSignature } from '../hmac'
import { createHmac } from 'crypto'

function makeSignature(body: string, secret: string) {
  return createHmac('sha512', secret).update(body).digest('hex')
}

describe('verifyNowPaymentsSignature', () => {
  const secret = 'test_secret'
  const body = '{"payment_id":"123","payment_status":"finished"}'

  it('returns true for valid signature', () => {
    const sig = makeSignature(body, secret)
    expect(verifyNowPaymentsSignature(body, sig, secret)).toBe(true)
  })

  it('returns false for wrong signature', () => {
    expect(verifyNowPaymentsSignature(body, 'badsig', secret)).toBe(false)
  })

  it('returns false for empty signature', () => {
    expect(verifyNowPaymentsSignature(body, '', secret)).toBe(false)
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
npx vitest run src/lib/payments/__tests__/hmac.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write HMAC verifier**

```typescript
// src/lib/payments/hmac.ts
import { createHmac, timingSafeEqual } from 'crypto'

export function verifyNowPaymentsSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature) return false
  const expected = createHmac('sha512', secret).update(body).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
npx vitest run src/lib/payments/__tests__/hmac.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/hmac.ts src/lib/payments/__tests__/hmac.test.ts
git commit -m "feat: NOWPayments HMAC webhook signature verifier"
```

---

## Task E: Wallet provision and balance API routes

**Files:**
- Create: `src/app/api/crypto-wallet/provision/route.ts`
- Create: `src/app/api/crypto-wallet/balance/route.ts`

- [ ] **Step 1: Write provision route**

```typescript
// src/app/api/crypto-wallet/provision/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPrivyWallet } from '@/lib/payments/privy'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tenantId = userRow.tenant_id as string

  // Idempotent — return existing wallet if already provisioned
  const { data: existing } = await supabase
    .from('tenant_crypto_wallets').select('*').eq('tenant_id', tenantId).single()
  if (existing) return NextResponse.json(existing)

  // Create new Privy wallet
  let privyWallet
  try {
    privyWallet = await createPrivyWallet()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Privy error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const { data, error } = await supabase
    .from('tenant_crypto_wallets')
    .insert({
      tenant_id: tenantId,
      privy_wallet_id: privyWallet.id,
      solana_address: privyWallet.address,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Write balance route**

```typescript
// src/app/api/crypto-wallet/balance/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tenantId = userRow.tenant_id as string

  const { data: wallet } = await supabase
    .from('tenant_crypto_wallets').select('*').eq('tenant_id', tenantId).single()
  if (!wallet) return NextResponse.json({ wallet: null, recentTransactions: [] })

  const { data: txs } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ wallet, recentTransactions: txs ?? [] })
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/crypto-wallet/
git commit -m "feat: wallet provision and balance API routes"
```

---

## Task F: Payment link create and status API routes

**Files:**
- Create: `src/app/api/payment-links/create/route.ts`
- Create: `src/app/api/payment-links/[id]/route.ts`

- [ ] **Step 1: Write create route**

```typescript
// src/app/api/payment-links/create/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createNowPayment } from '@/lib/payments/nowpayments'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tenantId = userRow.tenant_id as string
  const { order_id } = await request.json() as { order_id: string }

  // Verify order belongs to this tenant
  const { data: order } = await supabase
    .from('orders')
    .select('id, ref_number, payment_amount')
    .eq('id', order_id)
    .single()
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Provision wallet if not yet created
  let wallet = (await supabase
    .from('tenant_crypto_wallets').select('*').eq('tenant_id', tenantId).single()).data

  if (!wallet) {
    const provRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/crypto-wallet/provision`, {
      method: 'POST',
      headers: { Cookie: request.headers.get('cookie') ?? '' },
    })
    if (!provRes.ok) return NextResponse.json({ error: 'Wallet provisioning failed' }, { status: 502 })
    wallet = await provRes.json()
  }

  if (!wallet) return NextResponse.json({ error: 'No wallet' }, { status: 500 })

  // Create NOWPayments link
  let payment
  try {
    payment = await createNowPayment({
      amountUsd: Number(order.payment_amount),
      payoutAddress: wallet.solana_address,
      orderId: order.id,
      orderDescription: order.ref_number,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'NOWPayments error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const { data, error } = await supabase
    .from('crypto_payment_links')
    .insert({
      tenant_id: tenantId,
      order_id: order.id,
      nowpayments_id: payment.id,
      hosted_url: payment.hostedUrl,
      amount_usd: Number(order.payment_amount),
      payout_address: wallet.solana_address,
      expires_at: payment.expiresAt,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Write status poll route**

```typescript
// src/app/api/payment-links/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('crypto_payment_links').select('*').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(data)
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/payment-links/
git commit -m "feat: payment link create and status API routes"
```

---

## Task G: NOWPayments webhook handler

**Files:**
- Create: `src/app/api/webhooks/nowpayments/route.ts`
- Create: `src/app/api/webhooks/nowpayments/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/app/api/webhooks/nowpayments/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'
import { createHmac } from 'crypto'

const IPN_SECRET = 'test_ipn_secret'

function makeRequest(body: object, secret = IPN_SECRET) {
  const bodyStr = JSON.stringify(body)
  const sig = createHmac('sha512', secret).update(bodyStr).digest('hex')
  return new Request('http://localhost/api/webhooks/nowpayments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nowpayments-sig': sig,
    },
    body: bodyStr,
  })
}

// Mock env + supabase
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'link_id', tenant_id: 'tenant_id' }, error: null }),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    })),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  })),
}))

describe('NOWPayments webhook', () => {
  beforeEach(() => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', IPN_SECRET)
  })

  it('returns 401 for invalid signature', async () => {
    const body = JSON.stringify({ payment_id: '1', payment_status: 'finished' })
    const req = new Request('http://localhost/api/webhooks/nowpayments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nowpayments-sig': 'badsig' },
      body,
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 for non-finished status (status update only)', async () => {
    const req = makeRequest({ payment_id: 'pay_1', payment_status: 'confirming', order_id: 'order-uuid' })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests — verify fail**

```bash
npx vitest run src/app/api/webhooks/nowpayments/__tests__/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write webhook handler**

```typescript
// src/app/api/webhooks/nowpayments/route.ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyNowPaymentsSignature } from '@/lib/payments/hmac'
import type { NowPaymentsWebhookPayload } from '@/types/payments-crypto'

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('x-nowpayments-sig') ?? ''
  const secret = process.env.NOWPAYMENTS_IPN_SECRET ?? ''

  if (!verifyNowPaymentsSignature(body, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(body) as NowPaymentsWebhookPayload
  const supabase = createServiceClient()

  // Find the payment link by NOWPayments payment ID
  const { data: link } = await supabase
    .from('crypto_payment_links')
    .select('id, tenant_id, nowpayments_tx_id')
    .eq('nowpayments_id', payload.payment_id)
    .single()

  if (!link) {
    // Unknown payment — return 200 so NOWPayments doesn't retry indefinitely
    return NextResponse.json({ ok: true })
  }

  // Always update status
  await supabase
    .from('crypto_payment_links')
    .update({ status: payload.payment_status })
    .eq('id', link.id)

  // Only do ledger writes on 'finished'
  if (payload.payment_status !== 'finished') {
    return NextResponse.json({ ok: true })
  }

  // Idempotency: skip if already recorded this transaction
  if (link.nowpayments_tx_id === payload.payment_id) {
    return NextResponse.json({ ok: true })
  }

  const usdcReceived = payload.outcome_amount ?? payload.actually_paid
  const now = new Date().toISOString()

  // Confirm the payment link
  await supabase.from('crypto_payment_links').update({
    status: 'finished',
    confirmed_at: now,
    paid_token: payload.pay_currency,
    paid_amount: payload.pay_amount,
    usdc_received: usdcReceived,
    nowpayments_tx_id: payload.payment_id,
  }).eq('id', link.id)

  // Record wallet transaction
  await supabase.from('wallet_transactions').insert({
    tenant_id: link.tenant_id,
    crypto_payment_link_id: link.id,
    amount_usdc: usdcReceived,
    source_token: payload.pay_currency,
    source_amount: payload.actually_paid,
  })

  // Increment cached balance
  await supabase.rpc('increment_wallet_balance', {
    p_tenant_id: link.tenant_id,
    p_amount: usdcReceived,
  })

  // Update order payment fields
  await supabase.from('orders')
    .update({
      payment_asset: payload.pay_currency,
      payment_amount: payload.pay_amount,
      tx_hash: payload.payment_id,
    })
    .eq('id', (
      await supabase
        .from('crypto_payment_links')
        .select('order_id')
        .eq('id', link.id)
        .single()
    ).data?.order_id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Add `increment_wallet_balance` RPC to a new migration**

```sql
-- supabase/migrations/20260522000002_wallet_balance_rpc.sql
CREATE OR REPLACE FUNCTION increment_wallet_balance(p_tenant_id uuid, p_amount numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE tenant_crypto_wallets
  SET balance_usdc = balance_usdc + p_amount,
      last_synced_at = now()
  WHERE tenant_id = p_tenant_id;
$$;
```

```bash
npx supabase db push --include-all
```

- [ ] **Step 5: Run tests — verify pass**

```bash
npx vitest run src/app/api/webhooks/nowpayments/__tests__/route.test.ts
```

Expected: PASS — 2 tests.

- [ ] **Step 6: Full test run**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/webhooks/nowpayments/ \
  supabase/migrations/20260522000002_wallet_balance_rpc.sql
git commit -m "feat: NOWPayments IPN webhook handler with HMAC verification"
```

---

## Task H: Helius reconciliation webhook

**Files:**
- Create: `src/app/api/webhooks/helius/route.ts`

- [ ] **Step 1: Write the handler**

```typescript
// src/app/api/webhooks/helius/route.ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { HeliumTransactionPayload } from '@/types/payments-crypto'

// USDC SPL token mint on Solana mainnet
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const expectedAuth = `Bearer ${process.env.HELIUS_WEBHOOK_SECRET ?? ''}`
  if (authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const transactions = await request.json() as HeliumTransactionPayload[]
  const supabase = createServiceClient()

  for (const tx of transactions) {
    for (const transfer of tx.tokenTransfers) {
      if (transfer.mint !== USDC_MINT) continue

      // Find the tenant wallet that received this transfer
      const { data: wallet } = await supabase
        .from('tenant_crypto_wallets')
        .select('id, tenant_id, balance_usdc')
        .eq('solana_address', transfer.toUserAccount)
        .single()
      if (!wallet) continue

      // Check if this signature is already recorded
      const { data: existing } = await supabase
        .from('wallet_transactions')
        .select('id')
        .eq('solana_tx_signature', tx.signature)
        .single()
      if (existing) continue

      // Missed webhook — record the transaction and update balance
      await supabase.from('wallet_transactions').insert({
        tenant_id: wallet.tenant_id,
        amount_usdc: transfer.tokenAmount,
        solana_tx_signature: tx.signature,
        source_token: 'USDC',
        source_amount: transfer.tokenAmount,
      })

      await supabase.rpc('increment_wallet_balance', {
        p_tenant_id: wallet.tenant_id,
        p_amount: transfer.tokenAmount,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/helius/route.ts
git commit -m "feat: Helius wallet reconciliation webhook"
```

---

## Task I: Server actions for Payments UI

**Files:**
- Create: `src/app/payments/actions.ts`

- [ ] **Step 1: Write server actions**

```typescript
// src/app/payments/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TenantCryptoWallet, CryptoPaymentLink, WalletTransaction } from '@/types/payments-crypto'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id as string }
}

export async function getWallet(): Promise<{
  wallet: TenantCryptoWallet | null
  recentTransactions: WalletTransaction[]
}> {
  const { supabase } = await getTenantId()
  const { data: wallet } = await supabase
    .from('tenant_crypto_wallets').select('*').single()
  const { data: txs } = await supabase
    .from('wallet_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  return {
    wallet: wallet as TenantCryptoWallet | null,
    recentTransactions: (txs ?? []) as WalletTransaction[],
  }
}

export async function getPaymentLinks(): Promise<CryptoPaymentLink[]> {
  const { supabase } = await getTenantId()
  const { data } = await supabase
    .from('crypto_payment_links')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as CryptoPaymentLink[]
}

export async function createPaymentLink(orderId: string): Promise<{
  link?: CryptoPaymentLink
  error?: string
}> {
  try {
    const { supabase, tenantId } = await getTenantId()

    // Verify order belongs to this tenant
    const { data: order } = await supabase
      .from('orders')
      .select('id, ref_number, payment_amount')
      .eq('id', orderId)
      .single()
    if (!order) return { error: 'Order not found' }

    // Provision wallet lazily
    let wallet = (await supabase
      .from('tenant_crypto_wallets').select('*').eq('tenant_id', tenantId).single()).data

    if (!wallet) {
      const { createPrivyWallet } = await import('@/lib/payments/privy')
      const privyWallet = await createPrivyWallet()
      const { data: newWallet } = await supabase
        .from('tenant_crypto_wallets')
        .insert({
          tenant_id: tenantId,
          privy_wallet_id: privyWallet.id,
          solana_address: privyWallet.address,
        })
        .select()
        .single()
      wallet = newWallet
    }

    if (!wallet) return { error: 'Could not provision wallet' }

    const { createNowPayment } = await import('@/lib/payments/nowpayments')
    const payment = await createNowPayment({
      amountUsd: Number(order.payment_amount),
      payoutAddress: wallet.solana_address,
      orderId: order.id,
      orderDescription: order.ref_number,
    })

    const { data, error } = await supabase
      .from('crypto_payment_links')
      .insert({
        tenant_id: tenantId,
        order_id: order.id,
        nowpayments_id: payment.id,
        hosted_url: payment.hostedUrl,
        amount_usd: Number(order.payment_amount),
        payout_address: wallet.solana_address,
        expires_at: payment.expiresAt,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath('/payments')
    return { link: data as CryptoPaymentLink }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/payments/actions.ts
git commit -m "feat: payments server actions"
```

---

## Task J: Payments CSS

**Files:**
- Create: `styles/payments.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create payments.css**

```css
/* payments.css */

/* ── Shell ── */
.pt-pay { height: calc(100vh - 48px); display: flex; flex-direction: column; overflow: hidden; }

.pt-pay-hd {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 18px 22px 12px;
  border-bottom: 0.5px solid var(--pt-line);
  flex-shrink: 0;
}
.pt-pay-hd > div:first-child { flex: 1; }
.pt-pay-hd h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.015em; margin: 0; }
.pt-pay-hd p { font-size: 12px; color: var(--pt-fg-3); margin: 2px 0 0; }

/* ── KPI strip ── */
.pt-pay-kpi {
  display: flex; gap: 0;
  border-bottom: 0.5px solid var(--pt-line);
  flex-shrink: 0;
}
.pt-pay-kpi-item {
  flex: 1; padding: 12px 20px;
  border-right: 0.5px solid var(--pt-line);
}
.pt-pay-kpi-item:last-child { border-right: none; }
.pt-pay-kpi-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--pt-fg-4); margin-bottom: 4px; }
.pt-pay-kpi-val { font-size: 22px; font-weight: 600; font-family: var(--pt-mono); letter-spacing: -0.02em; color: var(--pt-fg); }
.pt-pay-kpi-sub { font-size: 11px; color: var(--pt-fg-4); margin-top: 2px; }

/* ── Body ── */
.pt-pay-body {
  flex: 1; min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  overflow: hidden;
}

/* ── Links list ── */
.pt-pay-list-col {
  border-right: 0.5px solid var(--pt-line);
  display: flex; flex-direction: column; min-height: 0;
  overflow: hidden;
}
.pt-pay-list-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px;
  border-bottom: 0.5px solid var(--pt-line);
  flex-shrink: 0;
}
.pt-pay-list-bar-pills { display: flex; gap: 4px; flex: 1; }
.pt-pay-filter-pill {
  padding: 3px 10px; border-radius: 999px;
  border: 0.5px solid var(--pt-line);
  background: none; font-size: 11.5px; color: var(--pt-fg-3);
  cursor: pointer;
}
.pt-pay-filter-pill.sel {
  background: var(--pt-accent-soft);
  border-color: var(--pt-accent);
  color: var(--pt-accent-fg);
  font-weight: 500;
}
.pt-pay-list-scroll { flex: 1; overflow-y: auto; min-height: 0; }
.pt-pay-list { list-style: none; margin: 0; padding: 0; }

/* ── Payment link row ── */
.pt-pay-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center; gap: 12px;
  padding: 11px 16px;
  border-bottom: 0.5px solid var(--pt-line-soft);
  cursor: pointer;
}
.pt-pay-row:hover { background: var(--pt-surface-2); }
.pt-pay-row.is-sel { background: var(--pt-accent-soft); }
.pt-pay-row-ref { font-size: 12.5px; font-weight: 500; color: var(--pt-fg); }
.pt-pay-row-meta { font-size: 11px; color: var(--pt-fg-4); margin-top: 1px; }
.pt-pay-row-amount { font-family: var(--pt-mono); font-size: 13px; font-weight: 600; color: var(--pt-fg); }
.pt-pay-row-expiry { font-size: 10.5px; color: var(--pt-fg-4); }

/* ── Status pills ── */
.pt-pay-status {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px; border-radius: 999px;
  font-size: 10.5px; font-weight: 600;
}
.pt-pay-status-waiting  { background: var(--pt-warn-soft);  color: var(--pt-warn);  }
.pt-pay-status-confirming { background: var(--pt-cool-soft); color: var(--pt-cool); }
.pt-pay-status-finished { background: var(--pt-ok-soft);   color: var(--pt-ok);   }
.pt-pay-status-failed,
.pt-pay-status-expired  { background: oklch(from var(--pt-danger) l c h / 0.1); color: var(--pt-danger); }

/* ── Right: detail panel ── */
.pt-pay-detail-col {
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
}
.pt-pay-detail-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--pt-fg-4); font-size: 12.5px;
}

/* ── Link detail ── */
.pt-pay-detail { flex: 1; overflow-y: auto; padding: 20px; min-height: 0; }
.pt-pay-detail-hd { margin-bottom: 18px; }
.pt-pay-detail-ref { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; color: var(--pt-fg); }
.pt-pay-detail-amount { font-size: 28px; font-weight: 700; font-family: var(--pt-mono); letter-spacing: -0.03em; color: var(--pt-fg); margin: 4px 0 8px; }

/* Progress bar */
.pt-pay-prog { display: flex; align-items: center; gap: 0; margin-bottom: 20px; }
.pt-pay-prog-step {
  display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1;
}
.pt-pay-prog-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--pt-line); border: 1.5px solid var(--pt-line);
}
.pt-pay-prog-dot.done { background: var(--pt-ok); border-color: var(--pt-ok); }
.pt-pay-prog-dot.active { background: var(--pt-accent); border-color: var(--pt-accent); }
.pt-pay-prog-label { font-size: 10px; color: var(--pt-fg-4); text-align: center; }
.pt-pay-prog-connector { flex: 1; height: 1.5px; background: var(--pt-line); margin-bottom: 14px; }
.pt-pay-prog-connector.done { background: var(--pt-ok); }

/* Share section */
.pt-pay-share { margin-bottom: 16px; }
.pt-pay-share-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--pt-fg-4); margin-bottom: 6px; }
.pt-pay-share-url {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  background: var(--pt-surface-2); border: 0.5px solid var(--pt-line);
  border-radius: var(--pt-radius-sm);
}
.pt-pay-share-url-text { flex: 1; font-size: 11.5px; color: var(--pt-fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--pt-mono); }
.pt-pay-copy-btn {
  padding: 3px 8px; border-radius: 4px;
  background: var(--pt-fg); color: var(--pt-bg);
  border: none; font-size: 11px; font-weight: 500; cursor: pointer;
  flex-shrink: 0;
}

/* Timeline */
.pt-pay-timeline { display: flex; flex-direction: column; gap: 0; }
.pt-pay-timeline-item {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 8px 0;
  border-bottom: 0.5px solid var(--pt-line-soft);
}
.pt-pay-timeline-item:last-child { border-bottom: none; }
.pt-pay-timeline-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--pt-fg-4); flex-shrink: 0; margin-top: 4px;
}
.pt-pay-timeline-dot.ok { background: var(--pt-ok); }
.pt-pay-timeline-dot.warn { background: var(--pt-warn); }
.pt-pay-timeline-body { flex: 1; min-width: 0; }
.pt-pay-timeline-label { font-size: 12px; color: var(--pt-fg); }
.pt-pay-timeline-time { font-size: 10.5px; color: var(--pt-fg-4); margin-top: 1px; font-family: var(--pt-mono); }

/* ── Create link modal ── */
.pt-pay-modal-backdrop {
  position: fixed; inset: 0; background: oklch(0 0 0 / 0.35);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.pt-pay-modal {
  background: var(--pt-surface);
  border: 0.5px solid var(--pt-line);
  border-radius: var(--pt-radius-lg);
  box-shadow: 0 8px 40px oklch(0 0 0 / 0.18);
  width: 480px; max-width: calc(100vw - 32px);
  display: flex; flex-direction: column;
}
.pt-pay-modal-hd {
  display: flex; align-items: center;
  padding: 16px 20px 12px;
  border-bottom: 0.5px solid var(--pt-line);
}
.pt-pay-modal-title { flex: 1; font-size: 14px; font-weight: 600; }
.pt-pay-modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.pt-pay-modal-ft {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 12px 20px 16px;
  border-top: 0.5px solid var(--pt-line);
}

/* Field */
.pt-pay-field { display: flex; flex-direction: column; gap: 5px; }
.pt-pay-field-label { font-size: 11.5px; font-weight: 500; color: var(--pt-fg-2); }
.pt-pay-field-val {
  padding: 8px 10px;
  background: var(--pt-surface-2); border: 0.5px solid var(--pt-line);
  border-radius: var(--pt-radius-sm); font-size: 13px; color: var(--pt-fg);
}

/* Token toggles */
.pt-pay-token-grid { display: flex; gap: 6px; flex-wrap: wrap; }
.pt-pay-token {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px;
  background: var(--pt-surface-2); border: 0.5px solid var(--pt-line);
  border-radius: var(--pt-radius-sm); font-size: 11.5px; font-weight: 500;
  color: var(--pt-fg-2); cursor: pointer;
}
.pt-pay-token.active {
  border-color: var(--pt-accent); background: var(--pt-accent-soft);
  color: var(--pt-accent-fg);
}
.pt-pay-token-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
```

- [ ] **Step 2: Add import to `src/app/layout.tsx`**

Add after the last import line:

```typescript
import '../../styles/payments.css'
```

- [ ] **Step 3: Commit**

```bash
git add styles/payments.css src/app/layout.tsx
git commit -m "feat: payments CSS"
```

---

## Task K: Payments page and list view

**Files:**
- Create: `src/app/payments/page.tsx`
- Create: `src/components/payments/PaymentsView.tsx`

- [ ] **Step 1: Write the server page**

```typescript
// src/app/payments/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/shell/Sidebar'
import { TopBar } from '@/components/shell/TopBar'
import { PaymentsView } from '@/components/payments/PaymentsView'
import { getWallet, getPaymentLinks } from './actions'

export default async function PaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRow } = await supabase
    .from('users').select('tenant_id, display_name').eq('id', user.id).single()
  if (!userRow) redirect('/login')

  const [{ wallet, recentTransactions }, paymentLinks] = await Promise.all([
    getWallet(),
    getPaymentLinks(),
  ])

  const { data: pinned } = await supabase
    .from('conversations')
    .select('id, status, unread_count, last_message_at, last_message_snippet, channel_type, channel_identifier, is_pinned, customers(id, display_name, trust_score, ltv, customer_tags(tag), customer_channels(channel_type, display_handle, is_primary))')
    .eq('is_pinned', true)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  return (
    <div className="pt-root no-right">
      <Sidebar displayName={userRow.display_name ?? 'Me'} initialPinned={pinned ?? []} />
      <div className="pt-main">
        <TopBar />
        <PaymentsView
          wallet={wallet}
          recentTransactions={recentTransactions}
          paymentLinks={paymentLinks}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write PaymentsView component**

```tsx
// src/components/payments/PaymentsView.tsx
'use client'

import { useState } from 'react'
import type { TenantCryptoWallet, CryptoPaymentLink, WalletTransaction, CryptoPaymentStatus } from '@/types/payments-crypto'
import { PaymentLinkDetail } from './PaymentLinkDetail'
import { CreatePaymentLinkModal } from './CreatePaymentLinkModal'

type FilterTab = 'all' | 'waiting' | 'confirming' | 'finished' | 'failed'

const STATUS_LABEL: Record<string, string> = {
  waiting: 'Waiting', confirming: 'Confirming', confirmed: 'Confirmed',
  sending: 'Sending', partially_paid: 'Partial', finished: 'Paid',
  failed: 'Failed', expired: 'Expired',
}

function statusClass(status: string) {
  if (status === 'finished') return 'pt-pay-status-finished'
  if (status === 'confirming' || status === 'confirmed' || status === 'sending') return 'pt-pay-status-confirming'
  if (status === 'failed' || status === 'expired') return 'pt-pay-status-failed'
  return 'pt-pay-status-waiting'
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

export function PaymentsView({
  wallet,
  recentTransactions,
  paymentLinks,
}: {
  wallet: TenantCryptoWallet | null
  recentTransactions: WalletTransaction[]
  paymentLinks: CryptoPaymentLink[]
}) {
  const [filter, setFilter] = useState<FilterTab>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [links, setLinks] = useState(paymentLinks)

  const filtered = filter === 'all'
    ? links
    : links.filter(l => {
        if (filter === 'waiting') return l.status === 'waiting'
        if (filter === 'confirming') return ['confirming', 'confirmed', 'sending'].includes(l.status)
        if (filter === 'finished') return l.status === 'finished'
        if (filter === 'failed') return ['failed', 'expired'].includes(l.status)
        return true
      })

  const selected = links.find(l => l.id === selectedId) ?? null

  const outstanding = links.filter(l => !['finished', 'failed', 'expired'].includes(l.status))
    .reduce((s, l) => s + l.amount_usd, 0)
  const settled7d = links.filter(l => l.status === 'finished' && l.confirmed_at && Date.now() - new Date(l.confirmed_at).getTime() < 7 * 86400000)
    .reduce((s, l) => s + (l.usdc_received ?? l.amount_usd), 0)
  const confirming = links.filter(l => ['confirming', 'confirmed', 'sending'].includes(l.status)).length

  function handleLinkCreated(link: CryptoPaymentLink) {
    setLinks(prev => [link, ...prev])
    setSelectedId(link.id)
    setShowCreate(false)
  }

  return (
    <div className="pt-pay">
      {/* Header */}
      <div className="pt-pay-hd">
        <div>
          <h1>Payments</h1>
          <p>
            {wallet
              ? <><strong className="mono">${wallet.balance_usdc.toFixed(2)}</strong> USDC balance · {links.length} link{links.length !== 1 ? 's' : ''}</>
              : 'No wallet yet — create a payment link to activate'}
          </p>
        </div>
        <button className="pt-btn pt-btn-primary" onClick={() => setShowCreate(true)}>
          + New payment link
        </button>
      </div>

      {/* KPI strip */}
      <div className="pt-pay-kpi">
        <div className="pt-pay-kpi-item">
          <div className="pt-pay-kpi-label">Outstanding</div>
          <div className="pt-pay-kpi-val">${outstanding.toFixed(2)}</div>
          <div className="pt-pay-kpi-sub">awaiting payment</div>
        </div>
        <div className="pt-pay-kpi-item">
          <div className="pt-pay-kpi-label">Confirming</div>
          <div className="pt-pay-kpi-val">{confirming}</div>
          <div className="pt-pay-kpi-sub">links on-chain</div>
        </div>
        <div className="pt-pay-kpi-item">
          <div className="pt-pay-kpi-label">Settled 7d</div>
          <div className="pt-pay-kpi-val">${settled7d.toFixed(2)}</div>
          <div className="pt-pay-kpi-sub">USDC received</div>
        </div>
        <div className="pt-pay-kpi-item">
          <div className="pt-pay-kpi-label">Wallet balance</div>
          <div className="pt-pay-kpi-val">${wallet?.balance_usdc.toFixed(2) ?? '—'}</div>
          <div className="pt-pay-kpi-sub">USDC on Solana</div>
        </div>
      </div>

      {/* Body */}
      <div className="pt-pay-body">
        {/* Links list */}
        <div className="pt-pay-list-col">
          <div className="pt-pay-list-bar">
            <div className="pt-pay-list-bar-pills">
              {(['all', 'waiting', 'confirming', 'finished', 'failed'] as FilterTab[]).map(f => (
                <button
                  key={f}
                  className={`pt-pay-filter-pill${filter === f ? ' sel' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : STATUS_LABEL[f] ?? f}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-pay-list-scroll">
            <ul className="pt-pay-list">
              {filtered.map(link => (
                <li key={link.id}>
                  <div
                    className={`pt-pay-row${selectedId === link.id ? ' is-sel' : ''}`}
                    onClick={() => setSelectedId(link.id)}
                  >
                    <div>
                      <div className="pt-pay-row-ref">Order {link.order_id.slice(0, 8)}…</div>
                      <div className="pt-pay-row-meta">{timeAgo(link.created_at)}</div>
                    </div>
                    <span className={`pt-pay-status ${statusClass(link.status)}`}>
                      {STATUS_LABEL[link.status] ?? link.status}
                    </span>
                    <div className="pt-pay-row-amount">${link.amount_usd.toFixed(2)}</div>
                  </div>
                </li>
              ))}
              {filtered.length === 0 && (
                <li style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--pt-fg-4)', fontSize: '12.5px' }}>
                  No payment links yet
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Detail panel */}
        <div className="pt-pay-detail-col">
          {selected
            ? <PaymentLinkDetail link={selected} />
            : <div className="pt-pay-detail-empty">Select a payment link to view details</div>
          }
        </div>
      </div>

      {showCreate && (
        <CreatePaymentLinkModal
          onClose={() => setShowCreate(false)}
          onCreated={handleLinkCreated}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors (CreatePaymentLinkModal and PaymentLinkDetail will show module-not-found until Task L/M — that's fine, tsc will catch actual type errors).

- [ ] **Step 4: Commit**

```bash
git add src/app/payments/page.tsx src/components/payments/PaymentsView.tsx
git commit -m "feat: Payments page and list view"
```

---

## Task L: Payment link detail panel

**Files:**
- Create: `src/components/payments/PaymentLinkDetail.tsx`

- [ ] **Step 1: Write PaymentLinkDetail**

```tsx
// src/components/payments/PaymentLinkDetail.tsx
'use client'

import { useState } from 'react'
import type { CryptoPaymentLink } from '@/types/payments-crypto'

const STEPS = ['Created', 'Sent', 'Opened', 'Paid', 'Settled'] as const

function stepIndex(status: string): number {
  if (status === 'waiting') return 0
  if (['confirming', 'confirmed', 'sending'].includes(status)) return 2
  if (status === 'finished') return 4
  return 0
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function PaymentLinkDetail({ link }: { link: CryptoPaymentLink }) {
  const [copied, setCopied] = useState(false)

  function copyUrl() {
    navigator.clipboard.writeText(link.hosted_url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const activeStep = stepIndex(link.status)

  const timelineEvents: { label: string; time: string; variant: 'ok' | 'warn' | 'default' }[] = [
    { label: 'Payment link created', time: link.created_at, variant: 'default' },
    ...(link.confirmed_at ? [{ label: `Payment received — ${link.paid_token ?? 'USDC'} → USDC`, time: link.confirmed_at, variant: 'ok' as const }] : []),
    ...(link.status === 'expired' ? [{ label: 'Payment link expired', time: link.expires_at ?? link.created_at, variant: 'warn' as const }] : []),
    ...(link.status === 'failed' ? [{ label: 'Payment failed', time: link.created_at, variant: 'warn' as const }] : []),
  ]

  return (
    <div className="pt-pay-detail">
      {/* Header */}
      <div className="pt-pay-detail-hd">
        <div className="pt-pay-detail-ref">Payment link</div>
        <div className="pt-pay-detail-amount">${link.amount_usd.toFixed(2)}</div>
        {link.usdc_received != null && (
          <div style={{ fontSize: '12px', color: 'var(--pt-fg-3)' }}>
            {link.usdc_received.toFixed(4)} USDC received
            {link.paid_token && link.paid_token !== 'usdcsol' && <> · paid in {link.paid_token.toUpperCase()}</>}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="pt-pay-prog">
        {STEPS.map((step, i) => (
          <div key={step} style={{ display: 'contents' }}>
            <div className="pt-pay-prog-step">
              <div className={`pt-pay-prog-dot${i < activeStep ? ' done' : i === activeStep ? ' active' : ''}`} />
              <div className="pt-pay-prog-label">{step}</div>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`pt-pay-prog-connector${i < activeStep ? ' done' : ''}`} />
            )}
          </div>
        ))}
      </div>

      {/* Share URL */}
      {!['finished', 'failed', 'expired'].includes(link.status) && (
        <div className="pt-pay-share">
          <div className="pt-pay-share-label">Payment link</div>
          <div className="pt-pay-share-url">
            <span className="pt-pay-share-url-text">{link.hosted_url}</span>
            <button className="pt-pay-copy-btn" onClick={copyUrl}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="pt-pay-share-label" style={{ marginBottom: '8px' }}>Timeline</div>
      <div className="pt-pay-timeline">
        {timelineEvents.map((ev, i) => (
          <div key={i} className="pt-pay-timeline-item">
            <div className={`pt-pay-timeline-dot${ev.variant === 'ok' ? ' ok' : ev.variant === 'warn' ? ' warn' : ''}`} />
            <div className="pt-pay-timeline-body">
              <div className="pt-pay-timeline-label">{ev.label}</div>
              <div className="pt-pay-timeline-time">{fmt(ev.time)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Meta */}
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '11px', color: 'var(--pt-fg-4)' }}>
          NOWPayments ID: <span style={{ fontFamily: 'var(--pt-mono)' }}>{link.nowpayments_id}</span>
        </div>
        {link.expires_at && (
          <div style={{ fontSize: '11px', color: 'var(--pt-fg-4)' }}>
            Expires: {fmt(link.expires_at)}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/payments/PaymentLinkDetail.tsx
git commit -m "feat: payment link detail panel"
```

---

## Task M: Create payment link modal

**Files:**
- Create: `src/components/payments/CreatePaymentLinkModal.tsx`

- [ ] **Step 1: Write CreatePaymentLinkModal**

```tsx
// src/components/payments/CreatePaymentLinkModal.tsx
'use client'

import { useState } from 'react'
import { createPaymentLink } from '@/app/payments/actions'
import type { CryptoPaymentLink } from '@/types/payments-crypto'

const TOKENS = [
  { id: 'btc',     label: 'BTC',  color: '#f7931a' },
  { id: 'eth',     label: 'ETH',  color: '#627eea' },
  { id: 'xrp',     label: 'XRP',  color: '#0095d9' },
  { id: 'sol',     label: 'SOL',  color: '#9945ff' },
  { id: 'usdcsol', label: 'USDC', color: '#2775ca' },
  { id: 'usdttrx', label: 'USDT', color: '#26a17b' },
]

export function CreatePaymentLinkModal({
  orderId,
  orderRef,
  amountUsd,
  onClose,
  onCreated,
}: {
  orderId?: string
  orderRef?: string
  amountUsd?: number
  onClose: () => void
  onCreated: (link: CryptoPaymentLink) => void
}) {
  const [inputOrderId, setInputOrderId] = useState(orderId ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!inputOrderId.trim()) { setError('Order ID is required'); return }
    setSubmitting(true)
    setError('')
    const result = await createPaymentLink(inputOrderId.trim())
    setSubmitting(false)
    if (result.error) { setError(result.error); return }
    if (result.link) onCreated(result.link)
  }

  return (
    <div className="pt-pay-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pt-pay-modal">
        <div className="pt-pay-modal-hd">
          <div className="pt-pay-modal-title">New payment link</div>
          <button className="pt-btn pt-btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="pt-pay-modal-body">
          {/* Amount (read-only if pre-filled from order) */}
          {amountUsd != null && (
            <div className="pt-pay-field">
              <div className="pt-pay-field-label">Amount</div>
              <div className="pt-pay-field-val">${amountUsd.toFixed(2)} USD</div>
            </div>
          )}

          {/* Order reference */}
          <div className="pt-pay-field">
            <div className="pt-pay-field-label">Order</div>
            {orderRef
              ? <div className="pt-pay-field-val">{orderRef}</div>
              : (
                <input
                  className="pt-input"
                  placeholder="Order ID"
                  value={inputOrderId}
                  onChange={e => setInputOrderId(e.target.value)}
                />
              )
            }
          </div>

          {/* Accepted tokens */}
          <div className="pt-pay-field">
            <div className="pt-pay-field-label">Customer can pay with</div>
            <div className="pt-pay-token-grid">
              {TOKENS.map(t => (
                <div key={t.id} className="pt-pay-token active">
                  <span className="pt-pay-token-dot" style={{ background: t.color }} />
                  {t.label}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--pt-fg-4)', marginTop: '4px' }}>
              NOWPayments converts all tokens to USDC on receipt.
            </div>
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: 'var(--pt-danger)', padding: '8px 10px', background: 'oklch(from var(--pt-danger) l c h / 0.08)', borderRadius: '6px' }}>
              {error}
            </div>
          )}
        </div>

        <div className="pt-pay-modal-ft">
          <button className="pt-btn pt-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="pt-btn pt-btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Generate link →'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/payments/CreatePaymentLinkModal.tsx
git commit -m "feat: create payment link modal"
```

---

## Task N: Navigation and environment variables

**Files:**
- Modify: `src/components/shell/Sidebar.tsx`
- Modify: `.env.local` (document only — not committed)

- [ ] **Step 1: Add Payments to sidebar nav**

In `src/components/shell/Sidebar.tsx`, find `NAV_PRIMARY` (line 43) and add the Payments item between Orders and Catalog:

```typescript
const NAV_PRIMARY = [
  { label: 'Dashboard',   href: '/',              icon: Icons.spark,  badge: null },
  { label: 'Inbox',       href: '/inbox',          icon: Icons.inbox,  badge: null },
  { label: 'Customers',   href: '/customers',      icon: Icons.users,  badge: null },
  { label: 'Orders',      href: '/orders',         icon: Icons.box,    badge: null },
  { label: 'Payments',    href: '/payments',        icon: Icons.wallet, badge: null },
  { label: 'Catalog',     href: '/catalog',        icon: Icons.flask,  badge: null },
  { label: 'Broadcasts',  href: '/broadcasts',     icon: Icons.send,   badge: null },
  { label: 'Automations', href: '/automations',    icon: Icons.zap,    badge: null },
]
```

- [ ] **Step 2: Document required env vars**

Add to `.env.local` (never commit this file — it's in .gitignore):

```
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
NOWPAYMENTS_API_KEY=your_nowpayments_api_key
NOWPAYMENTS_IPN_SECRET=your_nowpayments_ipn_secret
HELIUS_API_KEY=your_helius_api_key
HELIUS_WEBHOOK_SECRET=your_helius_webhook_secret
```

- [ ] **Step 3: Full test run**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/Sidebar.tsx
git commit -m "feat: add Payments to sidebar navigation"
```

---

## Verification

1. Navigate to `/payments` — page renders with KPI strip and empty list. Header shows "No wallet yet" until a link is created.
2. Click "New payment link", enter a valid order ID, click "Generate link →" — modal closes, link appears in list with "Waiting" status, detail panel opens showing progress bar and the NOWPayments hosted URL.
3. Copy the URL — opens NOWPayments hosted checkout page in browser. Confirm it shows BTC/ETH/XRP/SOL/USDC options and the correct USD amount.
4. Simulate a NOWPayments webhook:

```bash
# Replace with your actual IPN secret
SECRET="your_ipn_secret"
BODY='{"payment_id":"test_pay_1","payment_status":"finished","pay_currency":"btc","pay_amount":0.0023,"actually_paid":0.0023,"outcome_amount":149.50,"outcome_currency":"usdcsol","order_id":"<your_order_uuid>","price_amount":150,"price_currency":"usd","nowpayments_fee":0.75}'
SIG=$(echo -n "$BODY" | openssl dgst -sha512 -hmac "$SECRET" | awk '{print $2}')
curl -X POST http://localhost:3000/api/webhooks/nowpayments \
  -H "Content-Type: application/json" \
  -H "x-nowpayments-sig: $SIG" \
  -d "$BODY"
```

5. Refresh `/payments` — the link status updates to "Paid", KPI strip shows the settled amount, wallet balance increments.
6. Check the linked order in `/orders` — `payment_asset` and `tx_hash` are updated.
7. `npm run test:run` passes.
8. `npx tsc --noEmit` clean.
