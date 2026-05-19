# Order Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Attachments card to the order detail page that shows the generated invoice (if any), lets operators upload images/video/PDFs, and lets them send any file to the customer via the linked conversation.

**Architecture:** New `order_attachments` table (tenant-scoped, FK to orders CASCADE). Files stored in the existing `media` bucket at `{tenantId}/orders/{orderId}/{uuid}-{filename}`. Two-step upload: server action returns a Supabase signed upload URL → client uploads directly to storage with XHR for progress → server action confirms and inserts the DB row. New `AttachmentsCard` client component rendered in `OrderDetailView`'s right rail. Invoice row sourced from a new `invoices` query in the page.

**Tech Stack:** Next.js 15 App Router, Supabase storage, `pt-*` CSS, TypeScript.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260519000005_order_attachments.sql` | Create | Table, RLS, FK, index |
| `src/types/orders.ts` | Modify | Add `OrderAttachment` type |
| `src/app/orders/attachments-actions.ts` | Create | Upload, confirm, delete server actions |
| `src/components/orders/AttachmentsCard.tsx` | Create | UI card component |
| `styles/order-detail.css` | Modify | Add `.pt-od-attach-*` styles |
| `src/app/orders/[orderId]/page.tsx` | Modify | Add invoice + attachments queries, pass props |
| `src/components/orders/OrderDetailView.tsx` | Modify | Accept new props, render AttachmentsCard |

---

## Task 1: DB Migration + Types

**Files:**
- Create: `supabase/migrations/20260519000005_order_attachments.sql`
- Modify: `src/types/orders.ts`

- [ ] **Create migration file** at `supabase/migrations/20260519000005_order_attachments.sql`:

```sql
CREATE TABLE order_attachments (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id     uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  file_size    int,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_order_attachments_select" ON order_attachments
  FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_order_attachments_insert" ON order_attachments
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "tenant_order_attachments_delete" ON order_attachments
  FOR DELETE USING (tenant_id = auth_tenant_id());

CREATE INDEX order_attachments_order_created_idx
  ON order_attachments(order_id, created_at DESC);
```

- [ ] **Push migration:**

```bash
cd "c:\Users\alana\OneDrive\Documents\Pep Tech"
npx supabase db push --include-all
```

Expected: `Applying migration 20260519000005_order_attachments.sql... Finished supabase db push.`

- [ ] **Add `OrderAttachment` type to `src/types/orders.ts`** — append at the end of the file:

```typescript
export type OrderAttachment = {
  id: string
  tenant_id: string
  order_id: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number | null
  created_at: string
}
```

- [ ] **Run TypeScript check:**

```bash
npx tsc --noEmit
```

Expected: only the 4 pre-existing errors in test files, zero new errors.

- [ ] **Commit:**

```bash
git add supabase/migrations/20260519000005_order_attachments.sql src/types/orders.ts
git commit -m "feat: order_attachments table + TypeScript type"
```

---

## Task 2: Server Actions

**Files:**
- Create: `src/app/orders/attachments-actions.ts`

- [ ] **Create `src/app/orders/attachments-actions.ts`:**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { OrderAttachment } from '@/types/orders'
import { randomUUID } from 'crypto'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id as string }
}

// Step 1 of upload: get a signed upload URL + the path we'll store
export async function createOrderAttachmentUpload(
  orderId: string,
  fileName: string,
  mimeType: string,
): Promise<{ signedUploadUrl: string; storagePath: string } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()

    // Verify the order belongs to this tenant
    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!order) return { error: 'Order not found' }

    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
    const storagePath = `${tenantId}/orders/${orderId}/${randomUUID()}-${safeFileName}`

    const { data, error } = await supabase.storage
      .from('media')
      .createSignedUploadUrl(storagePath)
    if (error || !data) return { error: error?.message ?? 'Could not create upload URL' }

    return { signedUploadUrl: data.signedUrl, storagePath }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// Step 2 of upload: confirm after client uploads to storage
export async function confirmOrderAttachment(
  orderId: string,
  storagePath: string,
  fileName: string,
  mimeType: string,
  fileSize: number | null,
): Promise<{ data: OrderAttachment } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()

    if (!storagePath.startsWith(`${tenantId}/orders/${orderId}/`)) {
      return { error: 'Invalid storage path' }
    }

    const { data, error } = await supabase
      .from('order_attachments')
      .insert({ tenant_id: tenantId, order_id: orderId, storage_path: storagePath, file_name: fileName, mime_type: mimeType, file_size: fileSize })
      .select()
      .single()
    if (error || !data) return { error: error?.message ?? 'Insert failed' }

    revalidatePath(`/orders/${orderId}`)
    return { data: data as OrderAttachment }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteOrderAttachment(
  attachmentId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()

    const { data: attachment } = await supabase
      .from('order_attachments')
      .select('storage_path, order_id')
      .eq('id', attachmentId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!attachment) return { error: 'Attachment not found' }

    const { error } = await supabase
      .from('order_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }

    const { error: storageErr } = await supabase.storage
      .from('media')
      .remove([attachment.storage_path])
    if (storageErr) console.error('attachment storage removal failed:', storageErr.message)

    revalidatePath(`/orders/${attachment.order_id}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Run TypeScript check:**

```bash
npx tsc --noEmit
```

Expected: zero new errors.

- [ ] **Commit:**

```bash
git add src/app/orders/attachments-actions.ts
git commit -m "feat: order attachment upload/confirm/delete server actions"
```

---

## Task 3: AttachmentsCard Component + CSS

**Files:**
- Create: `src/components/orders/AttachmentsCard.tsx`
- Modify: `styles/order-detail.css`

- [ ] **Add CSS to `styles/order-detail.css`** — append at end of file:

```css
/* ─── Attachments card ─────────────────────────────────────────────────── */
.pt-od-attach-list { list-style: none; margin: 0; padding: 0; }
.pt-od-attach-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px;
  border-top: 0.5px solid var(--pt-line-soft);
  font-size: 12px;
}
.pt-od-attach-row:first-child { border-top: 0; }
.pt-od-attach-invoice { background: oklch(from var(--pt-fg) l c h / 0.02); }
.pt-od-attach-icon { flex-shrink: 0; color: var(--pt-fg-4); display: flex; }
.pt-od-attach-name {
  flex: 1; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-weight: 500;
}
.pt-od-attach-size { font-size: 11px; color: var(--pt-fg-4); white-space: nowrap; }
.pt-od-attach-actions { display: flex; gap: 4px; flex-shrink: 0; }
.pt-od-attach-btn {
  width: 24px; height: 24px; border-radius: 4px;
  border: 0; background: transparent; cursor: pointer;
  color: var(--pt-fg-4); font-size: 13px;
  display: grid; place-items: center;
  transition: background 0.1s, color 0.1s;
}
.pt-od-attach-btn:hover { background: oklch(from var(--pt-fg) l c h / 0.07); color: var(--pt-fg); }
.pt-od-attach-btn.is-danger:hover { background: oklch(from var(--pt-danger) l c h / 0.1); color: var(--pt-danger); }
.pt-od-attach-progress {
  padding: 8px 14px;
  border-top: 0.5px solid var(--pt-line-soft);
}
.pt-od-attach-progress-bar {
  height: 3px; border-radius: 999px;
  background: oklch(from var(--pt-fg) l c h / 0.08);
  margin-top: 5px; overflow: hidden;
}
.pt-od-attach-progress-fill {
  height: 100%; border-radius: 999px;
  background: var(--pt-accent);
  transition: width 0.1s linear;
}
.pt-od-attach-empty {
  padding: 12px 14px; font-size: 12px; color: var(--pt-fg-4);
}
```

- [ ] **Create `src/components/orders/AttachmentsCard.tsx`:**

```typescript
'use client'

import { useRef, useState } from 'react'
import type { OrderAttachment } from '@/types/orders'
import {
  createOrderAttachmentUpload,
  confirmOrderAttachment,
  deleteOrderAttachment,
} from '@/app/orders/attachments-actions'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return '🖼'
  if (mimeType.startsWith('video/')) return '🎥'
  return '📄'
}

function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type Props = {
  orderId: string
  conversationId: string | null
  invoice: { id: string; invoice_number: string; pdf_path: string; signedUrl: string } | null
  initialAttachments: OrderAttachment[]
  attachmentSignedUrls: Record<string, string>
}

export function AttachmentsCard({ orderId, conversationId, invoice, initialAttachments, attachmentSignedUrls }: Props) {
  const [attachments, setAttachments] = useState<OrderAttachment[]>(initialAttachments)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>(attachmentSignedUrls)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadName, setUploadName] = useState('')
  const [error, setError] = useState('')
  const [sentId, setSentId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) { setError('File too large — max 5 MB'); return }

    setError('')
    setUploading(true)
    setUploadProgress(0)
    setUploadName(file.name)

    const result = await createOrderAttachmentUpload(orderId, file.name, file.type)
    if ('error' in result) { setError(result.error); setUploading(false); return }

    // Upload directly to Supabase storage with XHR for progress
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', ev => {
        if (ev.lengthComputable) setUploadProgress(Math.round(ev.loaded / ev.total * 100))
      })
      xhr.addEventListener('load', () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)))
      xhr.addEventListener('error', () => reject(new Error('Upload failed')))
      xhr.open('PUT', result.signedUploadUrl)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.send(file)
    }).catch(err => { setError(err.message); setUploading(false); return })

    const confirm = await confirmOrderAttachment(orderId, result.storagePath, file.name, file.type, file.size)
    if ('error' in confirm) { setError(confirm.error); setUploading(false); return }

    // Generate a signed URL for the new attachment so it can be opened immediately
    const signedRes = await fetch(`/api/attachments/signed-url?path=${encodeURIComponent(result.storagePath)}`)
    const signedData = signedRes.ok ? await signedRes.json() : null
    if (signedData?.url) setSignedUrls(prev => ({ ...prev, [confirm.data.id]: signedData.url }))

    setAttachments(prev => [confirm.data, ...prev])
    setUploading(false)
    setUploadName('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleDelete(attachment: OrderAttachment) {
    if (!confirm(`Delete "${attachment.file_name}"?`)) return
    const result = await deleteOrderAttachment(attachment.id)
    if ('error' in result) { setError(result.error); return }
    setAttachments(prev => prev.filter(a => a.id !== attachment.id))
    setSignedUrls(prev => { const next = { ...prev }; delete next[attachment.id]; return next })
  }

  async function handleSend(attachment: OrderAttachment) {
    if (!conversationId) return
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, storagePath: attachment.storage_path, bucket: 'media' }),
    })
    if (res.ok) {
      setSentId(attachment.id)
      setTimeout(() => setSentId(null), 2000)
    } else {
      setError('Send failed')
    }
  }

  const hasContent = invoice || attachments.length > 0 || uploading

  return (
    <section className="pt-card">
      <header className="pt-card-hd">
        <div><h3>Attachments</h3></div>
        <button
          className="pt-btn pt-btn-ghost pt-btn-xs"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          + Add
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*,application/pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </header>
      <div className="pt-card-body" style={{ padding: 0 }}>
        {error && (
          <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--pt-danger)' }}>{error}</div>
        )}
        {!hasContent && (
          <div className="pt-od-attach-empty">No attachments yet</div>
        )}
        <ul className="pt-od-attach-list">
          {invoice && (
            <li className="pt-od-attach-row pt-od-attach-invoice">
              <span className="pt-od-attach-icon">📄</span>
              <span className="pt-od-attach-name">Invoice #{invoice.invoice_number}</span>
              <div className="pt-od-attach-actions">
                <a
                  href={invoice.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pt-od-attach-btn"
                  title="Download invoice"
                >↓</a>
              </div>
            </li>
          )}
          {uploading && (
            <li className="pt-od-attach-progress">
              <div style={{ fontSize: 11, color: 'var(--pt-fg-3)' }}>Uploading {uploadName}…</div>
              <div className="pt-od-attach-progress-bar">
                <div className="pt-od-attach-progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
            </li>
          )}
          {attachments.map(a => (
            <li key={a.id} className="pt-od-attach-row">
              <span className="pt-od-attach-icon">{fileIcon(a.mime_type)}</span>
              <span className="pt-od-attach-name">{a.file_name}</span>
              <span className="pt-od-attach-size">{fmtSize(a.file_size)}</span>
              <div className="pt-od-attach-actions">
                {signedUrls[a.id] && (
                  <a
                    href={signedUrls[a.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pt-od-attach-btn"
                    title="Open file"
                  >↗</a>
                )}
                {conversationId && (
                  <button
                    className="pt-od-attach-btn"
                    title="Send to customer"
                    onClick={() => handleSend(a)}
                  >
                    {sentId === a.id ? '✓' : '→'}
                  </button>
                )}
                <button
                  className="pt-od-attach-btn is-danger"
                  title="Delete"
                  onClick={() => handleDelete(a)}
                >✕</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
```

- [ ] **Run TypeScript check:**

```bash
npx tsc --noEmit
```

Expected: zero new errors (the `AttachmentsCard` fetches a signed URL via `/api/attachments/signed-url` which we create in Task 4).

- [ ] **Commit:**

```bash
git add src/components/orders/AttachmentsCard.tsx styles/order-detail.css
git commit -m "feat: AttachmentsCard component + CSS"
```

---

## Task 4: Signed URL API Route + Page Query + Wire into OrderDetailView

**Files:**
- Create: `src/app/api/attachments/signed-url/route.ts`
- Modify: `src/app/orders/[orderId]/page.tsx`
- Modify: `src/components/orders/OrderDetailView.tsx`

- [ ] **Create `src/app/api/attachments/signed-url/route.ts`** — a lightweight GET endpoint the client calls after upload to get an openable URL:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow || !path.startsWith(`${userRow.tenant_id}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase.storage.from('media').createSignedUrl(path, 3600)
  if (error || !data) return NextResponse.json({ error: error?.message }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}
```

- [ ] **Update `src/app/orders/[orderId]/page.tsx`** — add invoice + attachments queries and generate signed URLs server-side.

Replace the existing `Promise.all` and the code after `if (!order) notFound()` up to the `chatExcerpt` block:

```typescript
  const [{ data: order }, { data: events }, { data: paymentConfigs }] = await Promise.all([
    supabase.from('orders').select(ORDER_SELECT).eq('id', orderId).single(),
    supabase.from('order_events').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
    supabase.from('tenant_payment_configs').select('*').eq('is_active', true),
  ])

  if (!order) notFound()

  const orderRow = order as unknown as DbOrderRow

  // Parallel: customer stats + invoice + attachments
  const [
    { count: customerOrderCount, data: latestOrders },
    { data: invoiceRow },
    { data: attachmentsRaw },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('created_at', { count: 'exact' })
      .eq('customer_id', orderRow.customer_id)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('invoices')
      .select('id, invoice_number, pdf_path')
      .eq('order_id', orderId)
      .maybeSingle(),
    supabase
      .from('order_attachments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
  ])

  const customerStats = {
    orderCount: customerOrderCount ?? 0,
    lastOrderAt: latestOrders?.[0]?.created_at ?? null,
  }

  // Generate signed URL for invoice PDF (invoices bucket, 1 hour TTL)
  let invoice: { id: string; invoice_number: string; pdf_path: string; signedUrl: string } | null = null
  if (invoiceRow?.pdf_path) {
    const { data: signed } = await supabase.storage
      .from('invoices')
      .createSignedUrl(invoiceRow.pdf_path, 3600)
    if (signed) invoice = { ...invoiceRow, signedUrl: signed.signedUrl }
  }

  // Generate signed URLs for all attachments (media bucket, 1 hour TTL)
  const attachments = (attachmentsRaw ?? []) as import('@/types/orders').OrderAttachment[]
  const attachmentSignedUrls: Record<string, string> = {}
  await Promise.all(
    attachments.map(async a => {
      const { data } = await supabase.storage.from('media').createSignedUrl(a.storage_path, 3600)
      if (data) attachmentSignedUrls[a.id] = data.signedUrl
    })
  )
```

And update the `return` to pass the new props:

```typescript
  return (
    <Shell section="Orders">
      <OrderDetailView
        order={orderRow}
        events={(events ?? []) as DbOrderEvent[]}
        chatExcerpt={chatExcerpt}
        paymentConfigs={(paymentConfigs ?? []) as TenantPaymentConfig[]}
        customerStats={customerStats}
        invoice={invoice}
        attachments={attachments}
        attachmentSignedUrls={attachmentSignedUrls}
      />
    </Shell>
  )
```

Also add the `OrderAttachment` import at the top of the file:

```typescript
import type { DbOrderRow, DbOrderEvent, OrderAttachment } from '@/types/orders'
```

- [ ] **Update `src/components/orders/OrderDetailView.tsx`** — add props and render the card.

Add the import at the top:
```typescript
import { AttachmentsCard } from './AttachmentsCard'
import type { OrderAttachment } from '@/types/orders'
```

Extend the props type:
```typescript
export function OrderDetailView({ order, events, chatExcerpt, paymentConfigs, customerStats, invoice, attachments, attachmentSignedUrls }: {
  order: DbOrderRow
  events: DbOrderEvent[]
  chatExcerpt: { id: string; direction: string; content: string; sent_at: string }[]
  paymentConfigs: TenantPaymentConfig[]
  customerStats?: { orderCount: number; lastOrderAt: string | null }
  invoice: { id: string; invoice_number: string; pdf_path: string; signedUrl: string } | null
  attachments: OrderAttachment[]
  attachmentSignedUrls: Record<string, string>
})
```

In the right rail (`pt-od-rail`), after the customer card section and before the activity timeline section, add:

```tsx
          {/* Attachments */}
          <AttachmentsCard
            orderId={order.id}
            conversationId={order.conversation_id ?? null}
            invoice={invoice}
            initialAttachments={attachments}
            attachmentSignedUrls={attachmentSignedUrls}
          />
```

- [ ] **Run TypeScript check:**

```bash
npx tsc --noEmit
```

Expected: zero new errors.

- [ ] **Commit:**

```bash
git add src/app/api/attachments/signed-url/route.ts src/app/orders/\[orderId\]/page.tsx src/components/orders/OrderDetailView.tsx
git commit -m "feat: order attachments — page queries, signed URLs, wire into OrderDetailView"
```

---

## Verification

1. Open an order detail page — Attachments card appears in the right rail below the customer card
2. If an invoice was generated for the order, it shows as a pinned row with a download link
3. Click `+ Add`, pick an image — progress bar fills, file appears in list
4. Click `+ Add`, pick a PDF > 5MB — error message appears, no upload
5. Click `↗` on an uploaded image — opens in new tab
6. On an order with a linked conversation, click `→` on an attachment — "✓" appears briefly, file appears in the customer's conversation
7. Click `✕` on an attachment — confirm dialog, then row disappears
8. Reload the page — attachments still listed (persisted in DB)
