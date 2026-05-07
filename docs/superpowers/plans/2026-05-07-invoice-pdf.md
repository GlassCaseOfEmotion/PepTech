# Invoice PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a PDF invoice from an order and pre-load it into the inbox message composer so the operator can attach it to a customer chat message with one click.

**Architecture:** When the operator clicks "Send Invoice" on an order, a preview modal shows the invoice contents; confirming calls `POST /api/invoices/generate` which renders the PDF with `@react-pdf/renderer`, uploads it to Supabase Storage (`invoices` bucket), and creates an `invoices` DB record. The modal then navigates to `/inbox?conversation=<id>&invoice_path=<path>&invoice_name=<name>` where the Composer pre-loads the PDF as a pending attachment. The operator types an optional message and clicks Send, which calls `POST /api/invoices/send` to dispatch the file via WhatsApp/Telegram.

**Tech Stack:** `@react-pdf/renderer` (PDF generation), Supabase Storage (PDF + logo storage), Next.js App Router API routes, Vitest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/*_invoices.sql` | Create | `invoices` table, `logo_path` on tenants, storage buckets |
| `src/lib/channels/telegram.ts` | Modify | Add `sendTelegramDocument` |
| `src/lib/channels/__tests__/telegram.test.ts` | Modify | Tests for sendTelegramDocument |
| `src/components/invoices/InvoicePDF.tsx` | Create | @react-pdf/renderer invoice layout component |
| `src/types/invoices.ts` | Create | `InvoiceData` type + `buildInvoiceData` + `formatInvoiceNumber` |
| `src/app/api/invoices/generate/route.ts` | Create | Generate PDF, upload, create invoice record |
| `src/app/api/invoices/send/route.ts` | Create | Send PDF via channel |
| `src/app/settings/branding/page.tsx` | Create | Tenant logo upload + business name |
| `src/app/settings/branding/actions.ts` | Create | `saveBranding` server action |
| `src/components/settings/SettingsNav.tsx` | Modify | Add Branding nav item |
| `src/components/orders/SendInvoiceModal.tsx` | Create | Preview modal + generate + navigate |
| `src/components/orders/OrderDetailView.tsx` | Modify | Add "Send Invoice" button |
| `src/app/inbox/page.tsx` | Modify | Read `invoice_path` + `invoice_name` searchParams |
| `src/components/inbox/InboxView.tsx` | Modify | Accept + forward invoice props; Composer handles PDF attachment |
| `src/components/inbox/InboxProvider.tsx` | Modify | Expose `pendingInvoicePath` + `pendingInvoiceName` in context |

---

## Task 1: DB migration — invoices table, logo_path, storage buckets

**Files:**
- Create: `supabase/migrations/<timestamp>_invoices.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add logo_path to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_path text;

-- Invoices table
CREATE TABLE invoices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id    uuid NOT NULL REFERENCES orders(id)  ON DELETE CASCADE,
  invoice_number text NOT NULL,
  pdf_path    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_invoices" ON invoices
  FOR ALL USING (tenant_id = auth_tenant_id());

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('invoices', 'invoices', false, 5242880, ARRAY['application/pdf']),
  ('logos',    'logos',    true,  2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- invoices bucket: tenant-scoped RLS
CREATE POLICY "tenant_invoices_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'invoices' AND (storage.foldername(name))[1] = (auth_tenant_id())::text);

CREATE POLICY "tenant_invoices_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoices' AND (storage.foldername(name))[1] = (auth_tenant_id())::text);

-- logos bucket: tenant-scoped write, public read
CREATE POLICY "tenant_logos_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = (auth_tenant_id())::text);

CREATE POLICY "tenant_logos_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = (auth_tenant_id())::text);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push --include-all
```

Expected: migration applied, no errors.

- [ ] **Step 3: Verify**

```bash
npx supabase db push --include-all --dry-run
```

Expected: "No pending migrations"

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: invoices table, logo_path on tenants, invoices+logos storage buckets"
```

---

## Task 2: `sendTelegramDocument` channel function

**Files:**
- Modify: `src/lib/channels/telegram.ts`
- Modify: `src/lib/channels/__tests__/telegram.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/channels/__tests__/telegram.test.ts`:

```typescript
describe('sendTelegramDocument', () => {
  it('POSTs to sendDocument with document field and filename', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await sendTelegramDocument('bot-token', '11223344', new Blob(['%PDF']), 'INV-A-1001.pdf')
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.telegram.org/botbot-token/sendDocument')
    const body = opts.body as FormData
    expect(body.get('chat_id')).toBe('11223344')
    expect(body.get('document')).toBeInstanceOf(Blob)
  })

  it('includes business_connection_id when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await sendTelegramDocument('tok', '999', new Blob(['x']), 'inv.pdf', 'biz-conn-1')
    const body = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData
    expect(body.get('business_connection_id')).toBe('biz-conn-1')
  })

  it('throws when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }))
    await expect(
      sendTelegramDocument('tok', '123', new Blob(['x']), 'inv.pdf')
    ).rejects.toThrow('Telegram sendDocument failed: 400')
  })
})
```

Import `sendTelegramDocument` at the top of the test file (it doesn't exist yet — this test will fail).

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/lib/channels/__tests__/telegram.test.ts
```

Expected: FAIL — `sendTelegramDocument is not a function`

- [ ] **Step 3: Implement `sendTelegramDocument` in `src/lib/channels/telegram.ts`**

Add after `sendTelegramPhoto`:

```typescript
export async function sendTelegramDocument(
  botToken: string,
  chatId: string,
  document: Blob,
  filename: string,
  businessConnectionId?: string,
): Promise<void> {
  const form = new FormData()
  form.append('chat_id', chatId)
  form.append('document', document, filename)
  if (businessConnectionId) form.append('business_connection_id', businessConnectionId)

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(`Telegram sendDocument failed: ${res.status}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/lib/channels/__tests__/telegram.test.ts
```

Expected: all telegram tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/channels/telegram.ts src/lib/channels/__tests__/telegram.test.ts
git commit -m "feat: add sendTelegramDocument channel function"
```

---

## Task 3: InvoiceData type + InvoicePDF component

**Files:**
- Create: `src/types/invoices.ts`
- Create: `src/components/invoices/InvoicePDF.tsx`

- [ ] **Step 1: Install @react-pdf/renderer**

```bash
npm install @react-pdf/renderer
```

Expected: installed without errors.

- [ ] **Step 2: Write tests for invoice utility functions**

Create `src/types/__tests__/invoices.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatInvoiceNumber, buildInvoiceData } from '../invoices'

const baseOrder = {
  id: 'ord-1',
  ref_number: 'A-1001',
  payment_asset: 'USDT',
  payment_amount: 440,
  payment_address: '0xABC123',
  created_at: '2026-05-07T10:00:00Z',
  customers: { display_name: 'Alan Ambrose' },
  order_items: [
    { qty: 2, unit_price_snapshot: 220, products: { name: 'Tirzepatide 30mg', sku: 'TIRZ-30' } },
  ],
}

describe('formatInvoiceNumber', () => {
  it('prefixes order ref with INV-', () => {
    expect(formatInvoiceNumber('A-1001')).toBe('INV-A-1001')
  })
})

describe('buildInvoiceData', () => {
  it('maps order to invoice data', () => {
    const data = buildInvoiceData(baseOrder as never, 'Pep Tech', null)
    expect(data.invoiceNumber).toBe('INV-A-1001')
    expect(data.orderRef).toBe('A-1001')
    expect(data.businessName).toBe('Pep Tech')
    expect(data.logoUrl).toBeNull()
    expect(data.customerName).toBe('Alan Ambrose')
    expect(data.paymentAsset).toBe('USDT')
    expect(data.paymentAddress).toBe('0xABC123')
    expect(data.items).toHaveLength(1)
    expect(data.items[0]).toEqual({ name: 'Tirzepatide 30mg', sku: 'TIRZ-30', qty: 2, unitPrice: 220, subtotal: 440 })
    expect(data.total).toBe(440)
  })

  it('handles null payment_address', () => {
    const data = buildInvoiceData({ ...baseOrder, payment_address: null } as never, 'X', null)
    expect(data.paymentAddress).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:run -- src/types/__tests__/invoices.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/types/invoices.ts`**

```typescript
export interface InvoiceItem {
  name: string
  sku: string
  qty: number
  unitPrice: number
  subtotal: number
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
  paymentAsset: string
  paymentAddress: string | null
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
): InvoiceData {
  const items: InvoiceItem[] = order.order_items.map(it => ({
    name: it.products?.name ?? 'Product',
    sku:  it.products?.sku  ?? '—',
    qty: it.qty,
    unitPrice: it.unit_price_snapshot,
    subtotal: it.qty * it.unit_price_snapshot,
  }))
  return {
    invoiceNumber: formatInvoiceNumber(order.ref_number),
    orderRef: order.ref_number,
    issuedAt: new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    businessName,
    logoUrl,
    customerName: order.customers?.display_name ?? 'Customer',
    items,
    total: items.reduce((s, it) => s + it.subtotal, 0),
    paymentAsset: order.payment_asset,
    paymentAddress: order.payment_address,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:run -- src/types/__tests__/invoices.test.ts
```

Expected: PASS.

- [ ] **Step 6: Create `src/components/invoices/InvoicePDF.tsx`**

```tsx
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer'
import type { InvoiceData } from '@/types/invoices'

const S = StyleSheet.create({
  page:      { padding: 48, fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a1a' },
  hd:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 },
  logo:      { width: 80, height: 32, objectFit: 'contain' },
  bizName:   { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  invLabel:  { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  invNum:    { fontSize: 11, color: '#555' },
  meta:      { marginBottom: 28 },
  metaRow:   { flexDirection: 'row', gap: 40, marginBottom: 16 },
  metaLbl:   { fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.8, color: '#888', marginBottom: 3 },
  metaVal:   { fontSize: 11 },
  tblHd:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e0e0e0', paddingBottom: 6, marginBottom: 6, fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.6 },
  tblRow:    { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  colName:   { flex: 3 },
  colSku:    { flex: 1.5, color: '#888' },
  colQty:    { width: 36, textAlign: 'center' },
  colPrice:  { width: 56, textAlign: 'right' },
  colTotal:  { width: 64, textAlign: 'right' },
  totalRow:  { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, paddingTop: 8, borderTopWidth: 1.5, borderTopColor: '#1a1a1a' },
  totalLbl:  { fontSize: 11, fontFamily: 'Helvetica-Bold', marginRight: 64 },
  totalAmt:  { fontSize: 11, fontFamily: 'Helvetica-Bold', width: 64, textAlign: 'right' },
  payment:   { marginTop: 32, padding: 14, backgroundColor: '#f8f8f8', borderRadius: 4 },
  payHd:     { fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, color: '#888', marginBottom: 8 },
  payRow:    { flexDirection: 'row', gap: 8, marginBottom: 4 },
  payLbl:    { fontSize: 10, color: '#888', width: 60 },
  payVal:    { fontSize: 10, fontFamily: 'Helvetica-Bold', flex: 1 },
  footer:    { position: 'absolute', bottom: 32, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#bbb', borderTopWidth: 0.5, borderTopColor: '#e0e0e0', paddingTop: 8 },
})

const fmt = (n: number) => `$${n.toFixed(2)}`

export function InvoicePDF({ data }: { data: InvoiceData }) {
  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.hd}>
          <View>
            {data.logoUrl
              ? <Image src={data.logoUrl} style={S.logo} />
              : <Text style={S.bizName}>{data.businessName}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={S.invLabel}>Invoice</Text>
            <Text style={S.invNum}>{data.invoiceNumber}</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={S.metaRow}>
          <View>
            <Text style={S.metaLbl}>Issued</Text>
            <Text style={S.metaVal}>{data.issuedAt}</Text>
          </View>
          <View>
            <Text style={S.metaLbl}>Bill to</Text>
            <Text style={S.metaVal}>{data.customerName}</Text>
          </View>
          {data.logoUrl && (
            <View>
              <Text style={S.metaLbl}>From</Text>
              <Text style={S.metaVal}>{data.businessName}</Text>
            </View>
          )}
          <View>
            <Text style={S.metaLbl}>Order ref</Text>
            <Text style={S.metaVal}>{data.orderRef}</Text>
          </View>
        </View>

        {/* Line items table */}
        <View style={S.tblHd}>
          <Text style={S.colName}>Item</Text>
          <Text style={S.colSku}>SKU</Text>
          <Text style={S.colQty}>Qty</Text>
          <Text style={S.colPrice}>Unit</Text>
          <Text style={S.colTotal}>Total</Text>
        </View>
        {data.items.map((it, i) => (
          <View key={i} style={S.tblRow}>
            <Text style={S.colName}>{it.name}</Text>
            <Text style={S.colSku}>{it.sku}</Text>
            <Text style={S.colQty}>{it.qty}</Text>
            <Text style={S.colPrice}>{fmt(it.unitPrice)}</Text>
            <Text style={S.colTotal}>{fmt(it.subtotal)}</Text>
          </View>
        ))}
        <View style={S.totalRow}>
          <Text style={S.totalLbl}>Total</Text>
          <Text style={S.totalAmt}>{fmt(data.total)}</Text>
        </View>

        {/* Payment */}
        <View style={S.payment}>
          <Text style={S.payHd}>Payment details</Text>
          <View style={S.payRow}>
            <Text style={S.payLbl}>Asset</Text>
            <Text style={S.payVal}>{data.paymentAsset}</Text>
          </View>
          {data.paymentAddress && (
            <View style={S.payRow}>
              <Text style={S.payLbl}>Address</Text>
              <Text style={S.payVal}>{data.paymentAddress}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={S.footer}>
          <Text>{data.businessName}</Text>
          <Text>{data.invoiceNumber} · For research use only · Not for human consumption</Text>
        </View>

      </Page>
    </Document>
  )
}
```

- [ ] **Step 7: Run all tests**

```bash
npm run test:run
```

Expected: all tests pass (InvoicePDF is a render-only component — no test needed beyond type-checking).

- [ ] **Step 8: Commit**

```bash
git add src/types/invoices.ts src/types/__tests__/invoices.test.ts src/components/invoices/InvoicePDF.tsx package.json package-lock.json
git commit -m "feat: InvoiceData type, buildInvoiceData, InvoicePDF component"
```

---

## Task 4: Generate invoice API route

**Files:**
- Create: `src/app/api/invoices/generate/route.ts`

This route: fetches order + tenant branding, calls `buildInvoiceData`, renders PDF with `renderToBuffer`, uploads to `invoices` bucket, inserts invoice record, returns `{ invoiceNumber, pdfPath, signedUrl }`.

- [ ] **Step 1: Create `src/app/api/invoices/generate/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { InvoicePDF } from '@/components/invoices/InvoicePDF'
import { buildInvoiceData, formatInvoiceNumber } from '@/types/invoices'

const ORDER_SELECT = `
  id, ref_number, payment_asset, payment_amount, payment_address, created_at,
  customers ( display_name ),
  order_items ( qty, unit_price_snapshot, products ( name, sku ) )
`

export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await request.json() as { orderId?: string }
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

  const supabase = await createClient()

  // Resolve tenant
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tenantId } = { tenantId: userRow.tenant_id }

  // Fetch order (RLS ensures it belongs to tenant)
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .single()
  if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Fetch tenant branding
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, logo_path')
    .eq('id', tenantId)
    .single()

  let logoUrl: string | null = null
  if (tenant?.logo_path) {
    const { data: signed } = await supabase.storage.from('logos').createSignedUrl(tenant.logo_path, 3600)
    logoUrl = signed?.signedUrl ?? null
  }

  const invoiceData = buildInvoiceData(order as never, tenant?.name ?? 'My Business', logoUrl)

  // Render PDF
  const buffer = await renderToBuffer(React.createElement(InvoicePDF, { data: invoiceData }))

  // Upload to invoices bucket: {tenantId}/{orderId}/{invoiceNumber}.pdf
  const pdfPath = `${tenantId}/${orderId}/${invoiceData.invoiceNumber}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from('invoices')
    .upload(pdfPath, buffer, { contentType: 'application/pdf', upsert: true })
  if (uploadErr) return NextResponse.json({ error: 'PDF upload failed' }, { status: 500 })

  // Create invoice record
  await supabase.from('invoices').insert({
    tenant_id: tenantId,
    order_id: orderId,
    invoice_number: invoiceData.invoiceNumber,
    pdf_path: pdfPath,
  })

  // Return signed URL valid for 1 hour (for immediate use in composer navigation)
  const { data: signed } = await supabase.storage.from('invoices').createSignedUrl(pdfPath, 3600)

  return NextResponse.json({
    invoiceNumber: invoiceData.invoiceNumber,
    pdfPath,
    signedUrl: signed?.signedUrl ?? null,
  })
}
```

- [ ] **Step 2: Run all tests**

```bash
npm run test:run
```

Expected: all tests pass (route is not unit-tested — integration tested manually).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/invoices/generate/route.ts
git commit -m "feat: POST /api/invoices/generate — render and store invoice PDF"
```

---

## Task 5: Send invoice API route

**Files:**
- Create: `src/app/api/invoices/send/route.ts`

This route: downloads the PDF from storage, dispatches it via the conversation's channel, records the message.

- [ ] **Step 1: Create `src/app/api/invoices/send/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { sendWhatsAppMedia } from '@/lib/channels/whatsapp'
import { sendTelegramDocument } from '@/lib/channels/telegram'

export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId, invoicePath, invoiceName } =
    await request.json() as { conversationId?: string; invoicePath?: string; invoiceName?: string }

  if (!conversationId || !invoicePath || !invoiceName) {
    return NextResponse.json({ error: 'conversationId, invoicePath, invoiceName required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, tenant_id, channel_type, channel_identifier')
    .eq('id', conversationId)
    .single()
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('credentials, is_active')
    .eq('tenant_id', conv.tenant_id)
    .eq('channel_type', conv.channel_type)
    .single()
  if (!channel?.is_active) return NextResponse.json({ error: 'Channel not connected' }, { status: 422 })

  const to = conv.channel_identifier

  if (conv.channel_type === 'whatsapp') {
    const { data: signed } = await supabase.storage.from('invoices').createSignedUrl(invoicePath, 300)
    if (!signed?.signedUrl) return NextResponse.json({ error: 'Could not sign PDF URL' }, { status: 500 })
    await sendWhatsAppMedia(signed.signedUrl, to)
  } else if (conv.channel_type === 'telegram') {
    const creds = channel.credentials as { bot_token: string; business_connection_id?: string }
    const { data: blob } = await supabase.storage.from('invoices').download(invoicePath)
    if (!blob) return NextResponse.json({ error: 'Could not download invoice PDF' }, { status: 500 })
    await sendTelegramDocument(creds.bot_token, to, blob, invoiceName, creds.business_connection_id)
  } else {
    return NextResponse.json({ error: `Invoice sending not yet supported for ${conv.channel_type}` }, { status: 422 })
  }

  const { data: message } = await supabase
    .from('messages')
    .insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      direction: 'outbound',
      content: `[Invoice: ${invoiceName}]`,
      status: 'sent',
      metadata: { kind: 'invoice', invoicePath, invoiceName },
    })
    .select('id')
    .single()

  await supabase
    .from('conversations')
    .update({
      status: 'in_progress',
      last_message_at: new Date().toISOString(),
      last_message_snippet: `You: [Invoice: ${invoiceName}]`,
    })
    .eq('id', conv.id)

  return NextResponse.json({ messageId: message?.id })
}
```

- [ ] **Step 2: Run all tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/invoices/send/route.ts
git commit -m "feat: POST /api/invoices/send — dispatch invoice PDF via channel"
```

---

## Task 6: Settings → Branding page

**Files:**
- Create: `src/app/settings/branding/page.tsx`
- Create: `src/app/settings/branding/actions.ts`
- Modify: `src/components/settings/SettingsNav.tsx` (add Branding entry)

- [ ] **Step 1: Add Branding to SettingsNav**

In `src/components/settings/SettingsNav.tsx`, add after the `'wallets'` entry:

```typescript
{ id: 'branding', label: 'Branding', icon: Icons.spark, href: '/settings/branding', built: true },
```

- [ ] **Step 2: Create `src/app/settings/branding/actions.ts`**

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

export async function uploadLogo(formData: FormData): Promise<{ success: true; logoPath: string } | { error: string }> {
  const file = formData.get('logo') as File | null
  if (!file) return { error: 'No file provided' }
  if (file.size > 2 * 1024 * 1024) return { error: 'Logo must be under 2 MB' }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { error: 'Logo must be JPEG, PNG, or WebP' }
  }

  try {
    const { supabase, tenantId } = await getTenantId()
    const ext = file.name.split('.').pop() ?? 'png'
    const logoPath = `${tenantId}/logo.${ext}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadErr } = await supabase.storage
      .from('logos')
      .upload(logoPath, arrayBuffer, { contentType: file.type, upsert: true })
    if (uploadErr) return { error: uploadErr.message }

    await supabase.from('tenants').update({ logo_path: logoPath }).eq('id', tenantId)
    revalidatePath('/settings/branding')
    return { success: true, logoPath }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function removeLogo(): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { data: tenant } = await supabase.from('tenants').select('logo_path').eq('id', tenantId).single()
    if (tenant?.logo_path) {
      await supabase.storage.from('logos').remove([tenant.logo_path])
    }
    await supabase.from('tenants').update({ logo_path: null }).eq('id', tenantId)
    revalidatePath('/settings/branding')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 3: Create `src/app/settings/branding/page.tsx`**

```tsx
import { createClient, getServerUser } from '@/lib/supabase/server'
import { BrandingForm } from './BrandingForm'

export default async function BrandingPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user!.id).single()
  const { data: tenant } = await supabase.from('tenants').select('name, logo_path').eq('id', userRow!.tenant_id).single()

  let logoUrl: string | null = null
  if (tenant?.logo_path) {
    const { data: signed } = await supabase.storage.from('logos').createSignedUrl(tenant.logo_path, 3600)
    logoUrl = signed?.signedUrl ?? null
  }

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>Branding</h2>
          <p>Logo and business name shown on customer invoices.</p>
        </div>
      </div>
      <BrandingForm businessName={tenant?.name ?? ''} logoUrl={logoUrl} />
    </div>
  )
}
```

- [ ] **Step 4: Create `src/app/settings/branding/BrandingForm.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { uploadLogo, removeLogo } from './actions'

export function BrandingForm({ businessName, logoUrl }: { businessName: string; logoUrl: string | null }) {
  const [currentLogoUrl, setCurrentLogoUrl] = useState(logoUrl)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, startTransition] = useTransition()

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setSuccess('')
    const fd = new FormData()
    fd.append('logo', file)
    startTransition(async () => {
      const res = await uploadLogo(fd)
      if ('error' in res) { setError(res.error); return }
      setCurrentLogoUrl(URL.createObjectURL(file))
      setSuccess('Logo saved.')
    })
  }

  const handleRemove = () => {
    setError(''); setSuccess('')
    startTransition(async () => {
      const res = await removeLogo()
      if ('error' in res) { setError(res.error); return }
      setCurrentLogoUrl(null)
      setSuccess('Logo removed.')
    })
  }

  return (
    <section className="pt-card pt-st-card">
      <header className="pt-card-hd pt-st-card-hd">
        <div><h3>Invoice branding</h3></div>
      </header>
      <div className="pt-card-body pt-st-card-body">
        <div className="pt-st-field">
          <div className="pt-st-field-l"><label>Business name</label></div>
          <div className="pt-st-field-r">
            <input className="pt-st-input" defaultValue={businessName} disabled />
            <p style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 4 }}>Set via workspace name — contact support to change.</p>
          </div>
        </div>
        <div className="pt-st-field" style={{ marginTop: 16 }}>
          <div className="pt-st-field-l"><label>Logo</label></div>
          <div className="pt-st-field-r">
            {currentLogoUrl && (
              <img src={currentLogoUrl} alt="Current logo" style={{ height: 40, objectFit: 'contain', marginBottom: 10, display: 'block' }} />
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer' }}>
                {pending ? 'Uploading…' : currentLogoUrl ? 'Replace logo' : 'Upload logo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleUpload} disabled={pending} />
              </label>
              {currentLogoUrl && (
                <button className="pt-btn pt-btn-ghost" onClick={handleRemove} disabled={pending}>Remove</button>
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 6 }}>PNG, JPEG or WebP · max 2 MB. Shown at top-left of invoices.</p>
            {error && <p style={{ fontSize: 12, color: 'var(--pt-danger)', marginTop: 6 }}>{error}</p>}
            {success && <p style={{ fontSize: 12, color: 'var(--pt-ok)', marginTop: 6 }}>{success}</p>}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Run all tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/settings/branding/ src/components/settings/SettingsNav.tsx
git commit -m "feat: settings branding page — logo upload and preview"
```

---

## Task 7: SendInvoiceModal + OrderDetailView button

**Files:**
- Create: `src/components/orders/SendInvoiceModal.tsx`
- Modify: `src/components/orders/OrderDetailView.tsx:93-106`

- [ ] **Step 1: Create `src/components/orders/SendInvoiceModal.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import type { DbOrderRow } from '@/types/orders'
import { formatInvoiceNumber } from '@/types/invoices'

interface SendInvoiceModalProps {
  order: DbOrderRow
  onClose: () => void
}

export function SendInvoiceModal({ order, onClose }: SendInvoiceModalProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const invoiceNumber = formatInvoiceNumber(order.ref_number)
  const total = order.order_items.reduce((s, it) => s + it.qty * it.unit_price_snapshot, 0)
  const hasConversation = !!order.conversation_id

  const generate = () => {
    setError('')
    startTransition(async () => {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      if (!res.ok) {
        const { error: e } = await res.json() as { error: string }
        setError(e ?? 'Failed to generate invoice')
        return
      }
      const { pdfPath, invoiceNumber: invNum } = await res.json() as { pdfPath: string; invoiceNumber: string }
      const filename = `${invNum}.pdf`
      router.push(`/inbox?conversation=${order.conversation_id}&invoice_path=${encodeURIComponent(pdfPath)}&invoice_name=${encodeURIComponent(filename)}`)
      onClose()
    })
  }

  return (
    <div className="pt-modal-backdrop" onClick={onClose}>
      <div className="pt-modal" onClick={e => e.stopPropagation()}>
        <div className="pt-modal-hd">
          <h2>Send invoice</h2>
          <button className="pt-iconbtn" onClick={onClose}><Icons.x size={14} /></button>
        </div>
        <div className="pt-modal-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--pt-fg-3)' }}>{invoiceNumber}</span>
            <span style={{ fontSize: 12, color: 'var(--pt-fg-3)' }}>{order.customers?.display_name ?? '—'}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--pt-line)', color: 'var(--pt-fg-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ textAlign: 'left', paddingBottom: 6 }}>Item</th>
                <th style={{ textAlign: 'center', paddingBottom: 6 }}>Qty</th>
                <th style={{ textAlign: 'right', paddingBottom: 6 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items.map((it, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid var(--pt-line-soft)' }}>
                  <td style={{ padding: '7px 0' }}>{it.products?.name ?? '—'}</td>
                  <td style={{ padding: '7px 0', textAlign: 'center' }}>{it.qty}</td>
                  <td style={{ padding: '7px 0', textAlign: 'right' }} className="mono">${(it.qty * it.unit_price_snapshot).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 8, borderTop: '1.5px solid var(--pt-fg)', fontWeight: 600, fontSize: 13 }}>
            <span className="mono">${total.toFixed(2)}</span>
          </div>
          {order.payment_address && (
            <div style={{ marginTop: 14, padding: 10, background: 'var(--pt-bg-side)', borderRadius: 6, fontSize: 11.5 }}>
              <span style={{ color: 'var(--pt-fg-4)' }}>Pay via </span>
              <strong>{order.payment_asset}</strong>
              {' · '}
              <span className="mono" style={{ fontSize: 10.5, wordBreak: 'break-all' }}>{order.payment_address}</span>
            </div>
          )}
          {!hasConversation && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--pt-warn)', padding: '8px 10px', background: 'oklch(0.97 0.03 65)', borderRadius: 6 }}>
              No linked conversation — open the customer chat from Inbox and create the order from there to enable invoice sending.
            </div>
          )}
          {error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--pt-danger)' }}>{error}</div>}
        </div>
        <div className="pt-modal-ft">
          <button className="pt-btn pt-btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="pt-btn pt-btn-primary" onClick={generate} disabled={pending || !hasConversation}>
            {pending ? 'Generating…' : 'Generate & attach'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add "Send Invoice" button to `OrderDetailView`**

In `src/components/orders/OrderDetailView.tsx`:

Add `useState` import for `showInvoiceModal` and the `SendInvoiceModal` import. Modify the header actions section (lines 93–106):

```tsx
// Add import at top:
import { SendInvoiceModal } from './SendInvoiceModal'

// Add state inside the component:
const [showInvoiceModal, setShowInvoiceModal] = useState(false)

// In the header actions (after the Message link, before the advance button):
<button className="pt-btn pt-btn-ghost" onClick={() => setShowInvoiceModal(true)}>
  <Icons.doc size={12} /> Invoice
</button>

// After the closing </div> of pt-od-hd:
{showInvoiceModal && (
  <SendInvoiceModal order={order} onClose={() => setShowInvoiceModal(false)} />
)}
```

- [ ] **Step 3: Run all tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/orders/SendInvoiceModal.tsx src/components/orders/OrderDetailView.tsx
git commit -m "feat: Send Invoice button and preview modal on order detail"
```

---

## Task 8: Inbox pre-loaded invoice attachment

**Files:**
- Modify: `src/app/inbox/page.tsx`
- Modify: `src/components/inbox/InboxView.tsx` (InboxViewProps + InboxLayout + Composer)
- Modify: `src/components/inbox/InboxProvider.tsx`

The goal: when navigating to `/inbox?conversation=<id>&invoice_path=<path>&invoice_name=<name>`, the Composer shows a PDF attachment preview. Clicking Send calls `/api/invoices/send`.

- [ ] **Step 1: Read `invoice_path` + `invoice_name` in `src/app/inbox/page.tsx`**

Extend the existing `searchParams` destructuring (which already reads `conversation`):

```typescript
// Change the function signature to also read invoice params:
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ conversation?: string; invoice_path?: string; invoice_name?: string }> }) {

// In the body, extend the existing destructure:
const { conversation: initialConversationId, invoice_path: initialInvoicePath, invoice_name: initialInvoiceName } = await searchParams

// Pass to InboxView:
<InboxView
  ...
  initialActiveId={initialConversationId}
  initialInvoicePath={initialInvoicePath}
  initialInvoiceName={initialInvoiceName}
/>
```

- [ ] **Step 2: Forward invoice props through `InboxView`**

In `src/components/inbox/InboxView.tsx`:

```typescript
// Extend InboxViewProps:
interface InboxViewProps {
  initialConversations: DbConversation[]
  quickReplies: DbQuickReply[]
  templates: DbTemplate[]
  initialResolvedCount?: number
  initialActiveId?: string
  initialInvoicePath?: string
  initialInvoiceName?: string
}

// Destructure in InboxView:
export function InboxView({ ..., initialInvoicePath, initialInvoiceName }: InboxViewProps) {
  return (
    <InboxProvider ... initialInvoicePath={initialInvoicePath} initialInvoiceName={initialInvoiceName}>
      <InboxLayout />
    </InboxProvider>
  )
}
```

- [ ] **Step 3: Add invoice state to `InboxProvider`**

In `src/components/inbox/InboxProvider.tsx`:

```typescript
// Add to InboxCtx type:
pendingInvoicePath: string | null
pendingInvoiceName: string | null
clearPendingInvoice: () => void

// Add to Props interface:
initialInvoicePath?: string
initialInvoiceName?: string

// Add state inside InboxProvider:
const [pendingInvoicePath, setPendingInvoicePath] = useState(initialInvoicePath ?? null)
const [pendingInvoiceName, setPendingInvoiceName] = useState(initialInvoiceName ?? null)
const clearPendingInvoice = useCallback(() => { setPendingInvoicePath(null); setPendingInvoiceName(null) }, [])

// Add to context value:
pendingInvoicePath,
pendingInvoiceName,
clearPendingInvoice,
```

- [ ] **Step 4: Handle invoice attachment in Composer**

In `src/components/inbox/InboxView.tsx`, in the `Composer` function:

```typescript
// In the Composer destructure from useInbox:
const { ..., pendingInvoicePath, pendingInvoiceName, clearPendingInvoice } = useInbox()

// Add sendInvoice function alongside sendPhoto:
const sendInvoice = useCallback(async () => {
  if (!pendingInvoicePath || !pendingInvoiceName || !activeId) return
  setIsUploading(true)
  try {
    await fetch('/api/invoices/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: activeId, invoicePath: pendingInvoicePath, invoiceName: pendingInvoiceName }),
    })
    clearPendingInvoice()
    if (draft.trim()) send()
  } finally {
    setIsUploading(false)
  }
}, [pendingInvoicePath, pendingInvoiceName, activeId, clearPendingInvoice, draft, send])

// Update onKey to also trigger sendInvoice:
const onKey = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    if (pendingFile) void sendPhoto()
    else if (pendingInvoicePath) void sendInvoice()
    else send()
  }
}

// Add invoice preview above the composer textarea (alongside the photo preview):
{pendingInvoicePath && pendingInvoiceName && (
  <div className="pt-composer-photo-preview">
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icons.doc size={16} />
      <span style={{ fontSize: 12, fontWeight: 500 }}>{pendingInvoiceName}</span>
    </div>
    {!isUploading && (
      <button className="pt-composer-photo-clear" onClick={clearPendingInvoice} title="Remove">✕</button>
    )}
    {isUploading && <span className="pt-composer-photo-status">Sending…</span>}
  </div>
)}

// Update the Send button to trigger sendInvoice when invoice is pending:
// The existing Send button already calls send() on click.
// Replace it so it dispatches the right action:
onClick={() => { if (pendingFile) void sendPhoto(); else if (pendingInvoicePath) void sendInvoice(); else send() }}
```

- [ ] **Step 5: Run all tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/inbox/page.tsx src/components/inbox/InboxView.tsx src/components/inbox/InboxProvider.tsx
git commit -m "feat: inbox composer — pre-load invoice PDF attachment from URL params"
```

---

## Self-Review

**Spec coverage check:**
- ✅ PDF generation with @react-pdf/renderer — Task 3 + 4
- ✅ Snapshot (stored in `invoices` bucket + DB record) — Task 1 + 4
- ✅ Tenant branding: logo + business name — Task 1 + 6
- ✅ "Send Invoice" button on order detail — Task 7
- ✅ Preview modal before generating — Task 7
- ✅ Navigate to inbox with PDF pre-loaded in composer — Task 7 + 8
- ✅ Operator can add a message + send — Task 8
- ✅ WhatsApp sending — Task 5
- ✅ Telegram sending (sendTelegramDocument) — Task 2 + 5
- ✅ Invoice record persisted for audit trail — Task 4

**No placeholders.** All code is complete.

**Type consistency:** `InvoiceData` defined in Task 3, used in Tasks 3, 4, 7. `formatInvoiceNumber` defined in Task 3, used in Tasks 3, 7. `sendTelegramDocument` defined in Task 2, used in Task 5. All consistent.
