# Payment Methods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire payment method configuration (wallets + bank) into tenant settings and order creation/confirmation flow, including payment instructions in the inbox composer and invoice PDF.

**Architecture:** New `tenant_payment_configs` table holds one row per coin per tenant. A shared helper builds payment messages. The order form reads live configs from an API route; the order detail view passes configs server-side. Payment instructions reach the customer via a pre-filled inbox composer or invoice PDF.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + RLS), Vitest, @react-pdf/renderer

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260511000001_tenant_payment_configs.sql` | Create | DB table + RLS |
| `src/types/payments.ts` | Create | PaymentType, TenantPaymentConfig, PAYMENT_LABELS, PAYMENT_METHODS |
| `src/lib/payments.ts` | Create | buildPaymentMessage helper |
| `src/lib/__tests__/payments.test.ts` | Create | Unit tests for buildPaymentMessage |
| `src/app/api/payments/configs/route.ts` | Create | GET active configs for current tenant |
| `src/app/settings/wallets/actions.ts` | Create | upsertPaymentConfig, togglePaymentConfig server actions |
| `src/components/settings/WalletsForm.tsx` | Create | Client UI for wallet config |
| `src/app/settings/wallets/page.tsx` | Modify | Replace stub — fetch configs, render WalletsForm |
| `styles/settings.css` | Modify | Add `.pt-st-wallet-*` styles |
| `src/components/orders/CreateOrderForm.tsx` | Modify | Dynamic dropdown, auto-populate address |
| `src/app/orders/actions.ts` | Modify | Add confirmPayment action |
| `src/components/orders/OrderDetailView.tsx` | Modify | Add payment panel, send/confirm UI |
| `src/app/orders/[orderId]/page.tsx` | Modify | Fetch + pass paymentConfigs to OrderDetailView |
| `src/app/inbox/page.tsx` | Modify | Add prefill to searchParams |
| `src/components/inbox/InboxView.tsx` | Modify | Pass initialPrefill → InboxLayout → ConversationPane → Composer |
| `src/types/invoices.ts` | Modify | Add InvoicePaymentMethod, extend InvoiceData, update buildInvoiceData |
| `src/components/invoices/InvoicePDF.tsx` | Modify | Render paymentMethods section |
| `src/app/api/invoices/generate/route.ts` | Modify | Fetch configs, pass to buildInvoiceData |
| `src/types/database.ts` | Modify | Regenerate to include new table |

---

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260511000001_tenant_payment_configs.sql`

- [ ] **Step 1: Write migration file**

```sql
-- supabase/migrations/20260511000001_tenant_payment_configs.sql
CREATE TABLE tenant_payment_configs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  type           text NOT NULL,
  wallet_address text,
  bank_name      text,
  account_name   text,
  account_number text,
  sort_code      text,
  iban           text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, type)
);

CREATE INDEX ON tenant_payment_configs (tenant_id);

ALTER TABLE tenant_payment_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON tenant_payment_configs
  USING (tenant_id = auth_tenant_id());
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push --include-all
```

Expected: `tenant_payment_configs` table created with RLS.

- [ ] **Step 3: Regenerate TypeScript types**

Run the Supabase MCP `generate_typescript_types` tool and overwrite `src/types/database.ts` with the output.

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260511000001_tenant_payment_configs.sql src/types/database.ts
git commit -m "feat: add tenant_payment_configs table with RLS"
```

---

### Task 2: Payment Types and buildPaymentMessage Helper

**Files:**
- Create: `src/types/payments.ts`
- Create: `src/lib/payments.ts`
- Create: `src/lib/__tests__/payments.test.ts`

- [ ] **Step 1: Write `src/types/payments.ts`**

```typescript
export type PaymentType =
  | 'usdt_trc20'
  | 'btc'
  | 'eth'
  | 'usdc_erc20'
  | 'ltc'
  | 'xmr'
  | 'bank_transfer'
  | 'cash'
  | 'customer_chooses'

export const PAYMENT_LABELS: Record<string, string> = {
  usdt_trc20:       'USDT (TRC20)',
  btc:              'BTC',
  eth:              'ETH',
  usdc_erc20:       'USDC (ERC20)',
  ltc:              'LTC',
  xmr:              'XMR',
  bank_transfer:    'Bank Transfer',
  cash:             'Cash',
  customer_chooses: 'Customer chooses',
}

// Ordered list shown in dropdowns and config UI (excludes cash + customer_chooses)
export const PAYMENT_METHODS: PaymentType[] = [
  'usdt_trc20', 'btc', 'eth', 'usdc_erc20', 'ltc', 'xmr', 'bank_transfer',
]

export interface TenantPaymentConfig {
  id: string
  tenant_id: string
  type: string
  wallet_address: string | null
  bank_name: string | null
  account_name: string | null
  account_number: string | null
  sort_code: string | null
  iban: string | null
  is_active: boolean
  created_at: string
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/__tests__/payments.test.ts
import { describe, it, expect } from 'vitest'
import { buildPaymentMessage } from '../payments'
import type { TenantPaymentConfig } from '@/types/payments'

const cryptoConfig = (type: string, address: string): TenantPaymentConfig => ({
  id: '1', tenant_id: 't1', type, wallet_address: address,
  bank_name: null, account_name: null, account_number: null,
  sort_code: null, iban: null, is_active: true, created_at: new Date().toISOString(),
})

const bankConfig: TenantPaymentConfig = {
  id: '2', tenant_id: 't1', type: 'bank_transfer', wallet_address: null,
  bank_name: 'Barclays', account_name: 'Alan Ambrose', account_number: '12345678',
  sort_code: '04-00-04', iban: null, is_active: true, created_at: new Date().toISOString(),
}

describe('buildPaymentMessage', () => {
  it('returns empty string for cash orders', () => {
    expect(buildPaymentMessage(
      { ref_number: 'A-1', payment_amount: 100, payment_asset: 'cash', payment_address: null },
      []
    )).toBe('')
  })

  it('builds single crypto message', () => {
    const msg = buildPaymentMessage(
      { ref_number: 'A-1', payment_amount: 330, payment_asset: 'usdt_trc20', payment_address: 'T9XbnHabc' },
      []
    )
    expect(msg).toContain('A-1')
    expect(msg).toContain('$330.00')
    expect(msg).toContain('USDT (TRC20)')
    expect(msg).toContain('T9XbnHabc')
  })

  it('builds bank transfer message with reference', () => {
    const msg = buildPaymentMessage(
      { ref_number: 'A-2', payment_amount: 200, payment_asset: 'bank_transfer', payment_address: null },
      [bankConfig]
    )
    expect(msg).toContain('A-2')
    expect(msg).toContain('Alan Ambrose')
    expect(msg).toContain('04-00-04')
    expect(msg).toContain('Reference: A-2')
  })

  it('builds customer_chooses message with all active configs', () => {
    const configs = [
      cryptoConfig('usdt_trc20', 'Taddr123'),
      bankConfig,
    ]
    const msg = buildPaymentMessage(
      { ref_number: 'A-3', payment_amount: 150, payment_asset: 'customer_chooses', payment_address: null },
      configs
    )
    expect(msg).toContain('USDT (TRC20): TAddr123')
    expect(msg).toContain('Bank Transfer')
    expect(msg).toContain('Ref: A-3')
  })

  it('returns fallback when address missing for single coin', () => {
    const msg = buildPaymentMessage(
      { ref_number: 'A-4', payment_amount: 100, payment_asset: 'btc', payment_address: null },
      []
    )
    expect(msg).toContain('contact the operator')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:run -- src/lib/__tests__/payments.test.ts
```

Expected: FAIL — `buildPaymentMessage` not found.

- [ ] **Step 4: Write `src/lib/payments.ts`**

```typescript
import { PAYMENT_LABELS } from '@/types/payments'
import type { TenantPaymentConfig } from '@/types/payments'

interface OrderPaymentInfo {
  ref_number: string
  payment_amount: number
  payment_asset: string
  payment_address: string | null
}

export function buildPaymentMessage(
  order: OrderPaymentInfo,
  configs: TenantPaymentConfig[],
): string {
  if (order.payment_asset === 'cash') return ''

  const amount = `$${order.payment_amount.toFixed(2)}`
  const header = `Payment details for order ${order.ref_number} · ${amount}`

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
      return `${PAYMENT_LABELS[c.type] ?? c.type}: ${c.wallet_address}`
    })
    const hasBankTransfer = active.some(c => c.type === 'bank_transfer')
    const note = hasBankTransfer ? '\n\nPlease include the reference number for bank transfers.' : ''
    return `${header}\n\n${lines.join('\n')}${note}`
  }

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

  if (!order.payment_address) {
    return `${header}\n\nPayment details unavailable — contact the operator.`
  }
  const label = PAYMENT_LABELS[order.payment_asset] ?? order.payment_asset
  return `${header}\n\n${label}: ${order.payment_address}\n\nPlease send the exact amount shown on the invoice.`
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:run -- src/lib/__tests__/payments.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/payments.ts src/lib/payments.ts src/lib/__tests__/payments.test.ts
git commit -m "feat: payment types, labels, and buildPaymentMessage helper"
```

---

### Task 3: API Route — GET /api/payments/configs

**Files:**
- Create: `src/app/api/payments/configs/route.ts`

- [ ] **Step 1: Write route**

```typescript
// src/app/api/payments/configs/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenant_payment_configs')
    .select('id, type, wallet_address, bank_name, account_name, account_number, sort_code, iban, is_active')
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/payments/configs/route.ts
git commit -m "feat: GET /api/payments/configs — active tenant payment configs"
```

---

### Task 4: Settings Wallet Actions

**Files:**
- Create: `src/app/settings/wallets/actions.ts`

- [ ] **Step 1: Write actions file**

```typescript
// src/app/settings/wallets/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id }
}

export async function upsertPaymentConfig(data: {
  type: string
  walletAddress?: string
  bankName?: string
  accountName?: string
  accountNumber?: string
  sortCode?: string
  iban?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('tenant_payment_configs').upsert({
      tenant_id: tenantId,
      type: data.type,
      wallet_address: data.walletAddress ?? null,
      bank_name: data.bankName ?? null,
      account_name: data.accountName ?? null,
      account_number: data.accountNumber ?? null,
      sort_code: data.sortCode ?? null,
      iban: data.iban ?? null,
      is_active: true,
    }, { onConflict: 'tenant_id,type' })
    if (error) return { error: error.message }
    revalidatePath('/settings/wallets')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function togglePaymentConfig(
  type: string,
  isActive: boolean,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('tenant_payment_configs')
      .update({ is_active: isActive })
      .eq('tenant_id', tenantId)
      .eq('type', type)
    if (error) return { error: error.message }
    revalidatePath('/settings/wallets')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/wallets/actions.ts
git commit -m "feat: upsertPaymentConfig and togglePaymentConfig server actions"
```

---

### Task 5: Settings Wallets UI

**Files:**
- Create: `src/components/settings/WalletsForm.tsx`
- Modify: `src/app/settings/wallets/page.tsx`
- Modify: `styles/settings.css`

- [ ] **Step 1: Add wallet CSS to `styles/settings.css`** (append at end of file)

```css
/* ─── Wallets & Assets ───────────────────────────────────────────────────── */
.pt-st-wallet-row {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 10px; padding: 10px 0;
  border-top: 0.5px solid var(--pt-line-soft);
}
.pt-st-wallet-row:first-child { border-top: 0; }
.pt-st-wallet-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pt-st-wallet-name { font-size: 12.5px; font-weight: 500; }
.pt-st-wallet-addr { font-size: 11px; color: var(--pt-fg-3); font-family: var(--pt-mono); }
.pt-st-wallet-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.pt-st-wallet-edit { width: 100%; display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
.pt-st-wallet-edit .pt-st-input { max-width: 100%; }
.pt-st-wallet-panel {
  border: 0.5px solid var(--pt-line);
  border-radius: var(--pt-radius);
  padding: 14px 16px;
  margin-bottom: 14px;
  background: var(--pt-surface);
}
.pt-st-wallet-panel-hd {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--pt-fg-4); margin-bottom: 10px;
}
.pt-st-toggle {
  width: 32px; height: 18px; border-radius: 9px;
  border: none; cursor: pointer; flex-shrink: 0;
  background: var(--pt-line); transition: background 0.15s;
  position: relative;
}
.pt-st-toggle::after {
  content: ''; position: absolute; top: 3px; left: 3px;
  width: 12px; height: 12px; border-radius: 50%;
  background: white; transition: left 0.15s;
}
.pt-st-toggle.is-on { background: var(--pt-accent); }
.pt-st-toggle.is-on::after { left: 17px; }
.pt-st-toggle:disabled { opacity: 0.4; cursor: default; }
```

- [ ] **Step 2: Write `src/components/settings/WalletsForm.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { upsertPaymentConfig, togglePaymentConfig } from '@/app/settings/wallets/actions'
import { PAYMENT_METHODS, PAYMENT_LABELS } from '@/types/payments'
import type { TenantPaymentConfig } from '@/types/payments'

const CRYPTO_TYPES = PAYMENT_METHODS.filter(m => m !== 'bank_transfer')

function maskAddress(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

export function WalletsForm({ configs }: { configs: TenantPaymentConfig[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [bankForm, setBankForm] = useState({
    bankName: '', accountName: '', accountNumber: '', sortCode: '', iban: '',
  })
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const cfg = (type: string) => configs.find(c => c.type === type) ?? null

  const saveCrypto = (type: string) => {
    if (!editValue.trim()) return
    setError('')
    startTransition(async () => {
      const r = await upsertPaymentConfig({ type, walletAddress: editValue.trim() })
      if ('error' in r) { setError(r.error); return }
      setEditing(null); setEditValue('')
    })
  }

  const saveBank = () => {
    if (!bankForm.accountName.trim()) { setError('Account name is required'); return }
    if (!bankForm.sortCode.trim() && !bankForm.iban.trim()) { setError('Sort code or IBAN is required'); return }
    setError('')
    startTransition(async () => {
      const r = await upsertPaymentConfig({
        type: 'bank_transfer',
        bankName: bankForm.bankName || undefined,
        accountName: bankForm.accountName,
        accountNumber: bankForm.accountNumber || undefined,
        sortCode: bankForm.sortCode || undefined,
        iban: bankForm.iban || undefined,
      })
      if ('error' in r) { setError(r.error); return }
      setEditing(null)
    })
  }

  const toggle = (type: string, current: boolean) => {
    startTransition(async () => { await togglePaymentConfig(type, !current) })
  }

  const startEditBank = () => {
    const c = cfg('bank_transfer')
    setBankForm({
      bankName: c?.bank_name ?? '', accountName: c?.account_name ?? '',
      accountNumber: c?.account_number ?? '', sortCode: c?.sort_code ?? '', iban: c?.iban ?? '',
    })
    setEditing('bank_transfer'); setError('')
  }

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>Wallets &amp; assets</h2>
          <p>Configure the payment methods you accept. Only active methods appear on orders.</p>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: 'var(--pt-danger)', marginBottom: 10 }}>{error}</p>
      )}

      {/* Crypto */}
      <div className="pt-st-wallet-panel">
        <div className="pt-st-wallet-panel-hd">Crypto addresses</div>
        {CRYPTO_TYPES.map(type => {
          const c = cfg(type)
          const isEditing = editing === type
          return (
            <div key={type} className="pt-st-wallet-row">
              <div className="pt-st-wallet-info">
                <span className="pt-st-wallet-name">{PAYMENT_LABELS[type]}</span>
                <span className="pt-st-wallet-addr">
                  {c?.wallet_address ? maskAddress(c.wallet_address) : 'Not configured'}
                </span>
              </div>
              <div className="pt-st-wallet-actions">
                {c && (
                  <button
                    className={`pt-st-toggle ${c.is_active ? 'is-on' : ''}`}
                    title={c.is_active ? 'Active — click to disable' : 'Inactive — click to enable'}
                    onClick={() => toggle(type, c.is_active)}
                    disabled={pending}
                  />
                )}
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={() => { setEditing(type); setEditValue(c?.wallet_address ?? ''); setError('') }}
                >
                  {c ? 'Edit' : 'Add'}
                </button>
              </div>
              {isEditing && (
                <div className="pt-st-wallet-edit">
                  <input
                    className="pt-st-input mono"
                    placeholder={`${PAYMENT_LABELS[type]} receive address`}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="pt-btn pt-btn-primary"
                      style={{ fontSize: 11 }}
                      onClick={() => saveCrypto(type)}
                      disabled={pending || !editValue.trim()}
                    >
                      Save
                    </button>
                    <button
                      className="pt-btn pt-btn-ghost"
                      style={{ fontSize: 11 }}
                      onClick={() => { setEditing(null); setEditValue('') }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bank transfer */}
      <div className="pt-st-wallet-panel">
        <div className="pt-st-wallet-panel-hd">Bank transfer</div>
        {(() => {
          const c = cfg('bank_transfer')
          const isEditing = editing === 'bank_transfer'
          return (
            <div className="pt-st-wallet-row">
              <div className="pt-st-wallet-info">
                <span className="pt-st-wallet-name">Bank Transfer</span>
                <span className="pt-st-wallet-addr">
                  {c
                    ? `${c.account_name ?? ''}${c.sort_code ? ` · Sort: ${c.sort_code}` : ''}${c.iban ? ` · ${c.iban.slice(0, 8)}…` : ''}`
                    : 'Not configured'}
                </span>
              </div>
              <div className="pt-st-wallet-actions">
                {c && (
                  <button
                    className={`pt-st-toggle ${c.is_active ? 'is-on' : ''}`}
                    title={c.is_active ? 'Active — click to disable' : 'Inactive — click to enable'}
                    onClick={() => toggle('bank_transfer', c.is_active)}
                    disabled={pending}
                  />
                )}
                <button
                  className="pt-btn pt-btn-ghost"
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={startEditBank}
                >
                  {c ? 'Edit' : 'Add'}
                </button>
              </div>
              {isEditing && (
                <div className="pt-st-wallet-edit">
                  {([
                    { label: 'Bank name (optional)', key: 'bankName', placeholder: 'e.g. Barclays' },
                    { label: 'Account name', key: 'accountName', placeholder: 'Full name on account' },
                    { label: 'Account number', key: 'accountNumber', placeholder: '12345678' },
                    { label: 'Sort code', key: 'sortCode', placeholder: '04-00-04' },
                    { label: 'IBAN', key: 'iban', placeholder: 'GB29NWBK60161331926819' },
                  ] as { label: string; key: keyof typeof bankForm; placeholder: string }[]).map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 3 }}>{label}</div>
                      <input
                        className="pt-st-input"
                        placeholder={placeholder}
                        value={bankForm[key]}
                        onChange={e => setBankForm(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={saveBank} disabled={pending}>Save</button>
                    <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update `src/app/settings/wallets/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { WalletsForm } from '@/components/settings/WalletsForm'
import type { TenantPaymentConfig } from '@/types/payments'

export default async function WalletsPage() {
  const supabase = await createClient()
  const { data: configs } = await supabase
    .from('tenant_payment_configs')
    .select('*')
    .order('created_at')
  return <WalletsForm configs={(configs ?? []) as TenantPaymentConfig[]} />
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/WalletsForm.tsx src/app/settings/wallets/page.tsx src/app/settings/wallets/actions.ts styles/settings.css
git commit -m "feat: wallets & assets settings page with crypto and bank transfer config"
```

---

### Task 6: CreateOrderForm — Dynamic Payment Dropdown

**Files:**
- Modify: `src/components/orders/CreateOrderForm.tsx`

- [ ] **Step 1: Update `CreateOrderForm.tsx`**

Replace the hardcoded `paymentAsset` state and dropdown section. The full updated payment section (lines 21–23 and the payment `<div>` block, approximately lines 143–161):

```tsx
// Replace state initialisation at top of component:
const [paymentAsset, setPaymentAsset] = useState('cash')
const [paymentAddress, setPaymentAddress] = useState('')
const [paymentConfigs, setPaymentConfigs] = useState<{ type: string; wallet_address: string | null; is_active: boolean }[]>([])

// Add after the products useEffect:
useEffect(() => {
  fetch('/api/payments/configs')
    .then(r => r.json())
    .then((data: { type: string; wallet_address: string | null; is_active: boolean }[]) => {
      setPaymentConfigs(data.filter(c => c.is_active))
    })
    .catch(() => {})
}, [])

// Derived options for the dropdown:
const paymentOptions = (() => {
  const opts: { value: string; label: string }[] = [{ value: 'cash', label: 'Cash' }]
  for (const c of paymentConfigs) {
    const labels: Record<string, string> = {
      usdt_trc20: 'USDT (TRC20)', btc: 'BTC', eth: 'ETH',
      usdc_erc20: 'USDC (ERC20)', ltc: 'LTC', xmr: 'XMR',
      bank_transfer: 'Bank Transfer',
    }
    if (labels[c.type]) opts.push({ value: c.type, label: labels[c.type] })
  }
  if (paymentConfigs.filter(c => c.type !== 'cash').length >= 2) {
    opts.push({ value: 'customer_chooses', label: 'Customer chooses' })
  }
  return opts
})()
```

Replace the entire Payment `<div>` block (the one with the hardcoded `<select>` and address input):

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

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/CreateOrderForm.tsx
git commit -m "feat: dynamic payment method dropdown in order form, auto-populates address"
```

---

### Task 7: confirmPayment Server Action

**Files:**
- Modify: `src/app/orders/actions.ts`

- [ ] **Step 1: Add `confirmPayment` to `src/app/orders/actions.ts`** (append after `saveOrderNotes`):

```typescript
export async function confirmPayment(
  orderId: string,
  data: { actualPaymentAsset?: string; txHash?: string },
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()

    const { data: current, error: fetchError } = await supabase
      .from('orders')
      .select('status, payment_asset')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single()
    if (fetchError || !current) return { error: 'Order not found' }
    if (current.status !== 'awaiting') return { error: 'Order is not awaiting payment' }

    const update: Record<string, string> = { status: 'confirming' }
    if (data.actualPaymentAsset) update.payment_asset = data.actualPaymentAsset
    if (data.txHash?.trim()) update.tx_hash = data.txHash.trim()

    const { error: updateError } = await supabase
      .from('orders')
      .update(update)
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
    if (updateError) return { error: updateError.message }

    await supabase.from('order_events').insert({
      tenant_id: tenantId,
      order_id: orderId,
      actor: 'operator',
      action: 'Moved to Confirming',
      note: data.txHash?.trim() ? `TX: ${data.txHash.trim().slice(0, 24)}…` : null,
    })

    revalidatePath('/orders')
    revalidatePath(`/orders/${orderId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/orders/actions.ts
git commit -m "feat: confirmPayment server action — advances awaiting→confirming, stores tx hash"
```

---

### Task 8: Order Detail Payment Panel

**Files:**
- Modify: `src/app/orders/[orderId]/page.tsx`
- Modify: `src/components/orders/OrderDetailView.tsx`

- [ ] **Step 1: Update `src/app/orders/[orderId]/page.tsx`** — fetch payment configs and pass to view

Add the configs fetch to the existing `Promise.all`:

```typescript
// Add to Promise.all:
supabase.from('tenant_payment_configs').select('*').eq('is_active', true),
```

Update destructuring:
```typescript
const [{ data: order }, { data: events }, { data: paymentConfigs }] = await Promise.all([
  supabase.from('orders').select(ORDER_SELECT).eq('id', orderId).single(),
  supabase.from('order_events').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
  supabase.from('tenant_payment_configs').select('*').eq('is_active', true),
])
```

Add import:
```typescript
import type { TenantPaymentConfig } from '@/types/payments'
```

Pass to component:
```tsx
<OrderDetailView
  order={orderRow}
  events={(events ?? []) as DbOrderEvent[]}
  chatExcerpt={chatExcerpt}
  paymentConfigs={(paymentConfigs ?? []) as TenantPaymentConfig[]}
/>
```

- [ ] **Step 2: Update `src/components/orders/OrderDetailView.tsx`** — add payment panel

Add imports at top:
```typescript
import { useRouter } from 'next/navigation'
import { confirmPayment } from '@/app/orders/actions'
import { buildPaymentMessage } from '@/lib/payments'
import { PAYMENT_LABELS } from '@/types/payments'
import type { TenantPaymentConfig } from '@/types/payments'
```

Update props:
```typescript
export function OrderDetailView({ order, events, chatExcerpt, paymentConfigs }: {
  order: DbOrderRow
  events: DbOrderEvent[]
  chatExcerpt: { id: string; direction: string; content: string; sent_at: string }[]
  paymentConfigs: TenantPaymentConfig[]
}) {
```

Add state inside component (after existing state declarations):
```typescript
const router = useRouter()
const [showConfirmDialog, setShowConfirmDialog] = useState(false)
const [confirmAsset, setConfirmAsset] = useState('')
const [txHash, setTxHash] = useState('')
const [confirmError, setConfirmError] = useState('')
```

Add the `sendPaymentDetails` handler:
```typescript
const sendPaymentDetails = () => {
  const msg = buildPaymentMessage(
    { ref_number: order.ref_number, payment_amount: order.payment_amount, payment_asset: order.payment_asset, payment_address: order.payment_address },
    paymentConfigs,
  )
  if (!msg) return
  const encoded = encodeURIComponent(msg)
  if (order.conversation_id) {
    router.push(`/inbox?conversation=${order.conversation_id}&prefill=${encoded}`)
  } else {
    navigator.clipboard?.writeText(msg)
    alert('Payment details copied to clipboard (no linked conversation).')
  }
}

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
    if ('error' in result) { setConfirmError(result.error); return }
    setStatus('confirming')
    setShowConfirmDialog(false)
    setTxHash('')
    setConfirmAsset('')
  })
}
```

Add the payment panel JSX — insert **before** the `{/* Stepper */}` section, after `{showInvoiceModal && ...}`:

```tsx
{/* Payment panel */}
{status === 'awaiting' && order.payment_asset !== 'cash' && (
  <div className="pt-od-payment-panel">
    <div className="pt-od-payment-hd">
      <span>Payment</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={sendPaymentDetails}>
          <Icons.send size={11} /> Send payment details
        </button>
        {order.payment_address && (
          <button
            className="pt-btn pt-btn-ghost"
            style={{ fontSize: 11 }}
            onClick={() => navigator.clipboard?.writeText(order.payment_address!)}
          >
            Copy address
          </button>
        )}
        <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={() => setShowConfirmDialog(true)}>
          Mark as received
        </button>
      </div>
    </div>
    <div className="pt-od-payment-body">
      <span className="pt-od-payment-asset">{PAYMENT_LABELS[order.payment_asset] ?? order.payment_asset}</span>
      {order.payment_address && (
        <span className="pt-od-payment-addr mono">{order.payment_address}</span>
      )}
      {order.payment_asset === 'customer_chooses' && (
        <span style={{ fontSize: 11, color: 'var(--pt-fg-4)' }}>All configured methods offered</span>
      )}
    </div>
    {showConfirmDialog && (
      <div className="pt-od-confirm-dialog">
        {order.payment_asset === 'customer_chooses' && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: 'var(--pt-fg-3)', display: 'block', marginBottom: 4 }}>
              Which method did they use?
            </label>
            <select className="pt-input" style={{ fontSize: 12 }} value={confirmAsset} onChange={e => setConfirmAsset(e.target.value)}>
              <option value="">Select…</option>
              {paymentConfigs.filter(c => c.type !== 'cash' && c.type !== 'customer_chooses').map(c => (
                <option key={c.type} value={c.type}>{PAYMENT_LABELS[c.type] ?? c.type}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--pt-fg-3)', display: 'block', marginBottom: 4 }}>
            Transaction ID (optional — paste from your wallet or block explorer)
          </label>
          <input
            className="pt-input mono"
            style={{ fontSize: 11 }}
            placeholder="Leave blank if unavailable"
            value={txHash}
            onChange={e => setTxHash(e.target.value)}
          />
        </div>
        {confirmError && <p style={{ fontSize: 11, color: 'var(--pt-danger)', marginBottom: 8 }}>{confirmError}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={handleConfirm} disabled={pending}>
            Confirm payment received
          </button>
          <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => { setShowConfirmDialog(false); setConfirmError('') }}>
            Cancel
          </button>
        </div>
      </div>
    )}
  </div>
)}
{status !== 'awaiting' && order.tx_hash && (
  <div className="pt-od-payment-panel">
    <div className="pt-od-payment-hd"><span>Payment confirmed</span></div>
    <div className="pt-od-payment-body">
      <span className="pt-od-payment-asset">{PAYMENT_LABELS[order.payment_asset] ?? order.payment_asset}</span>
      <span className="pt-od-payment-addr mono" title={order.tx_hash}>{order.tx_hash.slice(0, 24)}…</span>
      <button className="pt-btn pt-btn-ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => navigator.clipboard?.writeText(order.tx_hash!)}>Copy TX</button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Add payment panel CSS to `styles/orders.css`** (append at end)

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

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/orders/[orderId]/page.tsx src/components/orders/OrderDetailView.tsx styles/orders.css
git commit -m "feat: order detail payment panel with send/copy/confirm actions"
```

---

### Task 9: Inbox Composer Prefill

**Files:**
- Modify: `src/app/inbox/page.tsx`
- Modify: `src/components/inbox/InboxView.tsx`

- [ ] **Step 1: Update `src/app/inbox/page.tsx`**

Change `searchParams` type to add `prefill`:
```typescript
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ conversation?: string; invoice_path?: string; invoice_name?: string; prefill?: string }> }) {
```

Destructure it:
```typescript
const { conversation: initialConversationId, invoice_path: initialInvoicePath, invoice_name: initialInvoiceName, prefill: initialPrefill } = await searchParams
```

Pass to `InboxView`:
```tsx
<InboxView
  ...
  initialPrefill={initialPrefill}
/>
```

- [ ] **Step 2: Update `InboxView.tsx` — add `initialPrefill` through to Composer**

Update `InboxViewProps` interface (around line 762):
```typescript
interface InboxViewProps {
  initialConversations: DbConversation[]
  quickReplies: DbQuickReply[]
  templates: DbTemplate[]
  initialResolvedCount?: number
  initialActiveId?: string
  initialInvoicePath?: string
  initialInvoiceName?: string
  initialPrefill?: string
}
```

Update `InboxView` function signature:
```typescript
export function InboxView({ initialConversations, quickReplies, templates, initialResolvedCount = 0, initialActiveId, initialInvoicePath, initialInvoiceName, initialPrefill }: InboxViewProps) {
```

Pass `initialPrefill` to `InboxLayout`. Change the `InboxLayout` render call inside `InboxView`:
```tsx
<InboxLayout initialPrefill={initialPrefill} />
```

Update `InboxLayout` function signature (it currently takes no args):
```typescript
function InboxLayout({ initialPrefill }: { initialPrefill?: string }) {
```

In `InboxLayout`, pass `initialPrefill` to `ConversationPane`:
```tsx
<ConversationPane
  thread={activeThread}
  messages={messages}
  onSend={sendMessage}
  isSending={isSending}
  onCreateOrder={...}
  initialPrefill={initialPrefill}
/>
```

Update `ConversationPane` props interface:
```typescript
function ConversationPane({ thread, messages, onSend, isSending, onCreateOrder, initialPrefill }: {
  thread: InboxThread
  messages: InboxMessage[]
  onSend: (text: string) => void
  isSending: boolean
  onCreateOrder: () => void
  initialPrefill?: string
}) {
```

Pass to `Composer`:
```tsx
<Composer
  thread={thread}
  onSend={onSend}
  isSending={isSending}
  initialText={initialPrefill}
  ...
/>
```

Update `Composer` props interface:
```typescript
function Composer({ thread, onSend, isSending, initialText, ... }: {
  thread: InboxThread
  onSend: (text: string) => void
  isSending: boolean
  initialText?: string
  ...
}) {
```

Inside `Composer`, set initial text from prop and clear URL param on mount. Add a `useEffect` at the top of `Composer`:
```typescript
const [text, setText] = useState(initialText ?? '')

useEffect(() => {
  if (initialText) {
    setText(initialText)
    // Remove prefill from URL to prevent re-populating on refresh
    const url = new URL(window.location.href)
    url.searchParams.delete('prefill')
    window.history.replaceState({}, '', url.toString())
  }
}, []) // intentionally empty — only runs on mount
```

(Replace the existing `const [text, setText] = useState('')` with the initialText version above.)

- [ ] **Step 3: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/inbox/page.tsx src/components/inbox/InboxView.tsx
git commit -m "feat: inbox composer accepts prefill URL param for payment details flow"
```

---

### Task 10: Invoice Payment Instructions

**Files:**
- Modify: `src/types/invoices.ts`
- Modify: `src/components/invoices/InvoicePDF.tsx`
- Modify: `src/app/api/invoices/generate/route.ts`

- [ ] **Step 1: Update `src/types/invoices.ts`**

Add `InvoicePaymentMethod` and update `InvoiceData` and `buildInvoiceData`:

```typescript
import type { TenantPaymentConfig } from './payments'
import { PAYMENT_LABELS } from './payments'

export interface InvoiceItem {
  name: string
  sku: string
  qty: number
  unitPrice: number
  subtotal: number
}

export interface InvoicePaymentMethod {
  label: string
  address?: string
  bankName?: string
  accountName?: string
  accountNumber?: string
  sortCode?: string
  iban?: string
  reference?: string
}

export interface InvoiceData {
  invoiceNumber: string
  orderRef: string
  issuedAt: string
  businessName: string
  logoUrl: string | null
  customerName: string
  items: InvoiceItem[]
  total: number
  paymentMethods: InvoicePaymentMethod[]
}

export function formatInvoiceNumber(orderRef: string): string {
  return `INV-${orderRef}`
}

export function buildInvoiceData(
  order: {
    ref_number: string
    payment_asset: string
    payment_amount: number
    payment_address: string | null
    created_at: string
    customers: { display_name: string } | null
    order_items: { qty: number; unit_price_snapshot: number; products?: { name: string; sku: string } | null }[]
  },
  businessName: string,
  logoUrl: string | null,
  configs: TenantPaymentConfig[] = [],
): InvoiceData {
  const items: InvoiceItem[] = order.order_items.map(it => ({
    name: it.products?.name ?? 'Product',
    sku:  it.products?.sku  ?? '—',
    qty: it.qty,
    unitPrice: it.unit_price_snapshot,
    subtotal: it.qty * it.unit_price_snapshot,
  }))

  const paymentMethods = buildInvoicePaymentMethods(order, configs)

  return {
    invoiceNumber: formatInvoiceNumber(order.ref_number),
    orderRef: order.ref_number,
    issuedAt: new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    businessName,
    logoUrl,
    customerName: order.customers?.display_name ?? 'Customer',
    items,
    total: items.reduce((s, it) => s + it.subtotal, 0),
    paymentMethods,
  }
}

function buildInvoicePaymentMethods(
  order: { payment_asset: string; payment_address: string | null; ref_number: string },
  configs: TenantPaymentConfig[],
): InvoicePaymentMethod[] {
  if (order.payment_asset === 'cash') return []

  if (order.payment_asset === 'customer_chooses') {
    return configs
      .filter(c => c.is_active && c.type !== 'cash')
      .map(c => configToInvoiceMethod(c, order.ref_number))
  }

  if (order.payment_asset === 'bank_transfer') {
    const cfg = configs.find(c => c.type === 'bank_transfer')
    if (!cfg) return [{ label: 'Bank Transfer', reference: order.ref_number }]
    return [configToInvoiceMethod(cfg, order.ref_number)]
  }

  return [{
    label: PAYMENT_LABELS[order.payment_asset] ?? order.payment_asset,
    address: order.payment_address ?? undefined,
  }]
}

function configToInvoiceMethod(c: TenantPaymentConfig, refNumber: string): InvoicePaymentMethod {
  if (c.type === 'bank_transfer') {
    return {
      label: 'Bank Transfer',
      bankName: c.bank_name ?? undefined,
      accountName: c.account_name ?? undefined,
      accountNumber: c.account_number ?? undefined,
      sortCode: c.sort_code ?? undefined,
      iban: c.iban ?? undefined,
      reference: refNumber,
    }
  }
  return {
    label: PAYMENT_LABELS[c.type] ?? c.type,
    address: c.wallet_address ?? undefined,
  }
}
```

- [ ] **Step 2: Update `src/components/invoices/InvoicePDF.tsx`** — replace the Payment section

Remove the existing styles `payment`, `payHd`, `payRow`, `payLbl`, `payVal` from `StyleSheet.create` and replace with:

```typescript
payment:   { marginTop: 32, padding: 14, backgroundColor: '#f8f8f8', borderRadius: 4 },
payHd:     { fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, color: '#888', marginBottom: 10 },
payMethod: { marginBottom: 10 },
payLabel:  { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
payRow:    { flexDirection: 'row', gap: 8, marginBottom: 2 },
payKey:    { fontSize: 9, color: '#888', width: 72 },
payVal:    { fontSize: 9, flex: 1 },
```

Replace the `{/* Payment */}` section in the JSX:

```tsx
{/* Payment */}
{data.paymentMethods.length > 0 && (
  <View style={S.payment}>
    <Text style={S.payHd}>
      {data.paymentMethods.length === 1 ? 'Payment details' : 'Payment options'}
    </Text>
    {data.paymentMethods.map((m, i) => (
      <View key={i} style={S.payMethod}>
        <Text style={S.payLabel}>{m.label}</Text>
        {m.address && (
          <View style={S.payRow}>
            <Text style={S.payKey}>Address</Text>
            <Text style={S.payVal}>{m.address}</Text>
          </View>
        )}
        {m.accountName && (
          <View style={S.payRow}>
            <Text style={S.payKey}>Name</Text>
            <Text style={S.payVal}>{m.accountName}</Text>
          </View>
        )}
        {m.accountNumber && (
          <View style={S.payRow}>
            <Text style={S.payKey}>Account</Text>
            <Text style={S.payVal}>{m.accountNumber}</Text>
          </View>
        )}
        {m.sortCode && (
          <View style={S.payRow}>
            <Text style={S.payKey}>Sort code</Text>
            <Text style={S.payVal}>{m.sortCode}</Text>
          </View>
        )}
        {m.iban && (
          <View style={S.payRow}>
            <Text style={S.payKey}>IBAN</Text>
            <Text style={S.payVal}>{m.iban}</Text>
          </View>
        )}
        {m.reference && (
          <View style={S.payRow}>
            <Text style={S.payKey}>Reference</Text>
            <Text style={S.payVal}>{m.reference} (please include)</Text>
          </View>
        )}
      </View>
    ))}
  </View>
)}
```

- [ ] **Step 3: Update `src/app/api/invoices/generate/route.ts`** — fetch configs and pass to buildInvoiceData

Add to the existing parallel queries (after fetching tenant branding, before building invoiceData):

```typescript
const { data: paymentConfigs } = await supabase
  .from('tenant_payment_configs')
  .select('*')
  .eq('is_active', true)
```

Update the `buildInvoiceData` call:
```typescript
const invoiceData = buildInvoiceData(
  order as never,
  tenant?.name ?? 'My Business',
  logoUrl,
  (paymentConfigs ?? []) as TenantPaymentConfig[],
)
```

Add import at top of route file:
```typescript
import type { TenantPaymentConfig } from '@/types/payments'
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/types/invoices.ts src/components/invoices/InvoicePDF.tsx src/app/api/invoices/generate/route.ts
git commit -m "feat: invoice PDF shows full payment instructions per method"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `tenant_payment_configs` table + RLS | Task 1 |
| `/settings/wallets` replaces stub | Task 5 |
| Crypto rows with address + toggle + edit | Task 5 |
| Bank transfer panel with fields | Task 5 |
| Order dropdown shows only configured active methods | Task 6 |
| Auto-populate `payment_address` on coin select | Task 6 |
| "Customer chooses" option when 2+ active methods | Task 6 |
| Helper text when no configs | Task 6 |
| `confirmPayment` action | Task 7 |
| Payment panel on order detail (awaiting state) | Task 8 |
| "Send payment details" → inbox composer prefill | Tasks 8 + 9 |
| "Copy address" button | Task 8 |
| "Mark as received" dialog with method selector + tx hash | Task 8 |
| TX hash display after confirmation | Task 8 |
| Inbox composer reads `prefill` URL param | Task 9 |
| Clears prefill from URL after applying | Task 9 |
| Invoice PDF — single coin payment details | Task 10 |
| Invoice PDF — customer chooses, all methods listed | Task 10 |
| Invoice PDF — bank transfer with reference | Task 10 |
| `buildPaymentMessage` tested | Task 2 |

All spec requirements covered. No placeholders. Type names consistent across tasks (`TenantPaymentConfig`, `buildPaymentMessage`, `confirmPayment`, `InvoicePaymentMethod`, `paymentMethods`).
