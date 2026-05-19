# Order Attachments — Design Spec

**Date:** 2026-05-19
**Status:** Approved

---

## Problem

The order detail page has no way to attach operational files — payment screenshots, tracking photos, package photos, or any supporting documents. The generated invoice also has no visible home on the order detail page, despite already being stored in Supabase.

---

## Goal

Add an **Attachments card** to the order detail right column that:
1. Shows the generated invoice (if one exists) as a pinned read-only row
2. Lets operators upload, view, and delete order-specific files (images, video, PDF)
3. Lets operators send any attachment to the customer via the linked conversation

---

## Scope

**In scope:**
- `order_attachments` DB table + RLS
- Upload, list, delete server actions
- Attachments card UI in `OrderDetailView`
- Invoice row sourced from `invoices` table (new query in page)
- "Send to customer" via existing `/api/send` endpoint (requires linked conversation)
- Inline upload with progress indicator

**Out of scope:**
- Attachment captions/labels
- Visibility toggle (internal vs. shared) — all attachments are operator-visible; "Send" is the explicit sharing action
- Bulk upload
- Attachment preview modal (file opens in new tab)

---

## Data Model

### `order_attachments`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, gen_random_uuid() |
| `tenant_id` | uuid NOT NULL | FK → tenants ON DELETE CASCADE |
| `order_id` | uuid NOT NULL | FK → orders ON DELETE CASCADE |
| `storage_path` | text NOT NULL | Path in `media` bucket: `{tenantId}/orders/{orderId}/{uuid}-{filename}` |
| `file_name` | text NOT NULL | Original filename for display |
| `mime_type` | text NOT NULL | e.g. `image/jpeg`, `application/pdf` |
| `file_size` | int | Bytes |
| `created_at` | timestamptz NOT NULL | DEFAULT now() |

**RLS:** Tenant-scoped SELECT/INSERT/UPDATE/DELETE using `auth_tenant_id()` pattern. FK to tenants with CASCADE.

**Index:** `(order_id, created_at DESC)`

**Storage path convention:** `{tenantId}/orders/{orderId}/{uuid}-{sanitised-filename}` in the existing `media` bucket. No new bucket needed — the `media` bucket already has the right size limits (5MB) and RLS.

---

## Server Actions

**File:** `src/app/orders/attachments-actions.ts`

```typescript
// Upload file, insert row, return new attachment
export async function uploadOrderAttachment(
  orderId: string,
  formData: FormData
): Promise<{ data: OrderAttachment } | { error: string }>

// Delete from storage + DB
export async function deleteOrderAttachment(
  attachmentId: string
): Promise<{ success: true } | { error: string }>
```

Both verify ownership via `tenant_id`. `uploadOrderAttachment` generates a UUID prefix for the storage path to avoid collisions. `revalidatePath('/orders/[orderId]')` on both.

---

## Page Query

**File:** `src/app/orders/[orderId]/page.tsx`

Two new parallel queries added to the existing `Promise.all`:
1. Fetch invoice: `SELECT id, invoice_number, pdf_path FROM invoices WHERE order_id = orderId LIMIT 1`
2. Fetch attachments: `SELECT * FROM order_attachments WHERE order_id = orderId ORDER BY created_at DESC`

Both passed as props to `OrderDetailView`.

---

## UI

### AttachmentsCard component

**File:** `src/components/orders/AttachmentsCard.tsx`

New client component. Rendered inside `OrderDetailView`'s right column, below the customer card.

**Layout:**

```
┌─ Attachments ──────────────────── [+ Add] ─┐
│ 📄 Invoice #INV-042         [↓ Download]    │  ← pinned, read-only
│ ─────────────────────────────────────────── │
│ 🖼 payment-screenshot.jpg  1.2 MB [→] [✕]  │
│ 📄 tracking-ref.pdf        340 KB [→] [✕]  │
│ 🎥 package-video.mp4       4.1 MB [→] [✕]  │
└────────────────────────────────────────────┘
```

- **Invoice row** — PDF icon, `Invoice #{number}`, download button (signed URL). Only shown if `invoice` prop is non-null. No delete or send.
- **Attachment rows** — file-type icon (image/video/pdf), truncated filename, human-readable file size, **Send** button (→, only shown if `order.conversation_id` is non-null), **Delete** button (✕ with confirmation).
- **`+ Add` button** — opens hidden `<input type="file" accept="image/*,video/*,.pdf">`, triggers upload on change.
- **Upload state** — while uploading: show a pending row with a progress bar (uses `XMLHttpRequest` for progress events, or a simple spinner if using fetch).
- **Send action** — calls `POST /api/send` with `{ conversationId, storagePath, bucket: 'media' }`. No modal — fires immediately with a brief "Sent" confirmation on the button.

**Props:**
```typescript
type Props = {
  orderId: string
  conversationId: string | null
  invoice: { id: string; invoice_number: string; pdf_path: string } | null
  initialAttachments: OrderAttachment[]
}
```

**TypeScript type:**
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

---

## CSS

New classes in `styles/orders.css` (or a small addition):
- `.pt-od-attach` — card list
- `.pt-od-attach-row` — single file row (flex, aligned)
- `.pt-od-attach-icon` — file type icon
- `.pt-od-attach-name` — truncated filename
- `.pt-od-attach-size` — muted file size
- `.pt-od-attach-actions` — send + delete buttons
- `.pt-od-attach-invoice` — invoice pinned row (slightly distinct background)
- `.pt-od-attach-progress` — upload progress row

---

## Security

- Storage paths include `tenantId` as first segment — the existing `media` bucket RLS policy (`(storage.foldername(name))[1] = auth_tenant_id()`) already enforces tenant isolation.
- Server actions verify `tenant_id` before any mutation.
- Signed URLs expire (use existing `generateSignedUrl` utility with a short TTL for downloads).
- File size limit: enforced client-side (5MB, matching `media` bucket limit) with a clear error message.
