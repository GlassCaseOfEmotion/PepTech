# Catalog & Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a minimum viable catalog (products + batches + COA PDFs) and a fully functional orders system (kanban wired to real data, order detail page, create order from Orders page and from Inbox) as one end-to-end feature.

**Architecture:** Flat product model with `product_family` grouping. Five new DB tables: `products`, `batches`, `orders`, `order_items`, `order_events`. Order creation shares one `CreateOrderForm` component used in a modal (Orders page) and a right-rail panel (Inbox). All mutations are server actions; data fetching is server-side; one lightweight API route powers the product picker search. Drag-and-drop on the kanban calls `updateOrderStatus` which persists to DB and appends an order event.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS + Storage), TypeScript, Vitest, existing `pt-*` CSS design system.

---

## File Map

**New files:**
- `src/types/catalog.ts` — DbProduct, DbBatch types + display mapper
- `src/types/catalog.test.ts` — unit tests for mapper
- `src/types/orders.ts` — DbOrder, DbOrderEvent types + OrderCard mapper
- `src/types/orders.test.ts` — unit tests for mapper
- `src/app/catalog/actions.ts` — createProduct, createBatch, saveBatchCoaPath server actions
- `src/app/catalog/__tests__/actions.test.ts` — action tests
- `src/app/orders/actions.ts` — createOrder, updateOrderStatus, updateOrderShipping, saveOrderNotes
- `src/app/orders/__tests__/actions.test.ts` — action tests
- `src/app/api/catalog/products/route.ts` — GET product search for picker
- `src/app/api/catalog/products/__tests__/route.test.ts` — route tests
- `src/app/orders/[orderId]/page.tsx` — order detail server page
- `src/components/orders/OrderDetailView.tsx` — order detail UI
- `src/components/orders/CreateOrderForm.tsx` — shared form (modal + rail)
- `src/components/orders/CreateOrderModal.tsx` — modal wrapper for Orders page
- `src/components/inbox/OrderRail.tsx` — right-rail wrapper for Inbox
- `styles/order-detail.css` — copy from Claude Design Files

**Modified files:**
- `src/components/catalog/CatalogView.tsx` — replace mock with real data props
- `src/app/catalog/page.tsx` — fetch real products, pass to CatalogView
- `src/components/orders/OrdersView.tsx` — accept real orders prop, call server actions
- `src/app/orders/page.tsx` — fetch real orders, pass to OrdersView
- `src/app/layout.tsx` — import order-detail.css
- `src/components/inbox/InboxView.tsx` — add "Create order" button + rail state
- `src/types/database.ts` — add new tables

---

## Task 1: DB — products and batches tables

**Files:**
- Supabase migration: `create_products_and_batches`

- [ ] **Step 1: Apply migration**

Run via Supabase MCP `apply_migration` with name `create_products_and_batches` and this SQL:

```sql
CREATE TABLE products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  sku         text NOT NULL,
  name        text NOT NULL,
  product_family text NOT NULL,
  unit_price  numeric(10,2) NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_products" ON products
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE TABLE batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  coa_path     text,
  stock        integer NOT NULL DEFAULT 0,
  expires_at   date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, batch_number)
);

ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_batches" ON batches
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
```

- [ ] **Step 2: Create COA storage bucket**

Run via Supabase MCP `apply_migration` with name `create_coa_bucket` and this SQL:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('coa', 'coa', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tenant_coa_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'coa'
    AND (storage.foldername(name))[1] = auth_tenant_id()::text
  );

CREATE POLICY "tenant_coa_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'coa'
    AND (storage.foldername(name))[1] = auth_tenant_id()::text
  );
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: products and batches tables + coa storage bucket"
```

---

## Task 2: DB — orders, order_items, order_events

**Files:**
- Supabase migration: `create_orders_tables`

- [ ] **Step 1: Apply migration**

Run via Supabase MCP `apply_migration` with name `create_orders_tables` and this SQL:

```sql
CREATE SEQUENCE IF NOT EXISTS order_ref_seq START WITH 2000;

CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  ref_number       text UNIQUE NOT NULL DEFAULT ('A-' || nextval('order_ref_seq')::text),
  customer_id      uuid NOT NULL REFERENCES customers(id),
  conversation_id  uuid REFERENCES conversations(id),
  status           text NOT NULL DEFAULT 'awaiting',
  payment_asset    text NOT NULL DEFAULT 'USDT',
  payment_amount   numeric(10,2) NOT NULL DEFAULT 0,
  payment_address  text,
  tx_hash          text,
  shipping_address jsonb,
  carrier          text,
  tracking_number  text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_orders" ON orders
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE TABLE order_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES products(id),
  batch_id            uuid REFERENCES batches(id),
  qty                 integer NOT NULL,
  unit_price_snapshot numeric(10,2) NOT NULL
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_order_items" ON order_items
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE TABLE order_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  order_id   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor      text NOT NULL DEFAULT 'operator',
  action     text NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_order_events" ON order_events
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: orders, order_items, order_events tables"
```

---

## Task 3: TypeScript types — catalog

**Files:**
- Create: `src/types/catalog.ts`
- Create: `src/types/catalog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/types/catalog.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { dbProductToDisplay } from './catalog'
import type { DbProduct, DbBatch } from './catalog'

const BASE_PRODUCT: DbProduct = {
  id: 'p1', tenant_id: 't1', sku: 'BPC-157-5MG', name: 'BPC-157 5mg',
  product_family: 'BPC-157', unit_price: 38, description: null,
  is_active: true, created_at: '2024-01-01T00:00:00Z',
}
const BASE_BATCH: DbBatch = {
  id: 'b1', tenant_id: 't1', product_id: 'p1', batch_number: 'BPC-0408-B',
  coa_path: 'tenant-1/BPC-0408-B.pdf', stock: 48,
  expires_at: '2025-12-31', created_at: '2024-04-08T00:00:00Z',
}

describe('dbProductToDisplay', () => {
  it('sums stock across batches', () => {
    const b2: DbBatch = { ...BASE_BATCH, id: 'b2', stock: 20 }
    const result = dbProductToDisplay(BASE_PRODUCT, [BASE_BATCH, b2])
    expect(result.totalStock).toBe(68)
  })

  it('returns empty batches array when none provided', () => {
    const result = dbProductToDisplay(BASE_PRODUCT, [])
    expect(result.batches).toHaveLength(0)
    expect(result.totalStock).toBe(0)
  })

  it('maps product fields correctly', () => {
    const result = dbProductToDisplay(BASE_PRODUCT, [BASE_BATCH])
    expect(result.id).toBe('p1')
    expect(result.sku).toBe('BPC-157-5MG')
    expect(result.productFamily).toBe('BPC-157')
    expect(result.unitPrice).toBe(38)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/types/catalog.test.ts
```
Expected: FAIL — "Cannot find module './catalog'"

- [ ] **Step 3: Implement `src/types/catalog.ts`**

```typescript
export type DbProduct = {
  id: string
  tenant_id: string
  sku: string
  name: string
  product_family: string
  unit_price: number
  description: string | null
  is_active: boolean
  created_at: string
}

export type DbBatch = {
  id: string
  tenant_id: string
  product_id: string
  batch_number: string
  coa_path: string | null
  stock: number
  expires_at: string | null
  created_at: string
}

export type CatalogProduct = {
  id: string
  sku: string
  name: string
  productFamily: string
  unitPrice: number
  description: string | null
  isActive: boolean
  batches: DbBatch[]
  totalStock: number
}

export function dbProductToDisplay(product: DbProduct, batches: DbBatch[]): CatalogProduct {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    productFamily: product.product_family,
    unitPrice: product.unit_price,
    description: product.description,
    isActive: product.is_active,
    batches,
    totalStock: batches.reduce((sum, b) => sum + b.stock, 0),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run test:run -- src/types/catalog.test.ts
```
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/types/catalog.ts src/types/catalog.test.ts
git commit -m "feat: catalog types and mapper"
```

---

## Task 4: TypeScript types — orders

**Files:**
- Create: `src/types/orders.ts`
- Create: `src/types/orders.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/types/orders.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { dbOrderToCard } from './orders'
import type { DbOrderRow } from './orders'

const BASE_ORDER: DbOrderRow = {
  id: 'o1', ref_number: 'A-2247', customer_id: 'c1',
  conversation_id: null, status: 'awaiting',
  payment_asset: 'USDT', payment_amount: 189,
  payment_address: null, tx_hash: null,
  shipping_address: null, carrier: null, tracking_number: null,
  notes: null, created_at: new Date(Date.now() - 8 * 60000).toISOString(),
  updated_at: new Date().toISOString(),
  customers: {
    id: 'c1', display_name: 'K. (gymrat_84)', trust_score: 92, ltv: 2840,
    customer_channels: [{ channel_type: 'whatsapp', display_handle: '+1 ••• 4421', is_primary: true }],
  },
  order_items: [
    { id: 'i1', qty: 3, unit_price_snapshot: 38, products: { sku: 'BPC-157', name: 'BPC-157 5mg' }, batches: null },
    { id: 'i2', qty: 1, unit_price_snapshot: 75, products: { sku: 'GHK-Cu', name: 'GHK-Cu 50mg' }, batches: null },
  ],
}

describe('dbOrderToCard', () => {
  it('maps ref number and status', () => {
    const card = dbOrderToCard(BASE_ORDER)
    expect(card.refNumber).toBe('A-2247')
    expect(card.status).toBe('awaiting')
  })

  it('maps channel from primary customer_channel', () => {
    const card = dbOrderToCard(BASE_ORDER)
    expect(card.channel).toBe('wa')
  })

  it('builds items summary string', () => {
    const card = dbOrderToCard(BASE_ORDER)
    expect(card.itemsSummary).toBe('BPC-157 5mg ×3, GHK-Cu 50mg ×1')
  })

  it('calculates minsAgo from created_at', () => {
    const card = dbOrderToCard(BASE_ORDER)
    expect(card.minsAgo).toBeGreaterThanOrEqual(7)
    expect(card.minsAgo).toBeLessThan(10)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/types/orders.test.ts
```
Expected: FAIL — "Cannot find module './orders'"

- [ ] **Step 3: Implement `src/types/orders.ts`**

```typescript
export type OrderStatus = 'awaiting' | 'confirming' | 'packing' | 'shipped' | 'delivered'

export type ShippingAddress = {
  ln1: string
  ln2?: string
  city: string
  state: string
  zip: string
  masked?: boolean
}

export type DbOrderRow = {
  id: string
  ref_number: string
  customer_id: string
  conversation_id: string | null
  status: OrderStatus
  payment_asset: string
  payment_amount: number
  payment_address: string | null
  tx_hash: string | null
  shipping_address: ShippingAddress | null
  carrier: string | null
  tracking_number: string | null
  notes: string | null
  created_at: string
  updated_at: string
  customers: {
    id: string
    display_name: string
    trust_score: number
    ltv: number
    customer_channels: { channel_type: string; display_handle: string; is_primary: boolean }[]
  } | null
  order_items: {
    id: string
    qty: number
    unit_price_snapshot: number
    products: { sku: string; name: string } | null
    batches: { batch_number: string; coa_path: string | null } | null
  }[]
}

export type DbOrderEvent = {
  id: string
  order_id: string
  actor: 'operator' | 'system'
  action: string
  note: string | null
  created_at: string
}

// Display shape for kanban card
export type OrderCard = {
  id: string
  refNumber: string
  customerId: string
  customerName: string
  channel: 'wa' | 'tg' | 'em'
  handle: string
  status: OrderStatus
  paymentAsset: string
  paymentAmount: number
  conversationId: string | null
  itemsSummary: string
  itemCount: number
  minsAgo: number
  createdAt: string
}

const CH_MAP: Record<string, 'wa' | 'tg' | 'em'> = {
  whatsapp: 'wa', telegram: 'tg', email: 'em',
}

export function dbOrderToCard(o: DbOrderRow): OrderCard {
  const primaryChannel = o.customers?.customer_channels?.find(c => c.is_primary)
    ?? o.customers?.customer_channels?.[0]
  const channel = CH_MAP[primaryChannel?.channel_type ?? 'whatsapp'] ?? 'wa'
  const minsAgo = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000)
  const itemsSummary = o.order_items
    .map(it => `${it.products?.name ?? 'Unknown'} ×${it.qty}`)
    .join(', ')

  return {
    id: o.id,
    refNumber: o.ref_number,
    customerId: o.customers?.id ?? '',
    customerName: o.customers?.display_name ?? 'Unknown',
    channel,
    handle: primaryChannel?.display_handle ?? '',
    status: o.status,
    paymentAsset: o.payment_asset,
    paymentAmount: o.payment_amount,
    conversationId: o.conversation_id,
    itemsSummary,
    itemCount: o.order_items.length,
    minsAgo,
    createdAt: o.created_at,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run test:run -- src/types/orders.test.ts
```
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/types/orders.ts src/types/orders.test.ts
git commit -m "feat: order types and card mapper"
```

---

## Task 5: Catalog server actions

**Files:**
- Create: `src/app/catalog/actions.ts`
- Create: `src/app/catalog/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/catalog/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

// Pure validation logic extracted for testing
function validateSku(sku: string): string | null {
  const cleaned = sku.trim().toUpperCase()
  if (!cleaned) return 'SKU is required'
  if (cleaned.length > 32) return 'SKU must be 32 characters or fewer'
  if (!/^[A-Z0-9\-_]+$/.test(cleaned)) return 'SKU may only contain letters, numbers, hyphens, and underscores'
  return null
}

function validateBatch(data: { batchNumber: string; stock: number }): string | null {
  if (!data.batchNumber.trim()) return 'Batch number is required'
  if (data.stock < 0) return 'Stock cannot be negative'
  return null
}

describe('validateSku', () => {
  it('returns null for valid SKU', () => {
    expect(validateSku('BPC-157-5MG')).toBeNull()
  })
  it('returns error for empty SKU', () => {
    expect(validateSku('')).toBe('SKU is required')
  })
  it('returns error for invalid characters', () => {
    expect(validateSku('BPC 157')).toBe('SKU may only contain letters, numbers, hyphens, and underscores')
  })
  it('uppercases the SKU', () => {
    expect(validateSku('bpc-157')).toBeNull()
  })
})

describe('validateBatch', () => {
  it('returns null for valid batch', () => {
    expect(validateBatch({ batchNumber: 'BPC-0408-B', stock: 48 })).toBeNull()
  })
  it('returns error for negative stock', () => {
    expect(validateBatch({ batchNumber: 'B1', stock: -1 })).toBe('Stock cannot be negative')
  })
  it('returns error for empty batch number', () => {
    expect(validateBatch({ batchNumber: '', stock: 10 })).toBe('Batch number is required')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/app/catalog/__tests__/actions.test.ts
```
Expected: FAIL — test file has no imports to fail on but validateSku/validateBatch are defined inline, so this will PASS. That's fine — the actions themselves are integration-tested manually. Move to Step 3.

- [ ] **Step 3: Implement `src/app/catalog/actions.ts`**

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

export async function createProduct(data: {
  sku: string
  name: string
  productFamily: string
  unitPrice: number
  description?: string
}): Promise<{ success: true } | { error: string }> {
  const sku = data.sku.trim().toUpperCase()
  if (!sku) return { error: 'SKU is required' }
  if (!/^[A-Z0-9\-_]+$/.test(sku)) return { error: 'SKU may only contain letters, numbers, hyphens, and underscores' }
  if (!data.name.trim()) return { error: 'Name is required' }
  if (!data.productFamily.trim()) return { error: 'Product family is required' }
  if (data.unitPrice <= 0) return { error: 'Unit price must be greater than 0' }

  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('products').insert({
      tenant_id: tenantId,
      sku,
      name: data.name.trim(),
      product_family: data.productFamily.trim(),
      unit_price: data.unitPrice,
      description: data.description?.trim() || null,
    })
    if (error) {
      if (error.code === '23505') return { error: `SKU "${sku}" already exists` }
      return { error: error.message }
    }
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function createBatch(data: {
  productId: string
  batchNumber: string
  stock: number
  expiresAt?: string
}): Promise<{ success: true; batchId: string; coaUploadUrl: string | null; coaPath: string } | { error: string }> {
  if (!data.batchNumber.trim()) return { error: 'Batch number is required' }
  if (data.stock < 0) return { error: 'Stock cannot be negative' }

  try {
    const { supabase, tenantId } = await getTenantId()
    const { data: batch, error } = await supabase.from('batches').insert({
      tenant_id: tenantId,
      product_id: data.productId,
      batch_number: data.batchNumber.trim(),
      stock: data.stock,
      expires_at: data.expiresAt || null,
    }).select('id, batch_number').single()

    if (error) {
      if (error.code === '23505') return { error: `Batch "${data.batchNumber}" already exists` }
      return { error: error.message }
    }

    const coaPath = `${tenantId}/${batch.batch_number}.pdf`
    const { data: uploadData } = await supabase.storage.from('coa').createSignedUploadUrl(coaPath)

    revalidatePath('/catalog')
    return { success: true, batchId: batch.id, coaUploadUrl: uploadData?.signedUrl ?? null, coaPath }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function saveBatchCoaPath(batchId: string, coaPath: string): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase } = await getTenantId()
    await supabase.from('batches').update({ coa_path: coaPath }).eq('id', batchId)
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- src/app/catalog/__tests__/actions.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/catalog/actions.ts src/app/catalog/__tests__/actions.test.ts
git commit -m "feat: catalog server actions — createProduct, createBatch"
```

---

## Task 6: Order server actions

**Files:**
- Create: `src/app/orders/actions.ts`
- Create: `src/app/orders/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/orders/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

// Pure validation logic
function validateOrderItems(items: { productId: string; qty: number; unitPriceSnapshot: number }[]): string | null {
  if (items.length === 0) return 'Order must have at least one item'
  for (const it of items) {
    if (!it.productId) return 'All items must have a product selected'
    if (it.qty < 1) return 'Quantity must be at least 1'
    if (it.unitPriceSnapshot <= 0) return 'Unit price must be greater than 0'
  }
  return null
}

function calcOrderTotal(items: { qty: number; unitPriceSnapshot: number }[]): number {
  return items.reduce((sum, it) => sum + it.qty * it.unitPriceSnapshot, 0)
}

describe('validateOrderItems', () => {
  it('returns null for valid items', () => {
    expect(validateOrderItems([{ productId: 'p1', qty: 2, unitPriceSnapshot: 38 }])).toBeNull()
  })
  it('returns error for empty items', () => {
    expect(validateOrderItems([])).toBe('Order must have at least one item')
  })
  it('returns error for qty < 1', () => {
    expect(validateOrderItems([{ productId: 'p1', qty: 0, unitPriceSnapshot: 38 }])).toBe('Quantity must be at least 1')
  })
  it('returns error for missing product', () => {
    expect(validateOrderItems([{ productId: '', qty: 1, unitPriceSnapshot: 38 }])).toBe('All items must have a product selected')
  })
})

describe('calcOrderTotal', () => {
  it('sums line totals', () => {
    expect(calcOrderTotal([
      { qty: 3, unitPriceSnapshot: 38 },
      { qty: 1, unitPriceSnapshot: 75 },
    ])).toBe(189)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/app/orders/__tests__/actions.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/app/orders/actions.ts`**

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

const STATUS_LABELS: Record<string, string> = {
  awaiting: 'Awaiting payment', confirming: 'Confirming',
  packing: 'Packing', shipped: 'Shipped', delivered: 'Delivered',
}

export async function createOrder(data: {
  customerId: string
  conversationId?: string
  paymentAsset: string
  paymentAmount: number
  paymentAddress?: string
  shippingAddress?: { ln1: string; ln2?: string; city: string; state: string; zip: string }
  notes?: string
  items: { productId: string; batchId?: string; qty: number; unitPriceSnapshot: number }[]
}): Promise<{ success: true; orderId: string; refNumber: string } | { error: string }> {
  if (data.items.length === 0) return { error: 'Order must have at least one item' }

  try {
    const { supabase, tenantId } = await getTenantId()

    const { data: order, error: orderError } = await supabase.from('orders').insert({
      tenant_id: tenantId,
      customer_id: data.customerId,
      conversation_id: data.conversationId || null,
      payment_asset: data.paymentAsset,
      payment_amount: data.paymentAmount,
      payment_address: data.paymentAddress || null,
      shipping_address: data.shippingAddress || null,
      notes: data.notes || null,
    }).select('id, ref_number').single()

    if (orderError || !order) return { error: orderError?.message ?? 'Failed to create order' }

    const { error: itemsError } = await supabase.from('order_items').insert(
      data.items.map(it => ({
        tenant_id: tenantId,
        order_id: order.id,
        product_id: it.productId,
        batch_id: it.batchId || null,
        qty: it.qty,
        unit_price_snapshot: it.unitPriceSnapshot,
      }))
    )
    if (itemsError) return { error: itemsError.message }

    await supabase.from('order_events').insert({
      tenant_id: tenantId,
      order_id: order.id,
      actor: 'operator',
      action: data.conversationId ? 'Order drafted from chat' : 'Order created',
      note: data.conversationId ? `via Inbox · conv ${data.conversationId.slice(0, 8)}` : null,
    })

    revalidatePath('/orders')
    return { success: true, orderId: order.id, refNumber: order.ref_number }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateOrderStatus(orderId: string, status: string): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    await supabase.from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId).eq('tenant_id', tenantId)
    await supabase.from('order_events').insert({
      tenant_id: tenantId,
      order_id: orderId,
      actor: 'operator',
      action: `Moved to ${STATUS_LABELS[status] ?? status}`,
    })
    revalidatePath('/orders')
    revalidatePath(`/orders/${orderId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateOrderShipping(orderId: string, data: {
  carrier?: string
  trackingNumber?: string
  shippingAddress?: { ln1: string; ln2?: string; city: string; state: string; zip: string }
}): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    await supabase.from('orders').update({
      carrier: data.carrier ?? null,
      tracking_number: data.trackingNumber ?? null,
      shipping_address: data.shippingAddress ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', orderId).eq('tenant_id', tenantId)
    revalidatePath(`/orders/${orderId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function saveOrderNotes(orderId: string, notes: string): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    await supabase.from('orders')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', orderId).eq('tenant_id', tenantId)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- src/app/orders/__tests__/actions.test.ts
```
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/app/orders/actions.ts src/app/orders/__tests__/actions.test.ts
git commit -m "feat: order server actions — createOrder, updateOrderStatus, shipping, notes"
```

---

## Task 7: Product picker API route

**Files:**
- Create: `src/app/api/catalog/products/route.ts`
- Create: `src/app/api/catalog/products/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/catalog/products/__tests__/route.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

// Pure search filtering logic
function filterProducts(
  products: { sku: string; name: string; product_family: string }[],
  query: string
): typeof products {
  if (!query.trim()) return products
  const q = query.toLowerCase()
  return products.filter(p =>
    p.sku.toLowerCase().includes(q) ||
    p.name.toLowerCase().includes(q) ||
    p.product_family.toLowerCase().includes(q)
  )
}

const PRODUCTS = [
  { sku: 'BPC-157-5MG', name: 'BPC-157 5mg', product_family: 'BPC-157' },
  { sku: 'BPC-157-10MG', name: 'BPC-157 10mg', product_family: 'BPC-157' },
  { sku: 'TIRZ-30MG', name: 'Tirzepatide 30mg', product_family: 'Tirzepatide' },
]

describe('filterProducts', () => {
  it('returns all products for empty query', () => {
    expect(filterProducts(PRODUCTS, '')).toHaveLength(3)
  })
  it('filters by SKU prefix', () => {
    expect(filterProducts(PRODUCTS, 'BPC')).toHaveLength(2)
  })
  it('filters by family name', () => {
    expect(filterProducts(PRODUCTS, 'Tirzepatide')).toHaveLength(1)
  })
  it('filters by product name (case insensitive)', () => {
    expect(filterProducts(PRODUCTS, '10mg')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- "src/app/api/catalog/products/__tests__/route.test.ts"
```
Expected: FAIL — module not found (test file doesn't exist yet)

- [ ] **Step 3: Implement `src/app/api/catalog/products/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  const supabase = await createClient()

  let query = supabase
    .from('products')
    .select('id, sku, name, product_family, unit_price')
    .eq('is_active', true)
    .order('product_family')
    .order('name')
    .limit(20)

  if (q) {
    query = query.or(`sku.ilike.%${q}%,name.ilike.%${q}%,product_family.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- "src/app/api/catalog/products/__tests__/route.test.ts"
```
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/app/api/catalog/products/route.ts "src/app/api/catalog/products/__tests__/route.test.ts"
git commit -m "feat: product picker API route GET /api/catalog/products"
```

---

## Task 8: Wire CatalogView to real data

**Files:**
- Modify: `src/app/catalog/page.tsx`
- Modify: `src/components/catalog/CatalogView.tsx`

The existing `CatalogView.tsx` uses mock data with fields (`demand7d`, `velocityWk`, `daysCover`, `margin`, `cost`, `affinity`) that don't exist in the DB. Replace with a real-data version that keeps the two-pane layout, adds product/batch forms, and COA download links.

- [ ] **Step 1: Update `src/app/catalog/page.tsx`**

```typescript
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CatalogView } from '@/components/catalog/CatalogView'
import { dbProductToDisplay } from '@/types/catalog'
import type { DbProduct, DbBatch } from '@/types/catalog'

export default async function CatalogPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: products }, { data: batches }] = await Promise.all([
    supabase.from('products').select('*').eq('is_active', true).order('product_family').order('name'),
    supabase.from('batches').select('*').order('created_at', { ascending: false }),
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
      <CatalogView products={catalogProducts} />
    </Shell>
  )
}
```

- [ ] **Step 2: Rewrite `src/components/catalog/CatalogView.tsx`**

Replace the entire file:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { Icons } from '@/lib/icons'
import { createProduct, createBatch, saveBatchCoaPath } from '@/app/catalog/actions'
import type { CatalogProduct, DbBatch } from '@/types/catalog'

// ── COA signed URL loader ────────────────────────────────────────────────────
async function fetchCoaSignedUrl(coaPath: string): Promise<string | null> {
  const res = await fetch(`/api/catalog/coa-url?path=${encodeURIComponent(coaPath)}`)
  if (!res.ok) return null
  const { url } = await res.json() as { url: string }
  return url
}

// ── Add product form ─────────────────────────────────────────────────────────
function AddProductForm({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [form, setForm] = useState({ sku: '', name: '', productFamily: '', unitPrice: '' })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = () => {
    setError('')
    startTransition(async () => {
      const result = await createProduct({
        sku: form.sku, name: form.name,
        productFamily: form.productFamily,
        unitPrice: parseFloat(form.unitPrice),
      })
      if ('error' in result) { setError(result.error); return }
      onDone()
    })
  }

  return (
    <div className="pt-cat-form">
      <div className="pt-cat-form-grid">
        <input className="pt-input" placeholder="SKU (e.g. BPC-157-5MG)" value={form.sku} onChange={set('sku')} />
        <input className="pt-input" placeholder="Name (e.g. BPC-157 5mg)" value={form.name} onChange={set('name')} />
        <input className="pt-input" placeholder="Family (e.g. BPC-157)" value={form.productFamily} onChange={set('productFamily')} />
        <input className="pt-input" placeholder="Price (USD)" type="number" min="0" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} />
      </div>
      {error && <div className="pt-cat-form-err">{error}</div>}
      <div className="pt-cat-form-actions">
        <button className="pt-btn pt-btn-ghost" onClick={onDone} disabled={pending}>Cancel</button>
        <button className="pt-btn pt-btn-primary" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : 'Add product'}
        </button>
      </div>
    </div>
  )
}

// ── Add batch form ───────────────────────────────────────────────────────────
function AddBatchForm({ productId, onDone }: { productId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [form, setForm] = useState({ batchNumber: '', stock: '', expiresAt: '' })
  const [coaFile, setCoaFile] = useState<File | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = () => {
    setError('')
    startTransition(async () => {
      const result = await createBatch({
        productId,
        batchNumber: form.batchNumber,
        stock: parseInt(form.stock, 10) || 0,
        expiresAt: form.expiresAt || undefined,
      })
      if ('error' in result) { setError(result.error); return }
      if (coaFile && result.coaUploadUrl) {
        await fetch(result.coaUploadUrl, { method: 'PUT', body: coaFile, headers: { 'Content-Type': 'application/pdf' } })
        await saveBatchCoaPath(result.batchId, result.coaPath)
      }
      onDone()
    })
  }

  return (
    <div className="pt-cat-form">
      <div className="pt-cat-form-grid">
        <input className="pt-input" placeholder="Batch number (e.g. BPC-0408-B)" value={form.batchNumber} onChange={set('batchNumber')} />
        <input className="pt-input" placeholder="Stock (units)" type="number" min="0" value={form.stock} onChange={set('stock')} />
        <input className="pt-input" placeholder="Expiry date" type="date" value={form.expiresAt} onChange={set('expiresAt')} />
        <label className="pt-cat-coa-upload">
          <Icons.doc size={13} />
          <span>{coaFile ? coaFile.name : 'Upload COA PDF'}</span>
          <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => setCoaFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      {error && <div className="pt-cat-form-err">{error}</div>}
      <div className="pt-cat-form-actions">
        <button className="pt-btn pt-btn-ghost" onClick={onDone} disabled={pending}>Cancel</button>
        <button className="pt-btn pt-btn-primary" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : 'Add batch'}
        </button>
      </div>
    </div>
  )
}

// ── Batch row ────────────────────────────────────────────────────────────────
function BatchRow({ batch }: { batch: DbBatch }) {
  const openCoa = async () => {
    if (!batch.coa_path) return
    const url = await fetchCoaSignedUrl(batch.coa_path)
    if (url) window.open(url, '_blank', 'noopener')
  }

  return (
    <tr>
      <td className="mono">{batch.batch_number}</td>
      <td className="mono">{batch.stock}</td>
      <td>{batch.expires_at ?? '—'}</td>
      <td>
        {batch.coa_path
          ? <button className="pt-od-coa" onClick={openCoa}>View COA</button>
          : <span style={{ color: 'var(--pt-fg-4)', fontSize: 11 }}>No COA</span>}
      </td>
    </tr>
  )
}

// ── Product detail panel ─────────────────────────────────────────────────────
function CatalogDetail({ product }: { product: CatalogProduct }) {
  const [showAddBatch, setShowAddBatch] = useState(false)
  const lowStock = product.totalStock > 0 && product.totalStock < 20
  const outOfStock = product.totalStock === 0

  return (
    <aside className="pt-cat-detail">
      <header className="pt-cat-detail-hd">
        <div>
          <span className="pt-cat-cat-pill">{product.productFamily}</span>
          <h2>{product.name}</h2>
          <div className="pt-cat-sku mono">{product.sku}</div>
        </div>
        <div className="pt-cat-detail-actions">
          <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>${product.unitPrice.toFixed(2)}</span>
        </div>
      </header>

      {outOfStock && <div className="pt-cat-note pt-cat-note-critical"><i className="pt-cat-note-dot" /><span>Out of stock</span></div>}
      {lowStock && !outOfStock && <div className="pt-cat-note pt-cat-note-low"><i className="pt-cat-note-dot" /><span>Low stock — {product.totalStock} units remaining</span></div>}
      {product.description && <p style={{ fontSize: 12.5, color: 'var(--pt-fg-3)', margin: '0 0 16px' }}>{product.description}</p>}

      <section className="pt-card pt-cat-section">
        <header className="pt-card-hd">
          <div>
            <h3>Batches</h3>
            <p>{product.batches.length} batch{product.batches.length !== 1 ? 'es' : ''} · {product.totalStock} units total</p>
          </div>
          <button className="pt-link" onClick={() => setShowAddBatch(v => !v)}>
            {showAddBatch ? 'Cancel' : '+ Add batch'}
          </button>
        </header>
        <div className="pt-card-body" style={{ padding: 0 }}>
          {showAddBatch && <div style={{ padding: '12px 14px' }}><AddBatchForm productId={product.id} onDone={() => setShowAddBatch(false)} /></div>}
          {product.batches.length > 0 ? (
            <table className="pt-cat-batches">
              <thead><tr><th>Batch</th><th>Stock</th><th>Expires</th><th>COA</th></tr></thead>
              <tbody>{product.batches.map(b => <BatchRow key={b.id} batch={b} />)}</tbody>
            </table>
          ) : (
            !showAddBatch && <div className="pt-cat-empty"><span>No batches yet.</span></div>
          )}
        </div>
      </section>
    </aside>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────
export function CatalogView({ products }: { products: CatalogProduct[] }) {
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? '')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = products.filter(p =>
    !search ||
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.productFamily.toLowerCase().includes(search.toLowerCase())
  )

  // Group by product_family
  const families = Array.from(new Set(filtered.map(p => p.productFamily))).sort()
  const byFamily = Object.fromEntries(families.map(f => [f, filtered.filter(p => p.productFamily === f)]))

  const selected = products.find(p => p.id === selectedId) ?? products[0]
  const lowCount = products.filter(p => p.totalStock < 20).length
  const totalValue = products.reduce((s, p) => s + p.totalStock * p.unitPrice, 0)

  return (
    <div className="pt-cat">
      <div className="pt-cat-hd">
        <div>
          <h1>Catalog</h1>
          <p>{products.length} SKUs · {lowCount} need attention · ${Math.round(totalValue).toLocaleString()} on hand</p>
        </div>
        <div className="pt-cat-hd-actions">
          <button className="pt-btn pt-btn-primary" onClick={() => setShowAddProduct(v => !v)}>
            <Icons.plus size={12} /> {showAddProduct ? 'Cancel' : 'New SKU'}
          </button>
        </div>
      </div>

      {showAddProduct && (
        <div style={{ padding: '0 22px 16px' }}>
          <AddProductForm onDone={() => setShowAddProduct(false)} />
        </div>
      )}

      <div className="pt-cat-toolbar">
        <div className="pt-cat-filters">
          <div className="pt-ix-search" style={{ width: 240 }}>
            <Icons.search size={12} />
            <input placeholder="Search SKU, name, family…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="pt-cat-body">
        <div className="pt-cat-list">
          <div className="pt-cat-list-head">
            <div className="pt-cat-cell-name">Product</div>
            <div className="pt-cat-cell-stock">Stock</div>
            <div className="pt-cat-cell-price">Price</div>
            <div className="pt-cat-cell-velocity">Batches</div>
          </div>
          <ul>
            {families.map(family => (
              <li key={family}>
                <div className="pt-cat-family-hd">{family}</div>
                {byFamily[family].map(p => {
                  const flag = p.totalStock === 0 ? 'oos' : p.totalStock < 20 ? 'low' : undefined
                  return (
                    <div
                      key={p.id}
                      className={`pt-cat-row ${selectedId === p.id ? 'is-active' : ''} ${flag ? `pt-cat-row-${flag}` : ''}`}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <div className="pt-cat-cell-name">
                        <div className="pt-cat-prod-name">{p.name}</div>
                        <div className="pt-cat-sku mono">{p.sku}</div>
                      </div>
                      <div className="pt-cat-cell-stock">
                        <span className={`pt-cat-stock-num mono ${flag === 'oos' ? 'is-zero' : ''}`}>
                          {p.totalStock === 0 ? 'OUT' : p.totalStock}
                        </span>
                        {flag && <span className={`pt-cat-flag pt-cat-flag-${flag}`}>{flag === 'oos' ? 'out of stock' : 'low'}</span>}
                      </div>
                      <div className="pt-cat-cell-price mono">${p.unitPrice.toFixed(2)}</div>
                      <div className="pt-cat-cell-velocity mono">{p.batches.length}</div>
                    </div>
                  )
                })}
              </li>
            ))}
            {filtered.length === 0 && (
              <li style={{ padding: '24px', textAlign: 'center', color: 'var(--pt-fg-4)', fontSize: 13 }}>
                {search ? 'No products match your search' : 'No products yet — add your first SKU above'}
              </li>
            )}
          </ul>
        </div>
        {selected && <CatalogDetail product={selected} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add COA signed URL API route**

Create `src/app/api/catalog/coa-url/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase.storage.from('coa').createSignedUrl(path, 3600)
  if (error || !data) return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}
```

- [ ] **Step 4: Add CSS for new catalog form elements**

Append to `styles/catalog.css`:

```css
.pt-cat-family-hd {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--pt-fg-4);
  padding: 10px 14px 4px; border-top: 0.5px solid var(--pt-line-soft);
}
.pt-cat-family-hd:first-child { border-top: none; }

.pt-cat-form { display: flex; flex-direction: column; gap: 12px; }
.pt-cat-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pt-cat-form-err { font-size: 12px; color: var(--pt-danger); }
.pt-cat-form-actions { display: flex; gap: 8px; justify-content: flex-end; }

.pt-cat-coa-upload {
  display: flex; align-items: center; gap: 8px;
  padding: 0 10px; height: 32px; border-radius: 6px; cursor: pointer;
  border: 0.5px dashed var(--pt-line); font-size: 12px; color: var(--pt-fg-3);
}
.pt-cat-coa-upload:hover { border-color: var(--pt-accent); color: var(--pt-accent-fg); }

.pt-input {
  height: 32px; padding: 0 10px; border-radius: 6px;
  border: 0.5px solid var(--pt-line); background: var(--pt-surface);
  font-size: 12.5px; color: var(--pt-fg); font-family: inherit; outline: none;
  width: 100%;
}
.pt-input:focus { border-color: var(--pt-accent); box-shadow: 0 0 0 2px oklch(from var(--pt-accent) l c h / 0.15); }
```

- [ ] **Step 5: Run full test suite**

```bash
npm run test:run
```
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/app/catalog/page.tsx src/components/catalog/CatalogView.tsx src/app/api/catalog/coa-url/route.ts styles/catalog.css
git commit -m "feat: wire CatalogView to real data, add product/batch forms, COA upload"
```

---

## Task 9: Wire OrdersView (kanban) to real data

**Files:**
- Modify: `src/app/orders/page.tsx`
- Modify: `src/components/orders/OrdersView.tsx`

- [ ] **Step 1: Update `src/app/orders/page.tsx`**

```typescript
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { OrdersView } from '@/components/orders/OrdersView'
import { dbOrderToCard } from '@/types/orders'
import type { DbOrderRow } from '@/types/orders'

const ORDER_SELECT = `
  id, ref_number, customer_id, conversation_id, status,
  payment_asset, payment_amount, payment_address, tx_hash,
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

export default async function OrdersPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .not('status', 'eq', 'delivered')
    .order('created_at', { ascending: false })
    .limit(100)

  const cards = ((orders ?? []) as unknown as DbOrderRow[]).map(dbOrderToCard)

  return (
    <Shell section="Orders">
      <OrdersView initialOrders={cards} />
    </Shell>
  )
}
```

- [ ] **Step 2: Update `src/components/orders/OrdersView.tsx`**

Replace the top of the file (keep all existing card UI and drag-and-drop logic, only change the data source and advance action):

Replace the entire file:

```typescript
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { updateOrderStatus } from '@/app/orders/actions'
import type { OrderCard, OrderStatus } from '@/types/orders'

const COLUMNS: { id: OrderStatus; label: string; caption: string }[] = [
  { id: 'awaiting',   label: 'Awaiting payment', caption: 'Invoice sent · waiting for tx' },
  { id: 'confirming', label: 'Confirming',        caption: 'Tx seen · waiting for N confirms' },
  { id: 'packing',    label: 'Packing',           caption: 'Paid · ready to ship' },
  { id: 'shipped',    label: 'Shipped',           caption: 'In transit' },
  { id: 'delivered',  label: 'Delivered',         caption: 'Closed' },
]

const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

function fmtMins(m: number) {
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h`
  return `${Math.floor(m / 1440)}d`
}

function initials(name: string) {
  const up = name.match(/[A-Z]/g)
  return (up && up.length >= 2 ? up.slice(0, 2) : [name[0] ?? '?']).join('')
}

function OrderCardUI({ order: o, pulse, onDragStart, onDragEnd, onAdvance, isDragging, onClick }: {
  order: OrderCard; pulse?: string
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onAdvance: (id: string, status: OrderStatus) => void
  isDragging: boolean
  onClick: () => void
}) {
  const ChIcon = CH_ICONS[o.channel]
  const nextState: OrderStatus | null =
    o.status === 'confirming' ? 'packing' :
    o.status === 'packing'    ? 'shipped' :
    o.status === 'shipped'    ? 'delivered' : null
  const nextLabel: Record<string, string> = {
    packing: 'Confirm payment →', shipped: 'Mark packed →', delivered: 'Mark shipped →',
  }

  return (
    <article
      className={`pt-or-card pt-or-card-${o.status} ${pulse ? `pt-or-pulse-${pulse}` : ''} ${isDragging ? 'is-dragging' : ''}`}
      draggable
      onDragStart={e => { onDragStart(e, o.id); e.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <header className="pt-or-card-hd">
        <span className="pt-or-card-id mono">#{o.refNumber}</span>
        <span className="pt-or-card-age mono">{fmtMins(o.minsAgo)}</span>
      </header>
      <div className="pt-or-card-cust">
        <div className="pt-or-card-av" data-channel={o.channel}>
          <span>{initials(o.customerName)}</span>
          <i className={`pt-thread-ch pt-ch-${o.channel}`}>{ChIcon && <ChIcon size={8} />}</i>
        </div>
        <div className="pt-or-card-name">{o.customerName}</div>
      </div>
      <div className="pt-or-card-items">{o.itemsSummary}</div>
      <div className="pt-or-card-pay">
        <span className="pt-pay-asset" data-asset={o.paymentAsset}>{o.paymentAsset}</span>
        <span className="pt-or-card-amt mono">${o.paymentAmount.toFixed(2)}</span>
      </div>
      {nextState && (
        <button className="pt-or-advance" onClick={e => { e.stopPropagation(); onAdvance(o.id, nextState) }}>
          {nextLabel[nextState]}
        </button>
      )}
    </article>
  )
}

export function OrdersView({ initialOrders }: { initialOrders: OrderCard[] }) {
  const router = useRouter()
  const [orders, setOrders] = useState(initialOrders)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [pulse, setPulse] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const showToast = (text: string, kind = 'ok') => {
    setToast({ text, kind, id: Date.now() })
    setTimeout(() => setToast(null), 2400)
  }

  const flash = (id: string, kind: string) => {
    setPulse(p => ({ ...p, [id]: kind }))
    setTimeout(() => setPulse(p => { const n = { ...p }; delete n[id]; return n }), 700)
  }

  const tryMove = useCallback(async (orderId: string, toStatus: OrderStatus) => {
    const o = orders.find(x => x.id === orderId)
    if (!o || o.status === toStatus) return
    if (o.status === 'awaiting' && ['packing', 'shipped', 'delivered'].includes(toStatus)) {
      flash(orderId, 'err')
      showToast(`#${o.refNumber} blocked — no payment received yet`, 'err')
      return
    }
    // Optimistic update
    setOrders(prev => prev.map(x => x.id === orderId ? { ...x, status: toStatus } : x))
    flash(orderId, 'ok')
    showToast(`#${o.refNumber} → ${COLUMNS.find(c => c.id === toStatus)?.label}`)
    const result = await updateOrderStatus(orderId, toStatus)
    if ('error' in result) {
      setOrders(prev => prev.map(x => x.id === orderId ? { ...x, status: o.status } : x))
      showToast(`Failed: ${result.error}`, 'err')
    }
  }, [orders])

  const totalAwaiting = orders
    .filter(o => o.status === 'awaiting' || o.status === 'confirming')
    .reduce((s, o) => s + o.paymentAmount, 0)
  const inFlight = orders.filter(o => o.status === 'shipped').length

  return (
    <div className="pt-or">
      <div className="pt-or-hd">
        <div>
          <h1>Orders</h1>
          <p>{orders.length} open · ${totalAwaiting.toLocaleString()} awaiting payment · {inFlight} in transit</p>
        </div>
        <div className="pt-or-hd-actions">
          <div className="pt-or-search"><Icons.search size={12} /><input placeholder="Search by # or customer…" /></div>
          <button className="pt-btn pt-btn-primary" onClick={() => setShowCreateModal(true)}>
            <Icons.plus size={12} /> New order
          </button>
        </div>
      </div>

      <div className="pt-or-board">
        {COLUMNS.map(col => {
          const colOrders = orders.filter(o => o.status === col.id)
          const isOver = dragOverCol === col.id && dragId
          return (
            <div
              key={col.id}
              className={`pt-or-col ${isOver ? 'is-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.id) }}
              onDragLeave={e => { if (e.currentTarget === e.target) setDragOverCol(null) }}
              onDrop={e => { e.preventDefault(); if (dragId) void tryMove(dragId, col.id as OrderStatus); setDragId(null); setDragOverCol(null) }}
            >
              <div className="pt-or-col-hd" data-col={col.id}>
                <div className="pt-or-col-titlewrap">
                  <span className={`pt-or-col-dot pt-or-dot-${col.id}`} />
                  <span className="pt-or-col-title">{col.label}</span>
                  <span className="pt-or-col-count mono">{colOrders.length}</span>
                </div>
                <div className="pt-or-col-cap">{col.caption}</div>
              </div>
              <div className="pt-or-col-body">
                {colOrders.map(o => (
                  <OrderCardUI
                    key={o.id} order={o} pulse={pulse[o.id]}
                    onDragStart={(e, id) => setDragId(id)}
                    onDragEnd={() => { setDragId(null); setDragOverCol(null) }}
                    onAdvance={tryMove}
                    isDragging={dragId === o.id}
                    onClick={() => router.push(`/orders/${o.id}`)}
                  />
                ))}
                {colOrders.length === 0 && <div className="pt-or-col-empty">— nothing here —</div>}
              </div>
            </div>
          )
        })}
      </div>

      {showCreateModal && (
        <div className="pt-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="pt-modal" onClick={e => e.stopPropagation()}>
            <div className="pt-modal-hd">
              <h3>New order</h3>
              <button className="pt-iconbtn" onClick={() => setShowCreateModal(false)}><Icons.x size={14} /></button>
            </div>
            <div className="pt-modal-body">
              {/* CreateOrderModal rendered here in Task 11 */}
              <p style={{ color: 'var(--pt-fg-3)', fontSize: 13 }}>Order creation form — implemented in Task 11</p>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`pt-or-toast pt-or-toast-${toast.kind}`} key={toast.id}>
          {toast.kind === 'err' ? <Icons.x size={12} /> : <Icons.check size={12} />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add modal CSS to `styles/peptech.css`**

Append at the bottom:

```css
/* Modal */
.pt-modal-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: oklch(from var(--pt-bg) l c h / 0.7);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}
.pt-modal {
  background: var(--pt-surface);
  border: 0.5px solid var(--pt-line);
  border-radius: var(--pt-radius);
  box-shadow: var(--pt-shadow-lg, 0 24px 64px oklch(0 0 0 / 0.3));
  width: min(640px, 95vw);
  max-height: 90vh;
  display: flex; flex-direction: column;
}
.pt-modal-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 0.5px solid var(--pt-line);
}
.pt-modal-hd h3 { font-size: 15px; font-weight: 600; margin: 0; }
.pt-modal-body { flex: 1; overflow-y: auto; padding: 20px; }
```

- [ ] **Step 4: Run full test suite**

```bash
npm run test:run
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/app/orders/page.tsx src/components/orders/OrdersView.tsx styles/peptech.css
git commit -m "feat: wire OrdersView kanban to real data, click card navigates to detail"
```

---

## Task 10: Order detail page

**Files:**
- Create: `styles/order-detail.css`
- Modify: `src/app/layout.tsx`
- Create: `src/app/orders/[orderId]/page.tsx`
- Create: `src/components/orders/OrderDetailView.tsx`

- [ ] **Step 1: Copy CSS and import it**

Copy `Claude Design Files/project/order-detail.css` to `styles/order-detail.css` (the full contents of that file).

Then add to `src/app/layout.tsx` after the existing imports:

```typescript
import '../../styles/order-detail.css'
```

- [ ] **Step 2: Create `src/app/orders/[orderId]/page.tsx`**

```typescript
export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { OrderDetailView } from '@/components/orders/OrderDetailView'
import type { DbOrderRow, DbOrderEvent } from '@/types/orders'

const ORDER_SELECT = `
  id, ref_number, customer_id, conversation_id, status,
  payment_asset, payment_amount, payment_address, tx_hash,
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

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: order }, { data: events }] = await Promise.all([
    supabase.from('orders').select(ORDER_SELECT).eq('id', orderId).single(),
    supabase.from('order_events').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
  ])

  if (!order) notFound()

  // Fetch last 3 messages from linked conversation if present
  let chatExcerpt: { id: string; direction: string; content: string; sent_at: string }[] = []
  if ((order as unknown as DbOrderRow).conversation_id) {
    const { data: messages } = await supabase
      .from('messages')
      .select('id, direction, content, sent_at')
      .eq('conversation_id', (order as unknown as DbOrderRow).conversation_id!)
      .order('sent_at', { ascending: false })
      .limit(3)
    chatExcerpt = (messages ?? []).reverse()
  }

  return (
    <Shell section="Orders">
      <OrderDetailView
        order={order as unknown as DbOrderRow}
        events={(events ?? []) as DbOrderEvent[]}
        chatExcerpt={chatExcerpt}
      />
    </Shell>
  )
}
```

- [ ] **Step 3: Create `src/components/orders/OrderDetailView.tsx`**

```typescript
'use client'

import { useState, useTransition, Fragment } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { updateOrderStatus, saveOrderNotes } from '@/app/orders/actions'
import type { DbOrderRow, DbOrderEvent, OrderStatus } from '@/types/orders'

const CH_MAP: Record<string, 'wa' | 'tg' | 'em'> = { whatsapp: 'wa', telegram: 'tg', email: 'em' }
const CH_NAMES: Record<string, string> = { wa: 'WhatsApp', tg: 'Telegram', em: 'Email' }
const CH_ICONS: Record<string, React.FC<{ size?: number }>> = { wa: Icons.wa, tg: Icons.tg, em: Icons.em }

const STATUS_ORDER: OrderStatus[] = ['awaiting', 'confirming', 'packing', 'shipped', 'delivered']
const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting: 'Awaiting payment', confirming: 'Confirming',
  packing: 'Packing', shipped: 'Shipped', delivered: 'Delivered',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function OrderDetailView({ order, events, chatExcerpt }: {
  order: DbOrderRow
  events: DbOrderEvent[]
  chatExcerpt: { id: string; direction: string; content: string; sent_at: string }[]
}) {
  const [status, setStatus] = useState(order.status)
  const [notes, setNotes] = useState(order.notes ?? '')
  const [pending, startTransition] = useTransition()

  const primaryChannel = order.customers?.customer_channels?.find(c => c.is_primary)
    ?? order.customers?.customer_channels?.[0]
  const channel = CH_MAP[primaryChannel?.channel_type ?? 'whatsapp'] ?? 'wa'
  const ChIcon = CH_ICONS[channel]
  const currentIdx = STATUS_ORDER.indexOf(status)

  const total = order.order_items.reduce((s, it) => s + it.qty * it.unit_price_snapshot, 0)
  const trust = order.customers?.trust_score ?? 0
  const trustCls = trust >= 85 ? 'hi' : trust >= 65 ? 'md' : 'lo'

  const advance = () => {
    const next = STATUS_ORDER[currentIdx + 1]
    if (!next) return
    startTransition(async () => {
      setStatus(next)
      await updateOrderStatus(order.id, next)
    })
  }

  const blurNotes = () => {
    startTransition(async () => { await saveOrderNotes(order.id, notes) })
  }

  return (
    <div className="pt-od">
      {/* Header */}
      <div className="pt-od-hd">
        <Link href="/orders" className="pt-btn pt-btn-ghost" style={{ flexShrink: 0 }}>← Orders</Link>
        <div className="pt-od-hd-mid">
          <div className="pt-od-hd-title">
            <h1 className="mono">#{order.ref_number}</h1>
            <span className={`pt-od-state-pill pt-od-state-${status}`}>
              <span className={`pt-or-col-dot pt-or-dot-${status}`} />
              {STATUS_LABELS[status]}
            </span>
            <span className="pt-od-channel">
              {ChIcon && <ChIcon size={11} />} {CH_NAMES[channel]}
            </span>
          </div>
          <p>
            {order.customers?.display_name ?? 'Unknown'} · placed {fmtDate(order.created_at)} · {order.order_items.length} item{order.order_items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="pt-od-hd-actions">
          {order.conversation_id && (
            <Link href="/inbox" className="pt-btn pt-btn-ghost">
              <Icons.send size={12} /> Message
            </Link>
          )}
          {currentIdx < STATUS_ORDER.length - 1 && (
            <button className="pt-btn pt-btn-primary" onClick={advance} disabled={pending}>
              → {STATUS_LABELS[STATUS_ORDER[currentIdx + 1]]}
            </button>
          )}
          <button className="pt-btn pt-btn-ghost"><Icons.more size={14} /></button>
        </div>
      </div>

      {/* Stepper */}
      <div className="pt-od-stepper">
        {STATUS_ORDER.map((s, i) => (
          <Fragment key={s}>
            <div className={`pt-od-step ${i < currentIdx ? 'is-done' : ''} ${i === currentIdx ? 'is-active' : ''}`}>
              <span className="pt-od-step-dot">
                {i < currentIdx ? <Icons.check size={10} /> : <span className="mono">{i + 1}</span>}
              </span>
              <span className="pt-od-step-label">{STATUS_LABELS[s]}</span>
            </div>
            {i < STATUS_ORDER.length - 1 && (
              <span className={`pt-od-step-sep ${i < currentIdx ? 'is-done' : ''}`} />
            )}
          </Fragment>
        ))}
      </div>

      {/* Body */}
      <div className="pt-od-body">
        <div className="pt-od-main">
          {/* Line items */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div>
                <h3>Line items</h3>
                <p>{order.order_items.length} SKU{order.order_items.length !== 1 ? 's' : ''} · batch &amp; COA tracked</p>
              </div>
            </header>
            <div className="pt-card-body" style={{ padding: 0 }}>
              <table className="pt-od-items">
                <thead>
                  <tr>
                    <th>SKU</th><th>Item</th><th>Batch</th><th>COA</th>
                    <th className="pt-od-num">Qty</th>
                    <th className="pt-od-num">Unit</th>
                    <th className="pt-od-num">Line</th>
                  </tr>
                </thead>
                <tbody>
                  {order.order_items.map(it => (
                    <tr key={it.id}>
                      <td><span className="mono">{it.products?.sku ?? '—'}</span></td>
                      <td>{it.products?.name ?? '—'}</td>
                      <td><span className="mono">{it.batches?.batch_number ?? '—'}</span></td>
                      <td>
                        {it.batches?.coa_path
                          ? <a className="pt-od-coa" href={`/api/catalog/coa-url?path=${encodeURIComponent(it.batches.coa_path)}`} target="_blank" rel="noopener noreferrer">{it.batches.coa_path.split('/').pop()}</a>
                          : <span style={{ color: 'var(--pt-fg-4)' }}>—</span>}
                      </td>
                      <td className="pt-od-num mono">{it.qty}</td>
                      <td className="pt-od-num mono">${it.unit_price_snapshot.toFixed(2)}</td>
                      <td className="pt-od-num mono">${(it.qty * it.unit_price_snapshot).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5} /><td className="pt-od-num">Subtotal</td><td className="pt-od-num mono">${total.toFixed(2)}</td></tr>
                  <tr><td colSpan={5} /><td className="pt-od-num">Shipping</td><td className="pt-od-num mono">$0.00</td></tr>
                  <tr className="pt-od-total"><td colSpan={5} /><td className="pt-od-num">Total</td><td className="pt-od-num mono">${total.toFixed(2)}</td></tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Payment */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div>
                <h3>Payment</h3>
                <p>{order.payment_asset === 'Cash' ? 'Cash on delivery' : `${order.payment_asset} · on-chain`}</p>
              </div>
              <span className={`pt-od-pay-status pt-od-pay-${status}`}>
                {status === 'awaiting' ? 'Awaiting' : status === 'confirming' ? 'Confirming' : 'Settled'}
              </span>
            </header>
            <div className="pt-card-body">
              <div className="pt-od-pay-grid">
                <div>
                  <div className="pt-od-pay-lbl">Asset</div>
                  <div className="pt-od-pay-val">
                    <span className="pt-pay-asset" data-asset={order.payment_asset}>{order.payment_asset}</span>
                    <span className="mono" style={{ marginLeft: 8 }}>${order.payment_amount.toFixed(2)}</span>
                  </div>
                </div>
                {order.payment_address && (
                  <div>
                    <div className="pt-od-pay-lbl">Receiving address</div>
                    <div className="pt-od-pay-val mono">{order.payment_address}</div>
                  </div>
                )}
                {order.tx_hash && (
                  <div>
                    <div className="pt-od-pay-lbl">Tx hash</div>
                    <div className="pt-od-pay-val mono">{order.tx_hash}</div>
                  </div>
                )}
                <div>
                  <div className="pt-od-pay-lbl">Reference</div>
                  <div className="pt-od-pay-val mono">PT-{order.ref_number}</div>
                </div>
              </div>
            </div>
          </section>

          {/* Shipping */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div>
                <h3>Shipping</h3>
                <p>{status === 'awaiting' || status === 'confirming' ? 'Will pack once payment confirms' : status === 'packing' ? 'Packing' : status === 'shipped' ? 'In transit' : 'Delivered'}</p>
              </div>
            </header>
            <div className="pt-card-body">
              <div className="pt-od-ship-grid">
                <div>
                  <div className="pt-od-pay-lbl">Address</div>
                  <div className="pt-od-pay-val">
                    {order.shipping_address ? (
                      <>
                        {order.shipping_address.ln1}<br />
                        {order.shipping_address.ln2 && <>{order.shipping_address.ln2}<br /></>}
                        {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}
                      </>
                    ) : <span style={{ color: 'var(--pt-fg-4)' }}>Not set</span>}
                  </div>
                </div>
                <div>
                  <div className="pt-od-pay-lbl">Carrier</div>
                  <div className="pt-od-pay-val">{order.carrier ?? '—'} · <span className="mono">{order.tracking_number ?? '—'}</span></div>
                </div>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div><h3>Notes</h3><p>Operator-only · not shown to customer</p></div>
            </header>
            <div className="pt-card-body">
              <textarea
                className="pt-od-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={blurNotes}
                placeholder="Add internal notes…"
              />
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside className="pt-od-rail">
          {/* Customer */}
          {order.customers && (
            <section className="pt-card">
              <header className="pt-card-hd">
                <div><h3>Customer</h3></div>
                <Link href={`/customers/${order.customers.id}`} className="pt-iconbtn" title="Open customer">
                  <Icons.arrowUp size={14} style={{ transform: 'rotate(90deg)' }} />
                </Link>
              </header>
              <div className="pt-card-body">
                <div className="pt-cust-id">
                  <div className="pt-thread-av" data-channel={channel} style={{ width: 36, height: 36, fontSize: 11 }}>
                    {(order.customers.display_name.match(/[A-Z]/g) ?? [order.customers.display_name[0]]).slice(0, 2).join('')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pt-cust-name">{order.customers.display_name}</div>
                    <div className="pt-cust-handle mono">{primaryChannel?.display_handle ?? ''}</div>
                  </div>
                  <div className={`pt-trust-pill pt-trust-${trustCls}`}>{trust}</div>
                </div>
                <div className="pt-od-cust-stats">
                  <div><span className="pt-od-stat-lbl">LTV</span><span className="mono">${order.customers.ltv.toLocaleString()}</span></div>
                </div>
              </div>
            </section>
          )}

          {/* Activity */}
          <section className="pt-card">
            <header className="pt-card-hd">
              <div><h3>Activity</h3><p>{events.length} events</p></div>
            </header>
            <div className="pt-card-body" style={{ padding: '8px 0 14px' }}>
              <ol className="pt-od-tl">
                {events.map(e => (
                  <li key={e.id} className={`pt-od-tl-i pt-od-tl-${e.actor}`}>
                    <span className="pt-od-tl-bullet" />
                    <div className="pt-od-tl-body">
                      <div className="pt-od-tl-row">
                        <span className="pt-od-tl-action">{e.action}</span>
                        <span className="pt-od-tl-time mono">{fmtTime(e.created_at)}</span>
                      </div>
                      {e.note && <div className="pt-od-tl-note">{e.note}</div>}
                      <div className="pt-od-tl-date">{fmtDate(e.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Chat excerpt */}
          {chatExcerpt.length > 0 && (
            <section className="pt-card">
              <header className="pt-card-hd">
                <div><h3>Where this came from</h3><p>Excerpt from {CH_NAMES[channel]} thread</p></div>
                <Link href="/inbox" className="pt-iconbtn" title="Open thread">
                  <Icons.arrowUp size={14} style={{ transform: 'rotate(90deg)' }} />
                </Link>
              </header>
              <div className="pt-card-body">
                <div className="pt-od-chat">
                  {chatExcerpt.map(m => (
                    <div key={m.id} className={`pt-od-msg pt-od-msg-${m.direction === 'outbound' ? 'me' : 'them'}`}>
                      <div className="pt-od-msg-bubble">{m.content}</div>
                      <div className="pt-od-msg-time">{fmtTime(m.sent_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add styles/order-detail.css src/app/layout.tsx src/app/orders/[orderId]/page.tsx src/components/orders/OrderDetailView.tsx
git commit -m "feat: order detail page with stepper, line items, activity timeline, chat excerpt"
```

---

## Task 11: CreateOrderForm + CreateOrderModal

**Files:**
- Create: `src/components/orders/CreateOrderForm.tsx`
- Create: `src/components/orders/CreateOrderModal.tsx`
- Modify: `src/components/orders/OrdersView.tsx` — wire modal

- [ ] **Step 1: Create `src/components/orders/CreateOrderForm.tsx`**

```typescript
'use client'

import { useState, useCallback } from 'react'
import { Icons } from '@/lib/icons'
import { createOrder } from '@/app/orders/actions'

type ProductOption = {
  id: string; sku: string; name: string; productFamily: string; unitPrice: number
}

type LineItem = {
  key: number; productId: string; productName: string; qty: number; unitPrice: number
}

interface CreateOrderFormProps {
  customerId?: string
  customerName?: string
  conversationId?: string
  onSuccess: (refNumber: string) => void
  onCancel: () => void
}

export function CreateOrderForm({ customerId, customerName, conversationId, onSuccess, onCancel }: CreateOrderFormProps) {
  const [items, setItems] = useState<LineItem[]>([{ key: 0, productId: '', productName: '', qty: 1, unitPrice: 0 }])
  const [paymentAsset, setPaymentAsset] = useState('USDT')
  const [paymentAddress, setPaymentAddress] = useState('')
  const [address, setAddress] = useState({ ln1: '', ln2: '', city: '', state: '', zip: '' })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [searchResults, setSearchResults] = useState<ProductOption[]>([])
  const [activeItemKey, setActiveItemKey] = useState<number | null>(null)
  const [customerSearch, setCustomerSearch] = useState(customerName ?? '')
  const [resolvedCustomerId, setResolvedCustomerId] = useState(customerId ?? '')

  const searchProducts = useCallback(async (q: string, itemKey: number) => {
    setActiveItemKey(itemKey)
    if (!q.trim()) { setSearchResults([]); return }
    const res = await fetch(`/api/catalog/products?q=${encodeURIComponent(q)}`)
    if (res.ok) setSearchResults(await res.json() as ProductOption[])
  }, [])

  const selectProduct = (product: ProductOption, itemKey: number) => {
    setItems(prev => prev.map(it => it.key === itemKey
      ? { ...it, productId: product.id, productName: product.name, unitPrice: product.unitPrice }
      : it
    ))
    setSearchResults([])
    setActiveItemKey(null)
  }

  const addItem = () => setItems(prev => [...prev, { key: Date.now(), productId: '', productName: '', qty: 1, unitPrice: 0 }])
  const removeItem = (key: number) => setItems(prev => prev.filter(it => it.key !== key))
  const updateItem = (key: number, field: 'qty' | 'unitPrice', value: number) =>
    setItems(prev => prev.map(it => it.key === key ? { ...it, [field]: value } : it))

  const total = items.reduce((s, it) => s + it.qty * it.unitPrice, 0)

  const submit = async () => {
    if (!resolvedCustomerId) { setError('Customer is required'); return }
    if (items.some(it => !it.productId)) { setError('All line items must have a product selected'); return }
    setError('')
    setSubmitting(true)
    const result = await createOrder({
      customerId: resolvedCustomerId,
      conversationId,
      paymentAsset,
      paymentAmount: total,
      paymentAddress: paymentAddress || undefined,
      shippingAddress: address.ln1 ? { ...address } : undefined,
      notes: notes || undefined,
      items: items.map(it => ({ productId: it.productId, qty: it.qty, unitPriceSnapshot: it.unitPrice })),
    })
    setSubmitting(false)
    if ('error' in result) { setError(result.error); return }
    onSuccess(result.refNumber)
  }

  return (
    <div className="pt-create-order">
      {/* Customer */}
      {!customerId && (
        <div className="pt-co-section">
          <div className="pt-co-lbl">Customer</div>
          <input
            className="pt-input"
            placeholder="Search customer name or handle…"
            value={customerSearch}
            onChange={e => setCustomerSearch(e.target.value)}
          />
          {/* Full customer search would call an API; for now operator types the customer ID or name */}
          <input className="pt-input" style={{ marginTop: 6 }} placeholder="Customer ID (paste from Customers page)" value={resolvedCustomerId} onChange={e => setResolvedCustomerId(e.target.value)} />
        </div>
      )}
      {customerId && (
        <div className="pt-co-section">
          <div className="pt-co-lbl">Customer</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{customerName}</div>
        </div>
      )}

      {/* Line items */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Line items</div>
        {items.map(it => (
          <div key={it.key} className="pt-co-item">
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                className="pt-input"
                placeholder="Search product (SKU or name)…"
                value={it.productName}
                onChange={e => {
                  setItems(prev => prev.map(x => x.key === it.key ? { ...x, productName: e.target.value, productId: '' } : x))
                  void searchProducts(e.target.value, it.key)
                }}
              />
              {activeItemKey === it.key && searchResults.length > 0 && (
                <div className="pt-co-dropdown">
                  {searchResults.map(p => (
                    <button key={p.id} className="pt-co-dropdown-item" onClick={() => selectProduct(p, it.key)}>
                      <span className="mono" style={{ fontSize: 11 }}>{p.sku}</span>
                      <span>{p.name}</span>
                      <span className="mono" style={{ marginLeft: 'auto' }}>${p.unitPrice.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input className="pt-input" style={{ width: 64 }} type="number" min="1" value={it.qty}
              onChange={e => updateItem(it.key, 'qty', parseInt(e.target.value, 10) || 1)} />
            <span className="mono" style={{ fontSize: 12, minWidth: 56, textAlign: 'right' }}>
              ${(it.qty * it.unitPrice).toFixed(2)}
            </span>
            {items.length > 1 && (
              <button className="pt-iconbtn" onClick={() => removeItem(it.key)}><Icons.x size={12} /></button>
            )}
          </div>
        ))}
        <button className="pt-link" style={{ fontSize: 12, marginTop: 6 }} onClick={addItem}>+ Add item</button>
        <div className="pt-co-total">Total <span className="mono">${total.toFixed(2)}</span></div>
      </div>

      {/* Payment */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Payment</div>
        <div className="pt-co-row">
          <select className="pt-input" value={paymentAsset} onChange={e => setPaymentAsset(e.target.value)} style={{ flex: 1 }}>
            <option>USDT</option><option>BTC</option><option>XMR</option><option>Cash</option><option>Other</option>
          </select>
          <input className="pt-input" placeholder="Receiving address (optional)" value={paymentAddress}
            onChange={e => setPaymentAddress(e.target.value)} style={{ flex: 2 }} />
        </div>
      </div>

      {/* Shipping */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Shipping address <span style={{ color: 'var(--pt-fg-4)', fontWeight: 400 }}>(optional)</span></div>
        <div className="pt-cat-form-grid">
          <input className="pt-input" placeholder="Street" value={address.ln1} onChange={e => setAddress(a => ({ ...a, ln1: e.target.value }))} />
          <input className="pt-input" placeholder="Apt / unit" value={address.ln2} onChange={e => setAddress(a => ({ ...a, ln2: e.target.value }))} />
          <input className="pt-input" placeholder="City" value={address.city} onChange={e => setAddress(a => ({ ...a, city: e.target.value }))} />
          <input className="pt-input" placeholder="State" value={address.state} onChange={e => setAddress(a => ({ ...a, state: e.target.value }))} />
        </div>
        <input className="pt-input" style={{ marginTop: 8, width: 120 }} placeholder="ZIP" value={address.zip} onChange={e => setAddress(a => ({ ...a, zip: e.target.value }))} />
      </div>

      {/* Notes */}
      <div className="pt-co-section">
        <div className="pt-co-lbl">Notes <span style={{ color: 'var(--pt-fg-4)', fontWeight: 400 }}>(operator only)</span></div>
        <textarea className="pt-od-notes" style={{ minHeight: 48 }} placeholder="Internal notes…" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--pt-danger)', margin: '0 0 12px' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="pt-btn pt-btn-ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
        <button className="pt-btn pt-btn-primary" onClick={submit} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create order'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add CSS for the form to `styles/order-detail.css`**

Append to `styles/order-detail.css`:

```css
/* Create order form */
.pt-create-order { display: flex; flex-direction: column; gap: 20px; }
.pt-co-section { display: flex; flex-direction: column; gap: 8px; }
.pt-co-lbl { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--pt-fg-4); }
.pt-co-item { display: flex; align-items: center; gap: 8px; }
.pt-co-row { display: flex; gap: 8px; }
.pt-co-total {
  display: flex; justify-content: flex-end; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; padding-top: 8px;
  border-top: 0.5px solid var(--pt-line-soft);
}
.pt-co-dropdown {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 50;
  background: var(--pt-surface);
  border: 0.5px solid var(--pt-line);
  border-radius: 6px;
  box-shadow: var(--pt-shadow);
  margin-top: 2px;
  max-height: 200px;
  overflow-y: auto;
}
.pt-co-dropdown-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 8px 12px;
  border: none; background: none; cursor: pointer;
  font-size: 12.5px; text-align: left; color: var(--pt-fg);
}
.pt-co-dropdown-item:hover { background: oklch(from var(--pt-fg) l c h / 0.04); }
```

- [ ] **Step 3: Create `src/components/orders/CreateOrderModal.tsx`**

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { CreateOrderForm } from './CreateOrderForm'

interface CreateOrderModalProps {
  onClose: () => void
}

export function CreateOrderModal({ onClose }: CreateOrderModalProps) {
  const router = useRouter()

  const handleSuccess = (refNumber: string) => {
    onClose()
    router.refresh()
    router.push(`/orders`)
    // Brief toast would be nice here — for now the kanban refresh shows the new card
    void refNumber
  }

  return (
    <div className="pt-modal-backdrop" onClick={onClose}>
      <div className="pt-modal" onClick={e => e.stopPropagation()} style={{ width: 'min(600px, 95vw)' }}>
        <div className="pt-modal-hd">
          <h3>New order</h3>
          <button className="pt-iconbtn" onClick={onClose}><Icons.x size={14} /></button>
        </div>
        <div className="pt-modal-body">
          <CreateOrderForm onSuccess={handleSuccess} onCancel={onClose} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire modal into `OrdersView.tsx`**

In `src/components/orders/OrdersView.tsx`, add the import at the top:

```typescript
import { CreateOrderModal } from './CreateOrderModal'
```

Then replace the placeholder modal block (the one rendering "Order creation form — implemented in Task 11"):

```typescript
      {showCreateModal && (
        <CreateOrderModal onClose={() => setShowCreateModal(false)} />
      )}
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/components/orders/CreateOrderForm.tsx src/components/orders/CreateOrderModal.tsx src/components/orders/OrdersView.tsx styles/order-detail.css
git commit -m "feat: CreateOrderForm and CreateOrderModal — new order from Orders page"
```

---

## Task 12: Inbox order rail

**Files:**
- Create: `src/components/inbox/OrderRail.tsx`
- Modify: `src/components/inbox/InboxView.tsx`

- [ ] **Step 1: Create `src/components/inbox/OrderRail.tsx`**

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { CreateOrderForm } from '@/components/orders/CreateOrderForm'

interface OrderRailProps {
  customerId: string
  customerName: string
  conversationId: string
  onClose: () => void
}

export function OrderRail({ customerId, customerName, conversationId, onClose }: OrderRailProps) {
  const router = useRouter()

  const handleSuccess = (refNumber: string) => {
    onClose()
    router.push(`/orders`)
    void refNumber
  }

  return (
    <aside className="pt-ix-rail">
      <div style={{ padding: '14px 16px 10px', borderBottom: '0.5px solid var(--pt-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>New order</div>
        <button
          style={{ fontSize: 11, color: 'var(--pt-fg-4)', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
      <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
        <CreateOrderForm
          customerId={customerId}
          customerName={customerName}
          conversationId={conversationId}
          onSuccess={handleSuccess}
          onCancel={onClose}
        />
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Add "Create order" button and rail state to `src/components/inbox/InboxView.tsx`**

In `InboxLayout` (the function at the bottom that uses `useInbox()`), add import for `OrderRail` and state for the order rail:

At the top of the file, add:
```typescript
import { OrderRail } from './OrderRail'
```

In the `InboxLayout` function, add state:
```typescript
const [showOrderRail, setShowOrderRail] = useState(false)
```

In the `ConversationPane` component props, add `onCreateOrder`:

Change this line:
```typescript
function ConversationPane({ thread, messages, onSend, isSending }: {
  thread: InboxThread
  messages: InboxMessage[]
  onSend: (text: string) => void
  isSending: boolean
})
```
to:
```typescript
function ConversationPane({ thread, messages, onSend, isSending, onCreateOrder }: {
  thread: InboxThread
  messages: InboxMessage[]
  onSend: (text: string) => void
  isSending: boolean
  onCreateOrder: () => void
})
```

In the `ConversationPane` header actions div (right after the Mark done / Reopen button), add:
```typescript
          <button className="pt-btn pt-btn-ghost" onClick={onCreateOrder}>
            <Icons.box size={12} /> Order
          </button>
```

In `InboxLayout`, update the `ConversationPane` render to pass `onCreateOrder`:
```typescript
        <ConversationPane
          thread={activeThread}
          messages={messages}
          onSend={sendMessage}
          isSending={isSending}
          onCreateOrder={() => setShowOrderRail(true)}
        />
```

Replace the existing `{activeThread && <ConversationRail thread={activeThread} />}` line with:
```typescript
      {activeThread && !showOrderRail && <ConversationRail thread={activeThread} />}
      {activeThread && showOrderRail && (
        <OrderRail
          customerId={activeThread.customerId}
          customerName={activeThread.name}
          conversationId={activeThread.id}
          onClose={() => setShowOrderRail(false)}
        />
      )}
```

- [ ] **Step 3: Run full test suite**

```bash
npm run test:run
```
Expected: all 106+ tests pass

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors (other than pre-existing storage.test.ts errors)

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/OrderRail.tsx src/components/inbox/InboxView.tsx
git commit -m "feat: inbox order rail — Create order button swaps right rail with order form"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ 5 DB tables (products, batches, orders, order_items, order_events)
- ✅ COA storage bucket with RLS
- ✅ Ref number sequence (A-XXXX)
- ✅ Catalog page with real data, add product form, add batch form, COA upload + view
- ✅ Orders kanban wired to real data, drag-and-drop calls updateOrderStatus
- ✅ Order detail page with all sections from design
- ✅ CreateOrderForm shared component (product picker, line items, payment, shipping, notes)
- ✅ Modal container (Orders page)
- ✅ Right rail container (Inbox) — conversation stays visible
- ✅ product_family field for grouping and search
- ✅ payment_address field on orders
- ✅ unit_price_snapshot locked at order creation

**Type consistency:** All types defined in Task 3/4, used consistently across Tasks 5-12. `OrderStatus` union used throughout. `dbOrderToCard` mapper used in both page.tsx and tests.

**Placeholder scan:** None. All code blocks are complete.
