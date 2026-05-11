# Product Protocols & Customer Supply Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dosage protocol configuration per catalog product and a live supply tracker per customer, derived entirely from order history + protocols with no manual cycle management.

**Architecture:** Two new DB tables (`product_protocols`, `customer_protocol_overrides`) with server actions for upserts. Supply state is computed in the app layer using a pure `computeSupply()` helper — no stored supply columns. UI surfaces: Protocol section in the catalog product detail panel, enhanced Active Cycles card on the customer detail page, and a coloured supply dot on the customer list.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + RLS), Vitest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260512000001_product_protocols.sql` | Create | Both tables + RLS |
| `src/types/protocols.ts` | Create | All types + `computeSupply()` + `frequencyToDaily()` |
| `src/lib/__tests__/protocols.test.ts` | Create | Unit tests for compute functions |
| `src/app/catalog/actions.ts` | Modify | Append `upsertProtocol()` |
| `src/app/customers/actions.ts` | Create | `upsertProtocolOverride()` |
| `src/app/catalog/page.tsx` | Modify | Fetch protocols, pass to CatalogView |
| `src/components/catalog/CatalogView.tsx` | Modify | Add `ProtocolSection` component + wire props |
| `src/components/customers/ActiveCyclesCard.tsx` | Create | Client component for cycle rows + override form |
| `src/app/customers/[customerId]/page.tsx` | Modify | Compute cycles server-side, replace mock data |
| `src/app/customers/page.tsx` | Modify | Compute per-customer supply status |
| `src/components/customers/CustomersListView.tsx` | Modify | Add supply dot indicator |
| `styles/customer.css` | Modify | New cycle row CSS + supply dot + override form |
| `styles/catalog.css` | Modify | Protocol section styles |

---

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260512000001_product_protocols.sql`

- [ ] **Step 1: Write migration file**

```sql
-- supabase/migrations/20260512000001_product_protocols.sql

CREATE TABLE product_protocols (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  vial_strength       text,
  reconstitution_ml   numeric(6,2) NOT NULL,
  draw_volume_ml      numeric(6,3) NOT NULL,
  frequency           text NOT NULL,
  timing              text,
  cycle_length_weeks  integer,
  storage             text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id)
);

CREATE INDEX product_protocols_tenant_id_idx ON product_protocols (tenant_id);

ALTER TABLE product_protocols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON product_protocols
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE TABLE customer_protocol_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  draw_volume_ml  numeric(6,3),
  frequency       text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, product_id)
);

CREATE INDEX customer_protocol_overrides_tenant_idx   ON customer_protocol_overrides (tenant_id);
CREATE INDEX customer_protocol_overrides_customer_idx ON customer_protocol_overrides (customer_id);

ALTER TABLE customer_protocol_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON customer_protocol_overrides
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push --include-all
```

Expected: `product_protocols` and `customer_protocol_overrides` tables created with RLS.

- [ ] **Step 3: Run tests**

```bash
npm run test:run
```

Expected: all 157 existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512000001_product_protocols.sql
git commit -m "feat: add product_protocols and customer_protocol_overrides tables"
```

---

### Task 2: Types + Supply Calculation Helper

**Files:**
- Create: `src/types/protocols.ts`
- Create: `src/lib/__tests__/protocols.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/protocols.test.ts
import { describe, it, expect } from 'vitest'
import { computeSupply, frequencyToDaily } from '@/types/protocols'
import type { ProductProtocol, CustomerProtocolOverride } from '@/types/protocols'

const baseProtocol: ProductProtocol = {
  id: 'p1', tenant_id: 't1', product_id: 'prod1',
  vial_strength: '5mg',
  reconstitution_ml: 2,
  draw_volume_ml: 0.1,
  frequency: 'once_daily',
  timing: null, cycle_length_weeks: null, storage: null, notes: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

describe('frequencyToDaily', () => {
  it('once_daily = 1',       () => expect(frequencyToDaily('once_daily')).toBe(1))
  it('twice_daily = 2',      () => expect(frequencyToDaily('twice_daily')).toBe(2))
  it('eod = 0.5',            () => expect(frequencyToDaily('eod')).toBe(0.5))
  it('3x_weekly ≈ 3/7',     () => expect(frequencyToDaily('3x_weekly')).toBeCloseTo(3 / 7))
  it('weekly ≈ 1/7',         () => expect(frequencyToDaily('weekly')).toBeCloseTo(1 / 7))
})

describe('computeSupply', () => {
  it('computes 20 day supply for 1 vial at 0.1ml once_daily (2/0.1=20 draws, 20/1=20 days)', () => {
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 1, orderDate: daysAgo(0), protocol: baseProtocol,
    })
    expect(cycle.totalDays).toBeCloseTo(20)
  })

  it('computes correct daysRemaining when ordered 5 days ago', () => {
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 1, orderDate: daysAgo(5), protocol: baseProtocol,
    })
    expect(cycle.daysRemaining).toBeCloseTo(15)
    expect(cycle.status).toBe('ok')
  })

  it('status is low when daysRemaining ≤ 10', () => {
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 1, orderDate: daysAgo(12), protocol: baseProtocol,
    })
    expect(cycle.daysRemaining).toBeCloseTo(8)
    expect(cycle.status).toBe('low')
  })

  it('status is low when pctRemaining ≤ 0.25 (31 of 40 days elapsed)', () => {
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 2, orderDate: daysAgo(31), protocol: baseProtocol,
    })
    expect(cycle.pctRemaining).toBeCloseTo(9 / 40)
    expect(cycle.status).toBe('low')
  })

  it('status is critical when supply elapsed', () => {
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 1, orderDate: daysAgo(25), protocol: baseProtocol,
    })
    expect(cycle.daysRemaining).toBeLessThan(0)
    expect(cycle.status).toBe('critical')
    expect(cycle.pctRemaining).toBe(0)
  })

  it('applies draw_volume_ml override (0.2ml → 10 draws → 10 days)', () => {
    const override: CustomerProtocolOverride = {
      id: 'o1', tenant_id: 't1', customer_id: 'c1', product_id: 'prod1',
      draw_volume_ml: 0.2, frequency: null, notes: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 1, orderDate: daysAgo(0), protocol: baseProtocol, override,
    })
    expect(cycle.totalDays).toBeCloseTo(10)
    expect(cycle.hasOverride).toBe(true)
    expect(cycle.effectiveDrawMl).toBe(0.2)
  })

  it('applies frequency override (twice_daily → 20 draws / 2 = 10 days)', () => {
    const override: CustomerProtocolOverride = {
      id: 'o1', tenant_id: 't1', customer_id: 'c1', product_id: 'prod1',
      draw_volume_ml: null, frequency: 'twice_daily', notes: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    const cycle = computeSupply({
      productId: 'prod1', productName: 'BPC-157 5mg',
      unitsOrdered: 1, orderDate: daysAgo(0), protocol: baseProtocol, override,
    })
    expect(cycle.totalDays).toBeCloseTo(10)
    expect(cycle.hasOverride).toBe(true)
    expect(cycle.effectiveFrequency).toBe('twice_daily')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:run -- src/lib/__tests__/protocols.test.ts
```

Expected: FAIL — `computeSupply` not found.

- [ ] **Step 3: Write `src/types/protocols.ts`**

```typescript
// src/types/protocols.ts

export type Frequency = 'once_daily' | 'twice_daily' | 'eod' | '3x_weekly' | 'weekly'

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  once_daily:  'Once daily',
  twice_daily: 'Twice daily',
  eod:         'Every other day',
  '3x_weekly': '3× weekly',
  weekly:      'Weekly',
}

export const FREQUENCY_OPTIONS: Frequency[] = ['once_daily', 'twice_daily', 'eod', '3x_weekly', 'weekly']

export interface ProductProtocol {
  id: string
  tenant_id: string
  product_id: string
  vial_strength: string | null
  reconstitution_ml: number
  draw_volume_ml: number
  frequency: Frequency
  timing: string | null
  cycle_length_weeks: number | null
  storage: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CustomerProtocolOverride {
  id: string
  tenant_id: string
  customer_id: string
  product_id: string
  draw_volume_ml: number | null
  frequency: Frequency | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type SupplyStatus = 'ok' | 'low' | 'critical'

export interface ActiveCycle {
  productId: string
  productName: string
  unitsOrdered: number
  orderDate: string
  totalDays: number
  daysRemaining: number
  pctRemaining: number
  status: SupplyStatus
  effectiveDrawMl: number
  effectiveFrequency: Frequency
  hasOverride: boolean
  reconstitutionMl: number
  cycleLengthWeeks: number | null
  estimatedEndDate: string
}

export interface OrderedProductNoProtocol {
  productId: string
  productName: string
}

export type CycleEntry = ActiveCycle | OrderedProductNoProtocol

export function isCycle(e: CycleEntry): e is ActiveCycle {
  return 'totalDays' in e
}

export function frequencyToDaily(freq: Frequency): number {
  switch (freq) {
    case 'once_daily':  return 1
    case 'twice_daily': return 2
    case 'eod':         return 0.5
    case '3x_weekly':   return 3 / 7
    case 'weekly':      return 1 / 7
  }
}

export function computeSupply(params: {
  productId: string
  productName: string
  unitsOrdered: number
  orderDate: string
  protocol: ProductProtocol
  override?: CustomerProtocolOverride | null
  today?: Date
}): ActiveCycle {
  const today = params.today ?? new Date()
  const effectiveDrawMl = params.override?.draw_volume_ml ?? params.protocol.draw_volume_ml
  const effectiveFrequency = (params.override?.frequency ?? params.protocol.frequency) as Frequency

  const drawsPerVial = params.protocol.reconstitution_ml / effectiveDrawMl
  const injectionsPerDay = frequencyToDaily(effectiveFrequency)
  const daysPerVial = drawsPerVial / injectionsPerDay
  const totalDays = params.unitsOrdered * daysPerVial

  const daysElapsed = (today.getTime() - new Date(params.orderDate).getTime()) / 86_400_000
  const daysRemaining = totalDays - daysElapsed
  const pctRemaining = Math.max(0, Math.min(1, daysRemaining / totalDays))

  const status: SupplyStatus =
    daysRemaining <= 0         ? 'critical'
    : (pctRemaining <= 0.25 || daysRemaining <= 10) ? 'low'
    : 'ok'

  const estimatedEndDate = new Date(
    new Date(params.orderDate).getTime() + totalDays * 86_400_000
  ).toISOString()

  return {
    productId: params.productId,
    productName: params.productName,
    unitsOrdered: params.unitsOrdered,
    orderDate: params.orderDate,
    totalDays,
    daysRemaining,
    pctRemaining,
    status,
    effectiveDrawMl,
    effectiveFrequency,
    hasOverride: !!(params.override?.draw_volume_ml || params.override?.frequency),
    reconstitutionMl: params.protocol.reconstitution_ml,
    cycleLengthWeeks: params.protocol.cycle_length_weeks ?? null,
    estimatedEndDate,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- src/lib/__tests__/protocols.test.ts
```

Expected: 12 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/types/protocols.ts src/lib/__tests__/protocols.test.ts
git commit -m "feat: protocol types, frequencyToDaily, and computeSupply helper"
```

---

### Task 3: Server Actions

**Files:**
- Modify: `src/app/catalog/actions.ts` (append)
- Create: `src/app/customers/actions.ts`

- [ ] **Step 1: Append `upsertProtocol` to `src/app/catalog/actions.ts`**

Add after the last export in the file:

```typescript
export async function upsertProtocol(data: {
  productId: string
  vialStrength?: string
  reconstitutionMl: number
  drawVolumeMl: number
  frequency: string
  timing?: string
  cycleLengthWeeks?: number | null
  storage?: string
  notes?: string
}): Promise<{ success: true } | { error: string }> {
  if (data.reconstitutionMl <= 0) return { error: 'Reconstitution volume must be greater than 0' }
  if (data.drawVolumeMl <= 0) return { error: 'Draw volume must be greater than 0' }
  if (data.drawVolumeMl > data.reconstitutionMl) return { error: 'Draw volume cannot exceed reconstitution volume' }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('product_protocols').upsert({
      tenant_id: tenantId,
      product_id: data.productId,
      vial_strength: data.vialStrength?.trim() || null,
      reconstitution_ml: data.reconstitutionMl,
      draw_volume_ml: data.drawVolumeMl,
      frequency: data.frequency,
      timing: data.timing?.trim() || null,
      cycle_length_weeks: data.cycleLengthWeeks ?? null,
      storage: data.storage?.trim() || null,
      notes: data.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,product_id' })
    if (error) return { error: error.message }
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: Create `src/app/customers/actions.ts`**

```typescript
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

export async function upsertProtocolOverride(data: {
  customerId: string
  productId: string
  drawVolumeMl: number | null
  frequency: string | null
  notes: string | null
}): Promise<{ success: true } | { error: string }> {
  if (data.drawVolumeMl != null && data.drawVolumeMl <= 0) {
    return { error: 'Draw volume must be greater than 0' }
  }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('customer_protocol_overrides').upsert({
      tenant_id: tenantId,
      customer_id: data.customerId,
      product_id: data.productId,
      draw_volume_ml: data.drawVolumeMl,
      frequency: data.frequency,
      notes: data.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,customer_id,product_id' })
    if (error) return { error: error.message }
    revalidatePath(`/customers/${data.customerId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/catalog/actions.ts src/app/customers/actions.ts
git commit -m "feat: upsertProtocol and upsertProtocolOverride server actions"
```

---

### Task 4: Catalog Protocol Section

**Files:**
- Modify: `src/app/catalog/page.tsx`
- Modify: `src/components/catalog/CatalogView.tsx`
- Modify: `styles/catalog.css`

- [ ] **Step 1: Update `src/app/catalog/page.tsx`** to fetch protocols

Replace the existing file with:

```typescript
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CatalogView } from '@/components/catalog/CatalogView'
import { dbProductToDisplay } from '@/types/catalog'
import type { DbProduct, DbBatch } from '@/types/catalog'
import type { ProductProtocol } from '@/types/protocols'

export default async function CatalogPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: products }, { data: batches }, { data: protocols }] = await Promise.all([
    supabase.from('products').select('*').eq('is_active', true).order('product_family').order('name'),
    supabase.from('batches').select('*').order('created_at', { ascending: false }),
    supabase.from('product_protocols').select('*'),
  ])

  const batchesByProduct = ((batches ?? []) as DbBatch[]).reduce<Record<string, DbBatch[]>>((acc, b) => {
    if (!acc[b.product_id]) acc[b.product_id] = []
    acc[b.product_id].push(b)
    return acc
  }, {})

  const catalogProducts = ((products ?? []) as DbProduct[]).map(p =>
    dbProductToDisplay(p, batchesByProduct[p.id] ?? [])
  )

  return (
    <Shell section="Catalog">
      <CatalogView products={catalogProducts} protocols={(protocols ?? []) as ProductProtocol[]} />
    </Shell>
  )
}
```

- [ ] **Step 2: Add `ProtocolSection` component to `CatalogView.tsx`**

Add this import at the top of `src/components/catalog/CatalogView.tsx` (after existing imports):

```typescript
import { upsertProtocol } from '@/app/catalog/actions'
import { FREQUENCY_LABELS, FREQUENCY_OPTIONS } from '@/types/protocols'
import type { ProductProtocol, Frequency } from '@/types/protocols'
```

Add the `ProtocolSection` component before the `// ── Main catalog view` comment:

```typescript
// ── Protocol section ─────────────────────────────────────────────────────────
function ProtocolSection({ productId, protocol }: { productId: string; protocol: ProductProtocol | null }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    vialStrength: protocol?.vial_strength ?? '',
    reconstitutionMl: protocol?.reconstitution_ml?.toString() ?? '',
    drawVolumeMl: protocol?.draw_volume_ml?.toString() ?? '',
    frequency: (protocol?.frequency ?? 'once_daily') as Frequency,
    timing: protocol?.timing ?? '',
    cycleLengthWeeks: protocol?.cycle_length_weeks?.toString() ?? '',
    storage: protocol?.storage ?? '',
    notes: protocol?.notes ?? '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const recon = parseFloat(form.reconstitutionMl)
  const draw = parseFloat(form.drawVolumeMl)
  const dosesPerVial = !isNaN(recon) && !isNaN(draw) && draw > 0 ? Math.round(recon / draw) : null

  const startEdit = () => {
    setForm({
      vialStrength: protocol?.vial_strength ?? '',
      reconstitutionMl: protocol?.reconstitution_ml?.toString() ?? '',
      drawVolumeMl: protocol?.draw_volume_ml?.toString() ?? '',
      frequency: (protocol?.frequency ?? 'once_daily') as Frequency,
      timing: protocol?.timing ?? '',
      cycleLengthWeeks: protocol?.cycle_length_weeks?.toString() ?? '',
      storage: protocol?.storage ?? '',
      notes: protocol?.notes ?? '',
    })
    setError('')
    setEditing(true)
  }

  const save = () => {
    setError('')
    const reconstitutionMl = parseFloat(form.reconstitutionMl)
    const drawVolumeMl = parseFloat(form.drawVolumeMl)
    if (isNaN(reconstitutionMl) || reconstitutionMl <= 0) { setError('Reconstitution volume is required'); return }
    if (isNaN(drawVolumeMl) || drawVolumeMl <= 0) { setError('Draw volume is required'); return }
    startTransition(async () => {
      const result = await upsertProtocol({
        productId,
        vialStrength: form.vialStrength || undefined,
        reconstitutionMl,
        drawVolumeMl,
        frequency: form.frequency,
        timing: form.timing || undefined,
        cycleLengthWeeks: form.cycleLengthWeeks ? parseInt(form.cycleLengthWeeks) : null,
        storage: form.storage || undefined,
        notes: form.notes || undefined,
      })
      if ('error' in result) { setError(result.error); return }
      setEditing(false)
    })
  }

  return (
    <section className="pt-card pt-cat-section">
      <header className="pt-card-hd">
        <div>
          <h3>Protocol</h3>
          <p>Dosage &amp; usage instructions</p>
        </div>
        {!editing && (
          <button className="pt-link" onClick={startEdit}>
            {protocol ? 'Edit' : '+ Add protocol'}
          </button>
        )}
      </header>
      <div className="pt-card-body" style={{ padding: editing ? '12px 14px' : 0 }}>
        {!protocol && !editing && (
          <div className="pt-cat-empty">
            <span>No protocol configured. Add one to enable supply tracking.</span>
          </div>
        )}
        {protocol && !editing && (
          <dl className="pt-cat-proto-dl">
            {protocol.vial_strength && <><dt>Vial strength</dt><dd className="mono">{protocol.vial_strength}</dd></>}
            <dt>Reconstitution</dt><dd className="mono">{protocol.reconstitution_ml} mL</dd>
            <dt>Draw volume</dt>
            <dd className="mono">
              {protocol.draw_volume_ml} mL
              <span className="pt-cat-proto-derived"> → {Math.round(protocol.reconstitution_ml / protocol.draw_volume_ml)} doses/vial</span>
            </dd>
            <dt>Frequency</dt><dd>{FREQUENCY_LABELS[protocol.frequency as Frequency] ?? protocol.frequency}</dd>
            {protocol.timing && <><dt>Timing</dt><dd style={{ color: 'var(--pt-fg-3)' }}>{protocol.timing}</dd></>}
            {protocol.cycle_length_weeks && <><dt>Cycle</dt><dd style={{ color: 'var(--pt-fg-3)' }}>{protocol.cycle_length_weeks} weeks</dd></>}
            {protocol.storage && <><dt>Storage</dt><dd style={{ color: 'var(--pt-fg-3)' }}>{protocol.storage}</dd></>}
            {protocol.notes && <><dt>Notes</dt><dd style={{ color: 'var(--pt-fg-3)' }}>{protocol.notes}</dd></>}
          </dl>
        )}
        {editing && (
          <div className="pt-cat-proto-form">
            <div className="pt-cat-proto-grid">
              <div>
                <label className="pt-sku-lbl">Vial strength</label>
                <input className="pt-input" placeholder="e.g. 5mg" value={form.vialStrength} onChange={set('vialStrength')} />
              </div>
              <div>
                <label className="pt-sku-lbl">Frequency <span style={{ color: 'var(--pt-danger)' }}>*</span></label>
                <select className="pt-input" value={form.frequency} onChange={set('frequency')}>
                  {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                </select>
              </div>
              <div>
                <label className="pt-sku-lbl">Reconstitution volume (mL) <span style={{ color: 'var(--pt-danger)' }}>*</span></label>
                <input className="pt-input" type="number" step="0.1" min="0" placeholder="e.g. 2.0" value={form.reconstitutionMl} onChange={set('reconstitutionMl')} />
              </div>
              <div>
                <label className="pt-sku-lbl">Draw volume per injection (mL) <span style={{ color: 'var(--pt-danger)' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <input className="pt-input" type="number" step="0.01" min="0" placeholder="e.g. 0.1" value={form.drawVolumeMl} onChange={set('drawVolumeMl')} />
                  {dosesPerVial !== null && (
                    <span className="pt-cat-proto-derived" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      → {dosesPerVial} doses/vial
                    </span>
                  )}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="pt-sku-lbl">Timing</label>
                <input className="pt-input" placeholder="e.g. nightly, empty stomach" value={form.timing} onChange={set('timing')} />
              </div>
              <div>
                <label className="pt-sku-lbl">Cycle length (weeks)</label>
                <input className="pt-input" type="number" min="1" placeholder="e.g. 12" value={form.cycleLengthWeeks} onChange={set('cycleLengthWeeks')} />
              </div>
              <div>
                <label className="pt-sku-lbl">Storage</label>
                <input className="pt-input" placeholder="e.g. refrigerate after reconstituting" value={form.storage} onChange={set('storage')} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="pt-sku-lbl">Usage notes</label>
                <textarea className="pt-input" rows={2} placeholder="Needle type, preloading tips, etc." value={form.notes} onChange={set('notes')} style={{ resize: 'vertical' }} />
              </div>
            </div>
            {error && <div className="pt-cat-form-err" style={{ marginTop: 8 }}>{error}</div>}
            <div className="pt-cat-form-actions">
              <button className="pt-btn pt-btn-ghost" onClick={() => setEditing(false)} disabled={pending}>Cancel</button>
              <button className="pt-btn pt-btn-primary" onClick={save} disabled={pending}>
                {pending ? 'Saving…' : 'Save protocol'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Wire `protocols` prop through `CatalogView` and `CatalogDetail`**

Update `CatalogView`'s function signature (the `export function CatalogView` line):

```typescript
export function CatalogView({ products, protocols }: { products: CatalogProduct[]; protocols: ProductProtocol[] }) {
```

Inside `CatalogView`, build a lookup map right after the `useState` declarations:

```typescript
const protocolByProduct = Object.fromEntries(protocols.map(p => [p.product_id, p]))
```

Update the `CatalogDetail` render inside `CatalogView` to pass the protocol. Find the line that renders `<CatalogDetail` and change it to:

```typescript
<CatalogDetail product={selected} products={products} protocol={protocolByProduct[selected.id] ?? null} />
```

Update `CatalogDetail`'s signature to accept protocol:

```typescript
function CatalogDetail({ product, products, protocol }: {
  product: CatalogProduct
  products: CatalogProduct[]
  protocol: ProductProtocol | null
}) {
```

Add `<ProtocolSection>` inside `CatalogDetail`, after the "Often paired with" section (before the closing `</aside>`):

```typescript
      <ProtocolSection productId={product.id} protocol={protocol} />
```

- [ ] **Step 4: Add catalog protocol CSS to `styles/catalog.css`** (append at end)

```css
/* ─── Protocol section ───────────────────────────────────────────────────── */
.pt-cat-proto-dl {
  display: grid; grid-template-columns: 110px 1fr;
  gap: 4px 12px; margin: 0; padding: 12px 14px;
  font-size: 12px;
}
.pt-cat-proto-dl dt { color: var(--pt-fg-4); text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; padding-top: 3px; }
.pt-cat-proto-dl dd { margin: 0; padding-bottom: 6px; border-bottom: 0.5px solid var(--pt-line-soft); }
.pt-cat-proto-dl dd:last-of-type { border-bottom: 0; padding-bottom: 0; }
.pt-cat-proto-derived { font-size: 10.5px; color: var(--pt-fg-4); font-family: inherit; margin-left: 6px; }
.pt-cat-proto-form { display: flex; flex-direction: column; gap: 12px; }
.pt-cat-proto-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/catalog/page.tsx src/components/catalog/CatalogView.tsx styles/catalog.css
git commit -m "feat: protocol section in catalog product detail panel"
```

---

### Task 5: Customer Detail — Active Cycles

**Files:**
- Create: `src/components/customers/ActiveCyclesCard.tsx`
- Modify: `src/app/customers/[customerId]/page.tsx`
- Modify: `styles/customer.css`

- [ ] **Step 1: Create `src/components/customers/ActiveCyclesCard.tsx`**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { upsertProtocolOverride } from '@/app/customers/actions'
import { isCycle, FREQUENCY_LABELS, FREQUENCY_OPTIONS } from '@/types/protocols'
import type { CycleEntry, ActiveCycle, Frequency } from '@/types/protocols'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function DaysLabel({ cycle }: { cycle: ActiveCycle }) {
  if (cycle.status === 'critical') {
    return <span className="pt-cu-supply-days is-critical">Supply elapsed</span>
  }
  return (
    <span className={`pt-cu-supply-days is-${cycle.status}`}>
      {Math.max(0, Math.round(cycle.daysRemaining))} days left
    </span>
  )
}

function CycleRow({ cycle, customerId }: { cycle: ActiveCycle; customerId: string }) {
  const router = useRouter()
  const [showOverride, setShowOverride] = useState(false)
  const [drawMl, setDrawMl] = useState(cycle.effectiveDrawMl.toString())
  const [freq, setFreq] = useState<Frequency>(cycle.effectiveFrequency)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const pct = Math.max(0, Math.min(100, cycle.pctRemaining * 100))

  const saveOverride = () => {
    setError('')
    const drawVolumeMl = parseFloat(drawMl)
    if (isNaN(drawVolumeMl) || drawVolumeMl <= 0) { setError('Draw volume must be greater than 0'); return }
    startTransition(async () => {
      const result = await upsertProtocolOverride({
        customerId,
        productId: cycle.productId,
        drawVolumeMl,
        frequency: freq,
        notes: notes || null,
      })
      if ('error' in result) { setError(result.error); return }
      setShowOverride(false)
      router.refresh()
    })
  }

  return (
    <li className="pt-cu-cycle-row">
      <div className="pt-cu-cycle-top">
        <span className="pt-cu-cycle-name">{cycle.productName}</span>
        <span className="pt-cu-cycle-badge">
          {cycle.effectiveDrawMl}ml · {FREQUENCY_LABELS[cycle.effectiveFrequency]}
          {cycle.hasOverride && <span className="pt-cu-cycle-custom"> ★ custom</span>}
        </span>
        <DaysLabel cycle={cycle} />
        <button
          className="pt-cu-cycle-edit"
          title="Customise dose for this customer"
          onClick={() => setShowOverride(v => !v)}
        >
          ✎
        </button>
      </div>
      <div className="pt-cu-cycle-bar">
        <div className={`pt-cu-cycle-fill is-${cycle.status}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="pt-cu-cycle-meta">
        <span>Ordered {fmtDate(cycle.orderDate)} · {cycle.unitsOrdered} vial{cycle.unitsOrdered !== 1 ? 's' : ''} · {Math.round(cycle.totalDays)} day supply</span>
        {cycle.status === 'low' && <span className="pt-cu-cycle-warn">⚠ Running low · reorder soon</span>}
        {cycle.status === 'critical' && <span className="pt-cu-cycle-warn is-critical">● Likely needs reorder</span>}
        {cycle.status === 'ok' && <span style={{ color: 'var(--pt-fg-4)' }}>Est. end {fmtDate(cycle.estimatedEndDate)}</span>}
      </div>
      {showOverride && (
        <div className="pt-cu-cycle-override">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 3 }}>Draw volume (mL)</div>
              <input className="pt-input mono" style={{ fontSize: 12 }} value={drawMl} onChange={e => setDrawMl(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 3 }}>Frequency</div>
              <select className="pt-input" style={{ fontSize: 12 }} value={freq} onChange={e => setFreq(e.target.value as Frequency)}>
                {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, color: 'var(--pt-fg-3)', marginBottom: 3 }}>Notes (optional)</div>
              <input className="pt-input" style={{ fontSize: 12 }} placeholder="e.g. uses 0.2ml, high bodyweight" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          {error && <div style={{ fontSize: 11, color: 'var(--pt-danger)', marginTop: 6 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={saveOverride} disabled={pending}>
              {pending ? 'Saving…' : 'Save override'}
            </button>
            <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowOverride(false)}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  )
}

export function ActiveCyclesCard({ cycles, customerId }: { cycles: CycleEntry[]; customerId: string }) {
  if (cycles.length === 0) {
    return (
      <section className="pt-card">
        <header className="pt-card-hd">
          <div><h3>Active cycles</h3><p>Derived from order history + configured protocols</p></div>
        </header>
        <div className="pt-card-body">
          <div style={{ fontSize: 12, color: 'var(--pt-fg-4)' }}>No orders yet</div>
        </div>
      </section>
    )
  }

  return (
    <section className="pt-card">
      <header className="pt-card-hd">
        <div><h3>Active cycles</h3><p>Derived from order history + configured protocols</p></div>
      </header>
      <div className="pt-card-body" style={{ padding: 0 }}>
        <ul className="pt-cu-cycles-list">
          {cycles.map(entry =>
            isCycle(entry)
              ? <CycleRow key={entry.productId} cycle={entry} customerId={customerId} />
              : (
                <li key={entry.productId} className="pt-cu-cycle-row pt-cu-cycle-no-protocol">
                  <span className="pt-cu-cycle-name" style={{ color: 'var(--pt-fg-3)' }}>{entry.productName}</span>
                  <span style={{ fontSize: 11, color: 'var(--pt-fg-4)' }}>No protocol configured</span>
                  <Link href="/catalog" className="pt-link" style={{ fontSize: 11 }}>Set up in Catalog →</Link>
                </li>
              )
          )}
        </ul>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Update `src/app/customers/[customerId]/page.tsx`** — compute supply server-side and pass to `ActiveCyclesCard`

Add these imports at the top (after existing imports):

```typescript
import { ActiveCyclesCard } from '@/components/customers/ActiveCyclesCard'
import { computeSupply, isCycle } from '@/types/protocols'
import type { ProductProtocol, CustomerProtocolOverride, CycleEntry } from '@/types/protocols'
```

Inside the `CustomerPage` function, after the existing `Promise.all` that fetches customer/notes/orders, add a second fetch block to compute cycles. Insert this after `const realOrders = orders ?? []`:

```typescript
  // ── Compute active cycles from order history + protocols ──────────────────
  // Deduplicate: find the most recent order_item per product
  type LatestItem = { productId: string; qty: number; orderDate: string }
  const seenProducts = new Set<string>()
  const latestItems: LatestItem[] = []
  for (const order of realOrders) {
    const items = order.order_items as { qty: number; products: { name: string } | null; product_id?: string }[]
    for (const item of items ?? []) {
      // order_items don't include product_id directly in the select above — add it below
    }
  }
```

Wait — the existing orders query doesn't select `product_id` on `order_items`. Update the orders query to include it. Find the `supabase.from('orders')` query in the Promise.all and change the select to:

```typescript
    supabase
      .from('orders')
      .select('id, ref_number, status, payment_asset, payment_amount, created_at, order_items(product_id, qty, unit_price_snapshot, products(name))')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false }),
```

Then after `const realOrders = orders ?? []`, add the full supply computation block:

```typescript
  // ── Compute active cycles ─────────────────────────────────────────────────
  type LatestItem = { productId: string; productName: string; qty: number; orderDate: string }
  const seenProducts = new Set<string>()
  const latestItems: LatestItem[] = []

  for (const order of realOrders) {
    const items = order.order_items as { product_id: string; qty: number; products: { name: string } | null }[]
    for (const item of items ?? []) {
      if (!item.product_id || seenProducts.has(item.product_id)) continue
      seenProducts.add(item.product_id)
      latestItems.push({
        productId: item.product_id,
        productName: item.products?.name ?? '—',
        qty: item.qty,
        orderDate: order.created_at,
      })
    }
  }

  const productIds = latestItems.map(i => i.productId)
  const cycles: CycleEntry[] = []

  if (productIds.length > 0) {
    const [{ data: protocols }, { data: overrides }] = await Promise.all([
      supabase.from('product_protocols').select('*').in('product_id', productIds),
      supabase.from('customer_protocol_overrides').select('*').eq('customer_id', customerId).in('product_id', productIds),
    ])

    const protocolMap = Object.fromEntries(((protocols ?? []) as ProductProtocol[]).map(p => [p.product_id, p]))
    const overrideMap = Object.fromEntries(((overrides ?? []) as CustomerProtocolOverride[]).map(o => [o.product_id, o]))

    for (const item of latestItems) {
      const protocol = protocolMap[item.productId]
      if (!protocol) {
        cycles.push({ productId: item.productId, productName: item.productName })
        continue
      }
      cycles.push(computeSupply({
        productId: item.productId,
        productName: item.productName,
        unitsOrdered: item.qty,
        orderDate: item.orderDate,
        protocol,
        override: overrideMap[item.productId] ?? null,
      }))
    }
  }
```

Replace the existing `{/* Active cycles */}` section (the one using `MOCK_CYCLES`) with:

```tsx
              <ActiveCyclesCard cycles={cycles} customerId={customer.id} />
```

Remove the `MOCK_CYCLES` constant at the top of the file.

- [ ] **Step 3: Replace cycle CSS in `styles/customer.css`**

Find the `/* Cycles */` block (lines 64–85) and replace it entirely with:

```css
/* Cycles */
.pt-cu-cycles-list { list-style: none; margin: 0; padding: 0; }
.pt-cu-cycle-row {
  padding: 11px 14px;
  border-top: 0.5px solid var(--pt-line-soft);
  display: flex; flex-direction: column; gap: 5px;
}
.pt-cu-cycle-row:first-child { border-top: 0; }
.pt-cu-cycle-no-protocol {
  flex-direction: row; align-items: center; gap: 10px;
  padding: 10px 14px;
}
.pt-cu-cycle-top {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.pt-cu-cycle-name { font-size: 13px; font-weight: 500; flex: 1; min-width: 0; }
.pt-cu-cycle-badge {
  font-size: 10.5px; font-family: var(--pt-mono);
  background: oklch(from var(--pt-fg) l c h / 0.06);
  color: var(--pt-fg-3);
  padding: 2px 7px; border-radius: 4px; white-space: nowrap;
}
.pt-cu-cycle-custom { color: var(--pt-warn); }
.pt-cu-cycle-edit {
  width: 22px; height: 22px; border-radius: 4px;
  border: 0; background: transparent; cursor: pointer;
  color: var(--pt-fg-4); font-size: 13px; display: grid; place-items: center;
  flex-shrink: 0;
}
.pt-cu-cycle-edit:hover { background: oklch(from var(--pt-fg) l c h / 0.06); color: var(--pt-fg); }
.pt-cu-supply-days { font-size: 12px; font-weight: 600; }
.pt-cu-supply-days.is-ok       { color: var(--pt-ok); }
.pt-cu-supply-days.is-low      { color: var(--pt-warn); }
.pt-cu-supply-days.is-critical { color: var(--pt-danger); }
.pt-cu-cycle-bar {
  height: 5px; border-radius: 999px;
  background: oklch(from var(--pt-fg) l c h / 0.07);
  overflow: hidden;
}
.pt-cu-cycle-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }
.pt-cu-cycle-fill.is-ok       { background: var(--pt-ok); }
.pt-cu-cycle-fill.is-low      { background: var(--pt-warn); }
.pt-cu-cycle-fill.is-critical { background: var(--pt-danger); }
.pt-cu-cycle-meta { font-size: 11px; color: var(--pt-fg-3); display: flex; gap: 10px; flex-wrap: wrap; }
.pt-cu-cycle-warn { color: var(--pt-warn); font-weight: 500; }
.pt-cu-cycle-warn.is-critical { color: var(--pt-danger); }
.pt-cu-cycle-override {
  margin-top: 8px; padding: 10px 12px;
  background: var(--pt-surface-2);
  border: 0.5px solid var(--pt-line);
  border-radius: var(--pt-radius);
}
```

Also add supply dot styles at the end of `styles/customer.css`:

```css
/* Supply dot (customer list) */
.pt-cu-supply { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
.pt-cu-supply-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.pt-cu-supply-dot.is-ok       { background: var(--pt-ok); }
.pt-cu-supply-dot.is-low      { background: var(--pt-warn); }
.pt-cu-supply-dot.is-critical { background: var(--pt-danger); }
.pt-cu-supply-lbl { font-size: 11px; }
.pt-cu-supply-lbl.is-ok       { color: var(--pt-fg-4); }
.pt-cu-supply-lbl.is-low      { color: var(--pt-warn); }
.pt-cu-supply-lbl.is-critical { color: var(--pt-danger); }
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/customers/ActiveCyclesCard.tsx src/app/customers/[customerId]/page.tsx styles/customer.css
git commit -m "feat: customer active cycles with real supply data and protocol overrides"
```

---

### Task 6: Customer List — Supply Indicator

**Files:**
- Modify: `src/app/customers/page.tsx`
- Modify: `src/components/customers/CustomersListView.tsx`

- [ ] **Step 1: Update `src/app/customers/page.tsx`** to compute per-customer supply status

Replace the existing file with:

```typescript
import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CustomersListView } from '@/components/customers/CustomersListView'
import { computeSupply, isCycle } from '@/types/protocols'
import type { ProductProtocol, SupplyStatus } from '@/types/protocols'

export default async function CustomersPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: customers }, { data: recentOrders }, { data: protocols }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, display_name, trust_score, ltv, customer_channels(channel_type, display_handle, is_primary), customer_tags(tag)')
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('customer_id, created_at, order_items(product_id, qty)')
      .order('created_at', { ascending: false }),
    supabase.from('product_protocols').select('*'),
  ])

  const protocolMap = Object.fromEntries(
    ((protocols ?? []) as ProductProtocol[]).map(p => [p.product_id, p])
  )

  // Compute worst-case supply status per customer
  const supplyStatuses: Record<string, SupplyStatus | null> = {}

  // Group orders by customer, find latest per product
  const ordersByCustomer: Record<string, typeof recentOrders> = {}
  for (const order of recentOrders ?? []) {
    if (!ordersByCustomer[order.customer_id]) ordersByCustomer[order.customer_id] = []
    ordersByCustomer[order.customer_id]!.push(order)
  }

  for (const customer of customers ?? []) {
    const customerOrders = ordersByCustomer[customer.id] ?? []
    const seenProducts = new Set<string>()
    let worst: SupplyStatus | null = null

    const priorityOf = (s: SupplyStatus) => s === 'critical' ? 2 : s === 'low' ? 1 : 0

    for (const order of customerOrders) {
      const items = order.order_items as { product_id: string; qty: number }[]
      for (const item of items ?? []) {
        if (!item.product_id || seenProducts.has(item.product_id)) continue
        seenProducts.add(item.product_id)
        const protocol = protocolMap[item.product_id]
        if (!protocol) continue
        const cycle = computeSupply({
          productId: item.product_id,
          productName: '',
          unitsOrdered: item.qty,
          orderDate: order.created_at,
          protocol,
        })
        if (worst === null || priorityOf(cycle.status) > priorityOf(worst)) {
          worst = cycle.status
        }
        if (worst === 'critical') break
      }
      if (worst === 'critical') break
    }

    supplyStatuses[customer.id] = worst
  }

  return (
    <Shell section="Customers">
      <CustomersListView customers={customers ?? []} supplyStatuses={supplyStatuses} />
    </Shell>
  )
}
```

- [ ] **Step 2: Update `src/components/customers/CustomersListView.tsx`** to render supply dot

Add `supplyStatuses` to the `Props` interface and destructure it:

```typescript
import type { SupplyStatus } from '@/types/protocols'

interface Props {
  customers: Customer[]
  supplyStatuses?: Record<string, SupplyStatus | null>
}

export function CustomersListView({ customers, supplyStatuses = {} }: Props) {
```

Inside the `filtered.map` render, after the `<div className="pt-thread-meta">` block that contains the trust pill and Message link, add the supply dot between the trust pill and Message link:

```typescript
                    {(() => {
                      const status = supplyStatuses[c.id]
                      if (!status) return <div style={{ width: 48 }} />
                      const lowCount = status === 'low' ? 1 : 0 // simplified — dot only shows worst
                      return (
                        <div className="pt-cu-supply">
                          <div className={`pt-cu-supply-dot is-${status}`} />
                          <span className={`pt-cu-supply-lbl is-${status}`}>
                            {status === 'ok' ? 'supply ok' : status === 'low' ? 'low' : 'out'}
                          </span>
                        </div>
                      )
                    })()}
```

The full updated `<div className="pt-thread-meta">` block becomes:

```typescript
                    <div className="pt-thread-meta">
                      <div className={`pt-trust-pill pt-trust-${trustCls}`}>{c.trust_score}</div>
                      {(() => {
                        const status = supplyStatuses[c.id]
                        if (!status) return <div style={{ width: 48 }} />
                        return (
                          <div className="pt-cu-supply">
                            <div className={`pt-cu-supply-dot is-${status}`} />
                            <span className={`pt-cu-supply-lbl is-${status}`}>
                              {status === 'ok' ? 'supply ok' : status === 'low' ? 'low' : 'out'}
                            </span>
                          </div>
                        )
                      })()}
                      <Link href={`/inbox`} className="pt-link" style={{ fontSize: 11, marginTop: 4 }}>Message →</Link>
                    </div>
```

- [ ] **Step 3: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/customers/page.tsx src/components/customers/CustomersListView.tsx
git commit -m "feat: supply status dot indicator on customer list"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `product_protocols` table + RLS | Task 1 |
| `customer_protocol_overrides` table + RLS | Task 1 |
| `ProductProtocol`, `CustomerProtocolOverride`, `ActiveCycle`, `CycleEntry` types | Task 2 |
| `computeSupply()` with all status thresholds | Task 2 |
| `frequencyToDaily()` for all 5 values | Task 2 |
| `upsertProtocol()` server action with validation | Task 3 |
| `upsertProtocolOverride()` server action | Task 3 |
| Protocol section in catalog product detail (view + edit + live doses/vial label) | Task 4 |
| Active Cycles replaced with real data, progress bar, days remaining | Task 5 |
| Status colours: ok=green / low=orange / critical=red | Tasks 5 + CSS |
| `★ custom` badge on overridden cycles | Task 5 |
| Per-customer override inline form on cycle row | Task 5 |
| "No protocol — configure in Catalog →" for unprotocolled products | Task 5 |
| Customer list supply dot + label | Task 6 |
| Worst-case status logic across customer's products | Task 6 |

**Type consistency check:** `ActiveCycle`, `CycleEntry`, `isCycle`, `computeSupply`, `FREQUENCY_LABELS`, `FREQUENCY_OPTIONS` all defined in Task 2 and used by the same names in Tasks 3–6. ✓

**No placeholders found.** ✓
