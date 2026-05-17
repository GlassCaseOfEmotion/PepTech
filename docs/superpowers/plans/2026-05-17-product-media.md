# Product Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let tenants upload images and videos to catalog products and send them to customers via the inbox composer and catalog send modal.

**Architecture:** A new `product_media` table (one row per file, RLS-scoped by tenant) stores metadata; files live in a private `product-media` Supabase Storage bucket. The catalog detail panel gets an upload/manage UI. Both `ProductInfoPicker` (composer) and `ProductSendModal` (catalog) gain a media picker that attaches the selected file via the existing `/api/send` route (extended with a `bucket` param).

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + Storage), `pt-*` CSS. No new packages.

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260517000003_product_media.sql` | Create table, RLS, storage bucket, storage policies |
| `src/types/database.ts` | Add `product_media` Row/Insert/Update |
| `src/types/catalog.ts` | Add `ProductMediaItem`, extend `CatalogProduct` + `dbProductToDisplay` |
| `src/app/catalog/actions.ts` | Add `createProductMedia`, `saveProductMediaPath`, `deleteProductMedia` |
| `src/lib/media/storage.ts` | Add `generateSignedUrlFromBucket` helper |
| `src/app/api/catalog/file-url/route.ts` | New: unified signed URL route (coa + product-media) |
| `src/app/api/send/route.ts` | Accept `bucket` param, use bucket-aware signed URL |
| `src/app/catalog/page.tsx` | Fetch `product_media` rows, pass to `dbProductToDisplay` |
| `src/components/catalog/CatalogView.tsx` | Add `ProductMediaSection` component |
| `styles/catalog.css` | Add `pt-media-*` styles |
| `src/components/inbox/ProductInfoPicker.tsx` | Add media toggle card, rename `onAttachCoa` → `onAttachFile` |
| `src/components/inbox/InboxView.tsx` | Rename to `onAttachFile`, update `pendingCoaPath` → `pendingAttachment` |
| `src/components/catalog/ProductSendModal.tsx` | Add media grid, two-send flow |

---

## Task 1: DB Migration + Types

**Files:**
- Create: `supabase/migrations/20260517000003_product_media.sql`
- Modify: `src/types/database.ts`
- Modify: `src/types/catalog.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260517000003_product_media.sql

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-media',
  'product-media',
  false,
  16777216,
  ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "tenant_product_media_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-media' AND left(name, 36) = auth_tenant_id()::text);

CREATE POLICY "tenant_product_media_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-media' AND left(name, 36) = auth_tenant_id()::text);

CREATE POLICY "tenant_product_media_storage_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-media' AND left(name, 36) = auth_tenant_id()::text);

-- Table
CREATE TABLE product_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label        text NOT NULL,
  type         text NOT NULL CHECK (type IN ('image', 'video')),
  storage_path text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_product_media_all" ON product_media
  FOR ALL
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push --include-all
```

Expected: migration applies cleanly, `product_media` table appears in Supabase dashboard.

- [ ] **Step 3: Update `src/types/database.ts`**

Add the `product_media` entry inside the `Tables` object (alphabetically, after `product_protocols`). Find the closing brace of the `product_protocols` entry and insert after it:

```typescript
      product_media: {
        Row: {
          created_at: string
          id: string
          label: string
          product_id: string
          sort_order: number
          storage_path: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          product_id: string
          sort_order?: number
          storage_path?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          product_id?: string
          sort_order?: number
          storage_path?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 4: Update `src/types/catalog.ts`**

Add `ProductMediaItem` and extend `CatalogProduct` and `dbProductToDisplay`:

```typescript
export type ProductMediaItem = {
  id: string
  label: string
  type: 'image' | 'video'
  storage_path: string
  sort_order: number
}

export type DbProduct = {
  id: string
  tenant_id: string
  sku: string
  name: string
  product_family: string
  unit_price: number
  cost_price: number | null
  description: string | null
  is_active: boolean
  created_at: string
  resources: { label: string; url: string }[]
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
  costPrice: number | null
  description: string | null
  isActive: boolean
  resources: { label: string; url: string }[]
  media: ProductMediaItem[]
  batches: DbBatch[]
  totalStock: number
  velocity7d: number[]
  velocity30dTotal: number
}

export function dbProductToDisplay(
  product: DbProduct,
  batches: DbBatch[],
  media: ProductMediaItem[] = [],
): CatalogProduct {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    productFamily: product.product_family,
    unitPrice: product.unit_price,
    costPrice: product.cost_price ?? null,
    description: product.description,
    isActive: product.is_active,
    resources: product.resources,
    media,
    batches,
    totalStock: batches.reduce((sum, b) => sum + b.stock, 0),
    velocity7d: [0, 0, 0, 0, 0, 0, 0],
    velocity30dTotal: 0,
  }
}

export function grossMargin(unitPrice: number, costPrice: number | null): number | null {
  if (costPrice === null || costPrice <= 0 || unitPrice <= 0) return null
  return ((unitPrice - costPrice) / unitPrice) * 100
}
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors in the modified files.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260517000003_product_media.sql src/types/database.ts src/types/catalog.ts
git commit -m "feat: product_media table, storage bucket, and types"
```

---

## Task 2: Server Actions

**Files:**
- Modify: `src/app/catalog/actions.ts`

- [ ] **Step 1: Add three new server actions to `src/app/catalog/actions.ts`**

Add after the `deleteBatch` function (end of file):

```typescript
export async function createProductMedia(
  productId: string,
  label: string,
  type: 'image' | 'video',
  ext: string,
): Promise<{ id: string; uploadUrl: string; storagePath: string } | { error: string }> {
  if (!label.trim()) return { error: 'Label is required' }
  if (!['image', 'video'].includes(type)) return { error: 'Invalid type' }
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5)
  if (!safeExt) return { error: 'Invalid file extension' }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { data: row, error: insertErr } = await supabase
      .from('product_media')
      .insert({ tenant_id: tenantId, product_id: productId, label: label.trim(), type, storage_path: null })
      .select('id')
      .single()
    if (insertErr || !row) return { error: insertErr?.message ?? 'Insert failed' }
    const storagePath = `${tenantId}/${productId}/${row.id}.${safeExt}`
    const { data: uploadData, error: urlErr } = await supabase.storage
      .from('product-media')
      .createSignedUploadUrl(storagePath)
    if (urlErr || !uploadData) return { error: urlErr?.message ?? 'Could not create upload URL' }
    return { id: row.id, uploadUrl: uploadData.signedUrl, storagePath }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function saveProductMediaPath(
  id: string,
  storagePath: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    if (!storagePath.startsWith(`${tenantId}/`)) return { error: 'Invalid path' }
    const { error } = await supabase
      .from('product_media')
      .update({ storage_path: storagePath })
      .eq('id', id)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteProductMedia(
  id: string,
  storagePath: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    if (!storagePath.startsWith(`${tenantId}/`)) return { error: 'Invalid path' }
    const { error } = await supabase
      .from('product_media')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    await supabase.storage.from('product-media').remove([storagePath])
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/catalog/actions.ts
git commit -m "feat: createProductMedia, saveProductMediaPath, deleteProductMedia actions"
```

---

## Task 3: API Routes — file-url + send bucket param

**Files:**
- Create: `src/app/api/catalog/file-url/route.ts`
- Modify: `src/lib/media/storage.ts`
- Modify: `src/app/api/send/route.ts`
- Create: `src/app/api/catalog/file-url/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/catalog/file-url/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getServerUser: vi.fn(),
}))

const { GET } = await import('../route')
const { createClient, getServerUser } = await import('@/lib/supabase/server')

const TENANT_ID = 'tenant-abc'

function makeSupabase(signedUrl = 'https://sb.co/signed') {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { tenant_id: TENANT_ID }, error: null }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl }, error: null }),
      }),
    },
  }
}

describe('GET /api/catalog/file-url', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    ;(getServerUser as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const req = new Request('http://localhost/api/catalog/file-url?bucket=coa&path=abc/file.pdf')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid bucket', async () => {
    ;(getServerUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const req = new Request(`http://localhost/api/catalog/file-url?bucket=evil&path=${TENANT_ID}/f.pdf`)
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 403 for path not scoped to tenant', async () => {
    ;(getServerUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(makeSupabase())
    const req = new Request('http://localhost/api/catalog/file-url?bucket=coa&path=other-tenant/f.pdf')
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('returns signed URL for valid coa request', async () => {
    ;(getServerUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' })
    const sb = makeSupabase('https://sb.co/signed-coa')
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(sb)
    const req = new Request(`http://localhost/api/catalog/file-url?bucket=coa&path=${TENANT_ID}/batch.pdf`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json() as { url: string }
    expect(body.url).toBe('https://sb.co/signed-coa')
    expect(sb.storage.from).toHaveBeenCalledWith('coa')
  })

  it('returns signed URL for valid product-media request', async () => {
    ;(getServerUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' })
    const sb = makeSupabase('https://sb.co/signed-media')
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(sb)
    const req = new Request(`http://localhost/api/catalog/file-url?bucket=product-media&path=${TENANT_ID}/prod/img.jpg`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json() as { url: string }
    expect(body.url).toBe('https://sb.co/signed-media')
    expect(sb.storage.from).toHaveBeenCalledWith('product-media')
  })
})
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
npx vitest run src/app/api/catalog/file-url/__tests__/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/app/api/catalog/file-url/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'

const ALLOWED_BUCKETS = new Set(['coa', 'product-media'])

export async function GET(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const bucket = searchParams.get('bucket')
  const path = searchParams.get('path')

  if (!bucket || !ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 })
  }
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  if (path.includes('..')) return NextResponse.json({ error: 'Invalid path' }, { status: 400 })

  const supabase = await createClient()
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!path.startsWith(`${userRow.tenant_id}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error || !data) return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}
```

- [ ] **Step 4: Run test — confirm it passes**

```bash
npx vitest run src/app/api/catalog/file-url/__tests__/route.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Add `generateSignedUrlFromBucket` to `src/lib/media/storage.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export async function uploadToStorage(
  supabase: SupabaseClient,
  buffer: Buffer,
  path: string,
  mimeType: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from('media')
    .upload(path, buffer, { contentType: mimeType, upsert: false })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  return path
}

export async function generateSignedUrl(
  supabase: SupabaseClient,
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('media')
    .createSignedUrl(path, expiresIn)
  if (error || !data) throw new Error(`Failed to generate signed URL: ${error?.message}`)
  return data.signedUrl
}

export async function generateSignedUrlFromBucket(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)
  if (error || !data) throw new Error(`Failed to generate signed URL: ${error?.message}`)
  return data.signedUrl
}
```

- [ ] **Step 6: Update `src/app/api/send/route.ts` to accept `bucket` param**

Change the request body type (line 10-13) and the storagePath handling:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage, sendWhatsAppMedia, sendWhatsAppTemplate, TwilioWindowError } from '@/lib/channels/whatsapp'
import { sendTelegramMessage, sendTelegramPhoto } from '@/lib/channels/telegram'
import { sendGmailMessage, sendMicrosoftMessage } from '@/lib/channels/email'
import type { GoogleCredentials, MicrosoftCredentials } from '@/lib/channels/email'
import { generateSignedUrl, generateSignedUrlFromBucket } from '@/lib/media/storage'

export async function POST(request: Request) {
  const body = await request.json() as {
    conversationId?: string; content?: string; storagePath?: string
    bucket?: 'media' | 'coa' | 'product-media'
    templateId?: string; templateVariables?: Record<string, string>
  }

  if (!body.conversationId || (!body.content?.trim() && !body.storagePath && !body.templateId)) {
    return NextResponse.json({ error: 'conversationId and content or storagePath are required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, tenant_id, channel_type, channel_identifier, customer_id')
    .eq('id', body.conversationId)
    .single()

  if (convErr || !conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const { data: channel } = await supabase
    .from('tenant_channels')
    .select('credentials, is_active')
    .eq('tenant_id', conv.tenant_id)
    .eq('channel_type', conv.channel_type)
    .single()

  if (!channel?.is_active || !channel.credentials) {
    return NextResponse.json({ error: 'Channel not connected' }, { status: 422 })
  }

  const to = conv.channel_identifier
  const text = body.content ?? ''
  const { storagePath } = body
  const bucket = body.bucket ?? 'media'
  let effectiveContent = text
  let twilioSid: string | undefined

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const statusCallbackUrl = appUrl ? `${appUrl}/api/webhooks/twilio-status` : undefined

  if (conv.channel_type === 'whatsapp') {
    try {
      if (body.templateId) {
        const { data: tmpl } = await supabase
          .from('whatsapp_templates').select('content_sid, body')
          .eq('id', body.templateId)
          .eq('status', 'approved')
          .single()
        if (!tmpl?.content_sid) return NextResponse.json({ error: 'Template not approved' }, { status: 422 })
        effectiveContent = tmpl.body ?? text
        twilioSid = await sendWhatsAppTemplate(to, tmpl.content_sid, body.templateVariables ?? {}, statusCallbackUrl)
      } else if (storagePath) {
        const mediaUrl = bucket === 'media'
          ? await generateSignedUrl(supabase, storagePath)
          : await generateSignedUrlFromBucket(supabase, bucket, storagePath)
        twilioSid = await sendWhatsAppMedia(mediaUrl, to, statusCallbackUrl)
      } else {
        twilioSid = await sendWhatsAppMessage(to, text, statusCallbackUrl)
      }
    } catch (err) {
      if (err instanceof TwilioWindowError) {
        const { data: failedMsg } = await supabase.from('messages').insert({
          tenant_id: conv.tenant_id, conversation_id: conv.id,
          direction: 'outbound', content: effectiveContent, status: 'failed',
          metadata: { error_code: 63016, ...(body.templateId ? { templateId: body.templateId } : {}) },
        }).select('id').single()
        return NextResponse.json({ error: 'window_expired', messageId: failedMsg?.id }, { status: 422 })
      }
      throw err
    }
  } else if (conv.channel_type === 'telegram') {
    const creds = channel.credentials as { bot_token: string; business_connection_id?: string }
    if (storagePath) {
      try {
        const { data: blob } = await supabase.storage.from(bucket).download(storagePath)
        if (!blob) throw new Error('Failed to download media from storage')
        await sendTelegramPhoto(creds.bot_token, to, blob, creds.business_connection_id)
      } catch {
        await supabase.from('messages').insert({
          tenant_id: conv.tenant_id,
          conversation_id: conv.id,
          direction: 'outbound' as const,
          content: '[Photo — send failed]',
          status: 'failed',
          metadata: { kind: 'photo', storagePath },
        })
        return NextResponse.json({ error: 'Failed to send photo' }, { status: 500 })
      }
    } else {
      await sendTelegramMessage(creds.bot_token, to, text, creds.business_connection_id)
    }
  } else if (conv.channel_type === 'email') {
    const creds = channel.credentials as unknown as GoogleCredentials | MicrosoftCredentials
    if (creds.provider === 'google') {
      await sendGmailMessage(creds as GoogleCredentials, to, 'Re: your message', text)
    } else {
      await sendMicrosoftMessage(creds as MicrosoftCredentials, to, 'Re: your message', text)
    }
  }

  const { data: message } = await supabase
    .from('messages')
    .insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      direction: 'outbound',
      content: storagePath ? '[Photo]' : effectiveContent,
      status: 'sent',
      external_id: twilioSid ?? null,
      metadata: storagePath ? { kind: 'photo', storagePath } : null,
    })
    .select('id')
    .single()

  await supabase
    .from('conversations')
    .update({
      status: 'in_progress',
      last_message_at: new Date().toISOString(),
      last_message_snippet: storagePath ? 'You: [Photo]' : `You: ${effectiveContent.slice(0, 97)}`,
    })
    .eq('id', conv.id)

  return NextResponse.json({ messageId: message?.id })
}
```

- [ ] **Step 7: Run all unit tests**

```bash
npx vitest run src/app/api/
```

Expected: all tests pass (file-url new tests + existing send tests).

- [ ] **Step 8: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/app/api/catalog/file-url/ src/lib/media/storage.ts src/app/api/send/route.ts
git commit -m "feat: file-url API route + bucket-aware send"
```

---

## Task 4: Load Product Media in Catalog Page

**Files:**
- Modify: `src/app/catalog/page.tsx`

- [ ] **Step 1: Update `src/app/catalog/page.tsx` to fetch product_media**

Add `product_media` to the parallel Promise.all fetch and group by product_id (mirrors the batches pattern):

```typescript
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CatalogView } from '@/components/catalog/CatalogView'
import { dbProductToDisplay } from '@/types/catalog'
import type { DbProduct, DbBatch, ProductMediaItem } from '@/types/catalog'
import type { ProductProtocol } from '@/types/protocols'

export default async function CatalogPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString()

  const [
    { data: products },
    { data: batches },
    { data: protocols },
    { data: tenantRow },
    { data: recentOrders },
    { data: allMedia },
  ] = await Promise.all([
    supabase.from('products').select('*').eq('is_active', true).order('product_family').order('name'),
    supabase.from('batches').select('*').order('created_at', { ascending: false }),
    supabase.from('product_protocols').select('*'),
    supabase.from('tenants').select('base_currency').single(),
    supabase
      .from('orders')
      .select('created_at, order_items(product_id, qty)')
      .in('status', ['packing', 'shipped', 'delivered'])
      .gte('created_at', thirtyDaysAgo),
    supabase
      .from('product_media')
      .select('id, product_id, label, type, storage_path, sort_order')
      .not('storage_path', 'is', null)
      .order('sort_order', { ascending: true }),
  ])

  const now = Date.now()
  const velocity7dMap: Record<string, number[]> = {}
  const velocity30dMap: Record<string, number> = {}

  for (const order of (recentOrders ?? [])) {
    const daysAgo = Math.floor((now - new Date(order.created_at).getTime()) / 86400_000)
    if (daysAgo < 0 || daysAgo > 29) continue
    const items = (order.order_items ?? []) as { product_id: string; qty: number }[]
    for (const item of items) {
      velocity30dMap[item.product_id] = (velocity30dMap[item.product_id] ?? 0) + item.qty
      if (daysAgo <= 6) {
        const slot = 6 - daysAgo
        if (!velocity7dMap[item.product_id]) velocity7dMap[item.product_id] = [0, 0, 0, 0, 0, 0, 0]
        velocity7dMap[item.product_id][slot] += item.qty
      }
    }
  }

  const batchesByProduct = ((batches ?? []) as DbBatch[]).reduce<Record<string, DbBatch[]>>((acc, b) => {
    if (!acc[b.product_id]) acc[b.product_id] = []
    acc[b.product_id].push(b)
    return acc
  }, {})

  const mediaByProduct = ((allMedia ?? []) as (ProductMediaItem & { product_id: string })[])
    .reduce<Record<string, ProductMediaItem[]>>((acc, m) => {
      if (!acc[m.product_id]) acc[m.product_id] = []
      acc[m.product_id].push({ id: m.id, label: m.label, type: m.type as 'image' | 'video', storage_path: m.storage_path, sort_order: m.sort_order })
      return acc
    }, {})

  const catalogProducts = ((products ?? []) as DbProduct[]).map(p => ({
    ...dbProductToDisplay(p, batchesByProduct[p.id] ?? [], mediaByProduct[p.id] ?? []),
    velocity7d: velocity7dMap[p.id] ?? [0, 0, 0, 0, 0, 0, 0],
    velocity30dTotal: velocity30dMap[p.id] ?? 0,
  }))

  const baseCurrency = (tenantRow?.base_currency as string | null) ?? 'USD'

  return (
    <Shell section="Catalog">
      <CatalogView products={catalogProducts} protocols={(protocols ?? []) as ProductProtocol[]} baseCurrency={baseCurrency} />
    </Shell>
  )
}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/app/catalog/page.tsx
git commit -m "feat: load product_media in catalog page"
```

---

## Task 5: Catalog Media Section UI

**Files:**
- Modify: `src/components/catalog/CatalogView.tsx`
- Modify: `styles/catalog.css`

- [ ] **Step 1: Add import for new actions in `CatalogView.tsx`**

Find the existing import line:
```typescript
import { createProduct, createBatch, saveBatchCoaPath, upsertProtocol, updateProduct, updateBatch, deleteBatch } from '@/app/catalog/actions'
```

Replace with:
```typescript
import { createProduct, createBatch, saveBatchCoaPath, upsertProtocol, updateProduct, updateBatch, deleteBatch, createProductMedia, saveProductMediaPath, deleteProductMedia } from '@/app/catalog/actions'
import type { ProductMediaItem } from '@/types/catalog'
```

- [ ] **Step 2: Add `ProductMediaSection` component**

Add this component before the `CatalogDetail` function (around line 329):

```typescript
function ProductMediaSection({ productId, media }: { productId: string; media: ProductMediaItem[] }) {
  const [items, setItems] = useState<ProductMediaItem[]>(media)
  const [pendingFile, setPendingFile] = useState<{ file: File; type: 'image' | 'video' } | null>(null)
  const [labelInput, setLabelInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})

  // Fetch signed URLs for image thumbnails
  useEffect(() => {
    const images = items.filter(m => m.type === 'image' && !thumbnailUrls[m.id])
    if (images.length === 0) return
    Promise.all(
      images.map(async m => {
        const res = await fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(m.storage_path)}`)
        if (!res.ok) return null
        const { url } = await res.json() as { url: string }
        return { id: m.id, url }
      })
    ).then(results => {
      const updates: Record<string, string> = {}
      for (const r of results) { if (r) updates[r.id] = r.url }
      setThumbnailUrls(prev => ({ ...prev, ...updates }))
    })
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') {
    const file = e.target.files?.[0]
    if (!file) return
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
    setLabelInput(baseName)
    setPendingFile({ file, type })
    e.target.value = ''
  }

  async function upload() {
    if (!pendingFile || !labelInput.trim()) return
    setUploading(true)
    setUploadError('')
    try {
      const ext = pendingFile.file.name.split('.').pop() ?? (pendingFile.type === 'image' ? 'jpg' : 'mp4')
      const result = await createProductMedia(productId, labelInput.trim(), pendingFile.type, ext)
      if ('error' in result) { setUploadError(result.error); return }
      const putRes = await fetch(result.uploadUrl, {
        method: 'PUT',
        body: pendingFile.file,
        headers: { 'Content-Type': pendingFile.file.type },
      })
      if (!putRes.ok) { setUploadError('Upload failed — please try again'); return }
      const saveResult = await saveProductMediaPath(result.id, result.storagePath)
      if ('error' in saveResult) { setUploadError(saveResult.error); return }
      const newItem: ProductMediaItem = {
        id: result.id,
        label: labelInput.trim(),
        type: pendingFile.type,
        storage_path: result.storagePath,
        sort_order: items.length,
      }
      setItems(prev => [...prev, newItem])
      setPendingFile(null)
      setLabelInput('')
    } finally {
      setUploading(false)
    }
  }

  async function openItem(item: ProductMediaItem) {
    const res = await fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(item.storage_path)}`)
    if (!res.ok) return
    const { url } = await res.json() as { url: string }
    window.open(url, '_blank', 'noopener')
  }

  async function confirmDelete(item: ProductMediaItem) {
    const result = await deleteProductMedia(item.id, item.storage_path)
    if ('error' in result) return
    setItems(prev => prev.filter(m => m.id !== item.id))
    setThumbnailUrls(prev => { const n = { ...prev }; delete n[item.id]; return n })
    setConfirmDeleteId(null)
  }

  return (
    <section className="pt-card pt-cat-section">
      <header className="pt-card-hd">
        <div>
          <h3>Media</h3>
          <p>{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => onFilePick(e, 'image')} />
          <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" style={{ display: 'none' }} onChange={e => onFilePick(e, 'video')} />
          <button className="pt-link" onClick={() => imageInputRef.current?.click()}>+ Image</button>
          <button className="pt-link" onClick={() => videoInputRef.current?.click()}>+ Video</button>
        </div>
      </header>

      {pendingFile && (
        <div className="pt-media-upload-row">
          <div className="pt-media-upload-icon">{pendingFile.type === 'image' ? '🖼' : '▶'}</div>
          <div className="pt-media-upload-info">
            <div style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginBottom: 4 }}>{pendingFile.file.name}</div>
            <input
              className="pt-input"
              style={{ fontSize: 12, padding: '4px 8px', height: 'auto' }}
              placeholder="Label…"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="pt-btn pt-btn-primary" style={{ fontSize: 11 }} onClick={() => void upload()} disabled={uploading || !labelInput.trim()}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={() => { setPendingFile(null); setLabelInput(''); setUploadError('') }}>Cancel</button>
          </div>
          {uploadError && <div className="pt-media-upload-error">{uploadError}</div>}
        </div>
      )}

      {items.length === 0 && !pendingFile ? (
        <div className="pt-media-empty">
          <div className="pt-media-empty-icon">◈</div>
          <div style={{ fontSize: 12, color: 'var(--pt-fg-4)' }}>No media yet — upload an image or video</div>
        </div>
      ) : (
        <div className="pt-media-grid">
          {items.map(item => (
            <div key={item.id} className="pt-media-tile">
              <button className="pt-media-tile-thumb" onClick={() => void openItem(item)} title={`Open ${item.label}`}>
                {item.type === 'image' && thumbnailUrls[item.id] ? (
                  <img src={thumbnailUrls[item.id]} alt={item.label} className="pt-media-thumb-img" />
                ) : (
                  <div className="pt-media-thumb-video">
                    <span className="pt-media-play-icon">▶</span>
                  </div>
                )}
              </button>
              <div className="pt-media-tile-label">{item.label}</div>
              {confirmDeleteId === item.id ? (
                <div className="pt-media-tile-confirm">
                  <span style={{ fontSize: 10, color: 'var(--pt-fg-3)' }}>Delete?</span>
                  <button className="pt-link" style={{ fontSize: 10, color: 'var(--pt-danger, oklch(0.55 0.22 25))' }} onClick={() => void confirmDelete(item)}>Yes</button>
                  <button className="pt-link" style={{ fontSize: 10 }} onClick={() => setConfirmDeleteId(null)}>No</button>
                </div>
              ) : (
                <button className="pt-media-tile-del" onClick={() => setConfirmDeleteId(item.id)} title="Delete">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Add `ProductMediaSection` to `CatalogDetail`**

In `CatalogDetail`, after the `<ProtocolSection>` line (around line 661) and before `{showSendModal && ...}`, add:

```tsx
<ProductMediaSection productId={product.id} media={product.media} />
```

- [ ] **Step 4: Add CSS to `styles/catalog.css`**

Append to the end of `styles/catalog.css`:

```css
/* ── Product Media Section ───────────────────────────────────────────────── */
.pt-media-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 12px 14px 14px;
}
.pt-media-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pt-media-tile-thumb {
  aspect-ratio: 4/3;
  border-radius: var(--pt-radius-sm);
  border: 0.5px solid var(--pt-line);
  overflow: hidden;
  cursor: pointer;
  background: var(--pt-bg-side);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0;
  transition: border-color 0.12s;
}
.pt-media-tile-thumb:hover { border-color: oklch(from var(--pt-fg) l c h / 0.3); }
.pt-media-thumb-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pt-media-thumb-video {
  width: 100%; height: 100%;
  background: oklch(from var(--pt-fg) l c h / 0.08);
  display: flex; align-items: center; justify-content: center;
}
.pt-media-play-icon { font-size: 20px; color: var(--pt-fg-3); opacity: 0.7; }
.pt-media-tile-label {
  font-size: 11px;
  color: var(--pt-fg-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pt-media-tile-del {
  position: absolute;
  top: 4px; right: 4px;
  background: var(--pt-surface);
  border: 0.5px solid var(--pt-line);
  border-radius: 4px;
  width: 18px; height: 18px;
  font-size: 9px;
  cursor: pointer;
  color: var(--pt-fg-4);
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s;
}
.pt-media-tile:hover .pt-media-tile-del { opacity: 1; }
.pt-media-tile-del:hover { color: var(--pt-fg); }
.pt-media-tile-confirm {
  position: absolute;
  top: 4px; right: 4px;
  background: var(--pt-surface);
  border: 0.5px solid var(--pt-line);
  border-radius: 4px;
  padding: 2px 6px;
  display: flex; align-items: center; gap: 5px;
}
.pt-media-empty {
  padding: 28px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.pt-media-empty-icon { font-size: 24px; opacity: 0.3; }
.pt-media-upload-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 0.5px solid var(--pt-line-soft);
  flex-wrap: wrap;
}
.pt-media-upload-icon { font-size: 20px; flex-shrink: 0; }
.pt-media-upload-info { flex: 1; min-width: 160px; }
.pt-media-upload-error { width: 100%; font-size: 11px; color: var(--pt-danger, oklch(0.55 0.22 25)); }
```

- [ ] **Step 5: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/components/catalog/CatalogView.tsx styles/catalog.css
git commit -m "feat: ProductMediaSection — upload, thumbnail grid, delete in catalog detail"
```

---

## Task 6: ProductInfoPicker — Media Card + Rename Callback

**Files:**
- Modify: `src/components/inbox/ProductInfoPicker.tsx`
- Modify: `src/components/inbox/InboxView.tsx`

**Context:** The composer currently has `onAttachCoa(storagePath)`. We rename to `onAttachFile(storagePath, label, bucket)`. The `pendingCoaPath` state in `InboxView` becomes `pendingAttachment: { storagePath, label, bucket } | null`. The chip shows `attachment.label`.

- [ ] **Step 1: Update `ProductInfoPicker.tsx`**

Replace the entire file with an updated version that:
1. Renames `onAttachCoa` → `onAttachFile(storagePath: string, label: string, bucket: 'coa' | 'product-media')`
2. Adds `product.media` to the picker product type
3. Fetches `product_media` in the Supabase query
4. Adds a "Media" toggle card that expands to a single-select thumbnail grid

Replace these sections:

**Props type** (find `onAttachCoa` and change):
```typescript
export function ProductInfoPicker({
  onInsert,
  onAttachFile,
  onClose,
}: {
  onInsert: (text: string) => void
  onAttachFile: (storagePath: string, label: string, bucket: 'coa' | 'product-media') => void
  onClose: () => void
})
```

**PickerProduct type** — add `media`:
```typescript
type PickerProduct = {
  id: string
  name: string
  sku: string
  product_family: string
  description: string | null
  resources: Resource[]
  protocol: ProductProtocol | null
  coa_path: string | null
  media: ProductMediaItem[]
}
```

Add import: `import type { ProductMediaItem } from '@/types/catalog'`

**Supabase query** — add `product_media` to select:
```typescript
supabase
  .from('products')
  .select(`
    id, name, sku, product_family, description, resources,
    product_protocols(id, tenant_id, product_id, vial_strength, reconstitution_ml, draw_volume_ml, frequency, timing, cycle_length_weeks, storage, notes, created_at, updated_at),
    batches(coa_path),
    product_media(id, label, type, storage_path, sort_order)
  `)
  .eq('is_active', true)
  .order('name')
  .then(({ data }) => {
    if (!data) return
    setProducts(
      (data as Record<string, unknown>[]).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        sku: p.sku as string,
        product_family: p.product_family as string,
        description: p.description as string | null,
        resources: (p.resources as Resource[]) ?? [],
        protocol:
          Array.isArray(p.product_protocols) && p.product_protocols.length > 0
            ? (p.product_protocols[0] as ProductProtocol)
            : null,
        coa_path:
          Array.isArray(p.batches)
            ? ((p.batches as Record<string, unknown>[]).find(b => b.coa_path)?.coa_path as string | null) ?? null
            : null,
        media: Array.isArray(p.product_media)
          ? (p.product_media as ProductMediaItem[]).filter(m => m.storage_path)
          : [],
      }))
    )
  })
```

**State for selected media item:**
```typescript
const [selectedMedia, setSelectedMedia] = useState<ProductMediaItem | null>(null)
const [mediaThumbnails, setMediaThumbnails] = useState<Record<string, string>>({})
```

**Fetch thumbnails when product selected:**
```typescript
useEffect(() => {
  if (!selected || selected.media.length === 0) return
  const images = selected.media.filter(m => m.type === 'image' && !mediaThumbnails[m.id])
  if (images.length === 0) return
  Promise.all(
    images.map(async m => {
      const res = await fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(m.storage_path)}`)
      if (!res.ok) return null
      const { url } = await res.json() as { url: string }
      return { id: m.id, url }
    })
  ).then(results => {
    const updates: Record<string, string> = {}
    for (const r of results) { if (r) updates[r.id] = r.url }
    setMediaThumbnails(prev => ({ ...prev, ...updates }))
  })
}, [selected]) // eslint-disable-line react-hooks/exhaustive-deps
```

**handleAttachCoa rename + handleAttachMedia:**
```typescript
function handleAttachCoa() {
  if (selected?.coa_path) {
    onAttachFile(selected.coa_path, 'COA PDF', 'coa')
    onClose()
  }
}

function handleAttachMedia() {
  if (selectedMedia) {
    onAttachFile(selectedMedia.storage_path, selectedMedia.label, 'product-media')
    onClose()
  }
}
```

**Media toggle card** — add after the resources toggle card, inside `{selected && ...}`:

```tsx
{selected.media.length > 0 && (
  <button
    className={`pt-pip-toggle${selectedMedia ? ' is-on' : ''}`}
    onClick={() => setSelectedMedia(selectedMedia ? null : selected.media[0])}
  >
    <span className="pt-pip-toggle-icon">◈</span>
    <div className="pt-pip-toggle-info">
      <div className="pt-pip-toggle-name">Media</div>
      <div className="pt-pip-toggle-hint">
        {selected.media.length} item{selected.media.length !== 1 ? 's' : ''}
        {selectedMedia ? ` · ${selectedMedia.label} selected` : ' · tap to pick one'}
      </div>
    </div>
    <span className="pt-pip-toggle-check">{selectedMedia ? '✓' : '+'}</span>
  </button>
)}

{selected.media.length > 0 && (
  <div className="pt-pip-media-grid">
    {selected.media.map(m => (
      <button
        key={m.id}
        className={`pt-pip-media-tile${selectedMedia?.id === m.id ? ' is-selected' : ''}`}
        onClick={() => setSelectedMedia(prev => prev?.id === m.id ? null : m)}
        title={m.label}
      >
        {m.type === 'image' && mediaThumbnails[m.id] ? (
          <img src={mediaThumbnails[m.id]} alt={m.label} className="pt-pip-media-img" />
        ) : (
          <div className="pt-pip-media-video"><span style={{ fontSize: 14 }}>▶</span></div>
        )}
        <div className="pt-pip-media-label">{m.label}</div>
      </button>
    ))}
  </div>
)}
```

**Actions** — update to show "Attach media" button when media selected:
```tsx
<div className="pt-pip-actions">
  {selected.coa_path && (
    <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={handleAttachCoa}>
      Attach COA PDF
    </button>
  )}
  {selectedMedia && (
    <button className="pt-btn pt-btn-ghost" style={{ fontSize: 11 }} onClick={handleAttachMedia}>
      Attach {selectedMedia.label} →
    </button>
  )}
  <button
    className="pt-btn pt-btn-primary"
    style={{ fontSize: 11 }}
    onClick={handleInsert}
    disabled={!preview}
  >
    Insert into message →
  </button>
</div>
```

- [ ] **Step 2: Add CSS for media grid inside picker to `styles/inbox.css`**

Append after the existing `.pt-pip-actions` block:

```css
/* ── ProductInfoPicker media grid ────────────────────────────────────────── */
.pt-pip-media-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 0 20px 6px;
}
.pt-pip-media-tile {
  display: flex;
  flex-direction: column;
  gap: 3px;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
  border-radius: var(--pt-radius-sm);
  overflow: hidden;
  outline: 2.5px solid transparent;
  outline-offset: 2px;
  transition: outline-color 0.12s;
}
.pt-pip-media-tile.is-selected { outline-color: var(--pt-accent); }
.pt-pip-media-img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: var(--pt-radius-sm); display: block; }
.pt-pip-media-video {
  aspect-ratio: 4/3;
  background: oklch(from var(--pt-fg) l c h / 0.08);
  border-radius: var(--pt-radius-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--pt-fg-3);
}
.pt-pip-media-label {
  font-size: 10px;
  color: var(--pt-fg-4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}
```

- [ ] **Step 3: Update `InboxView.tsx`**

**a) Change `pendingCoaPath` state to `pendingAttachment`:**

Find:
```typescript
const [pendingCoaPath, setPendingCoaPath] = useState<string | null>(null)
```

Replace with:
```typescript
const [pendingAttachment, setPendingAttachment] = useState<{ storagePath: string; label: string; bucket: 'coa' | 'product-media' } | null>(null)
```

**b) Rename `sendCoa` → `sendAttachment` and update it:**

Find the `sendCoa` function and replace:
```typescript
const sendAttachment = useCallback(async () => {
  if (!pendingAttachment || !activeId) return
  setIsUploading(true)
  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: activeId,
        storagePath: pendingAttachment.storagePath,
        bucket: pendingAttachment.bucket,
      }),
    })
    if (!res.ok) {
      console.error('Attachment send failed:', res.status)
      return
    }
    setPendingAttachment(null)
  } finally {
    setIsUploading(false)
  }
}, [pendingAttachment, activeId])
```

**c) Update `sendTextThenCoa` → `sendTextThenAttachment`:**
```typescript
const sendTextThenAttachment = useCallback(async () => {
  if (draft.trim()) {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: activeId, content: draft }),
    })
    if (!res.ok) return
    setDraft('')
  }
  await sendAttachment()
}, [draft, activeId, sendAttachment])
```

**d) Update `onKey` handler** — replace `pendingCoaPath` references:
Find the `onKey` function that references `pendingCoaPath` and update to `pendingAttachment`.

**e) Update the chip preview** — find the `{pendingCoaPath && ...}` block and replace:
```tsx
{pendingAttachment && (
  <div className="pt-composer-photo-preview">
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icons.doc size={16} />
      <span style={{ fontSize: 12, fontWeight: 500 }}>{pendingAttachment.label}</span>
    </div>
    {!isUploading && (
      <button className="pt-composer-photo-clear" onClick={() => setPendingAttachment(null)} title="Remove">✕</button>
    )}
    {isUploading && <span className="pt-composer-photo-status">Sending…</span>}
  </div>
)}
```

**f) Update `onAttachCoa` in the `ProductInfoPicker` render:**
```tsx
{showProductPicker && (
  <ProductInfoPicker
    onInsert={(text) => {
      setDraft(d => d ? `${d}\n\n${text}` : text)
      setShowProductPicker(false)
    }}
    onAttachFile={(storagePath, label, bucket) => {
      setPendingAttachment({ storagePath, label, bucket })
      setShowProductPicker(false)
    }}
    onClose={() => setShowProductPicker(false)}
  />
)}
```

**g) Update the Send button** — replace `pendingCoaPath` references in the onClick and disabled:
```tsx
onClick={() => {
  if (pendingFile) void sendPhoto()
  else if (pendingInvoicePath) void sendInvoice()
  else if (pendingAttachment) void sendTextThenAttachment()
  else send()
}}
disabled={
  pendingFile ? isUploading
  : pendingInvoicePath ? isUploading
  : pendingAttachment ? isUploading
  : (!draft.trim() || isSending)
}
```

- [ ] **Step 4: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/components/inbox/ProductInfoPicker.tsx src/components/inbox/InboxView.tsx styles/inbox.css
git commit -m "feat: media picker in ProductInfoPicker, rename onAttachCoa to onAttachFile"
```

---

## Task 7: ProductSendModal — Media Grid + Two-Send Flow

**Files:**
- Modify: `src/components/catalog/ProductSendModal.tsx`

- [ ] **Step 1: Update `ProductSendModal.tsx`**

Add `selectedMedia` state and media grid. Update the `send` function to handle two sequential POSTs.

**Add import:**
```typescript
import type { ProductMediaItem } from '@/types/catalog'
```

**Add `selectedMedia` state** (after `sent` state):
```typescript
const [selectedMedia, setSelectedMedia] = useState<ProductMediaItem | null>(null)
const [mediaThumbnails, setMediaThumbnails] = useState<Record<string, string>>({})
```

**Fetch thumbnails** (add useEffect after the conversation search useEffect):
```typescript
useEffect(() => {
  if (product.media.length === 0) return
  const images = product.media.filter(m => m.type === 'image' && !mediaThumbnails[m.id])
  if (images.length === 0) return
  Promise.all(
    images.map(async m => {
      const res = await fetch(`/api/catalog/file-url?bucket=product-media&path=${encodeURIComponent(m.storage_path)}`)
      if (!res.ok) return null
      const { url } = await res.json() as { url: string }
      return { id: m.id, url }
    })
  ).then(results => {
    const updates: Record<string, string> = {}
    for (const r of results) { if (r) updates[r.id] = r.url }
    setMediaThumbnails(prev => ({ ...prev, ...updates }))
  })
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

**Update `send` function** to support two sequential POSTs:
```typescript
const send = useCallback(async () => {
  if (!selected || (!preview && !selectedMedia)) return
  setSending(true)
  setError('')
  try {
    if (preview) {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, content: preview }),
      })
      if (!res.ok) { setError('Failed to send message — please try again'); return }
    }
    if (selectedMedia) {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selected.id,
          storagePath: selectedMedia.storage_path,
          bucket: 'product-media',
        }),
      })
      if (!res.ok) { setError('Message sent but media failed — please try again'); return }
    }
    setSent(true)
    setTimeout(onClose, 1400)
  } finally {
    setSending(false)
  }
}, [selected, preview, selectedMedia, onClose])
```

**Update button label:**
```typescript
const hasText = !!preview
const hasMedia = !!selectedMedia
const sendLabel = sending ? 'Sending…'
  : sent ? 'Sent ✓'
  : hasText && hasMedia ? 'Send message + media →'
  : 'Send →'
```

**Add media section** — insert after the content toggles section, before the preview section:

```tsx
{product.media.length > 0 && (
  <div className="pt-psm-section">
    <div className="pt-psm-label">
      Media · {product.media.length} item{product.media.length !== 1 ? 's' : ''}
    </div>
    <div className="pt-pip-media-grid" style={{ padding: 0 }}>
      {product.media.map(m => (
        <button
          key={m.id}
          className={`pt-pip-media-tile${selectedMedia?.id === m.id ? ' is-selected' : ''}`}
          onClick={() => setSelectedMedia(prev => prev?.id === m.id ? null : m)}
          title={m.label}
        >
          {m.type === 'image' && mediaThumbnails[m.id] ? (
            <img src={mediaThumbnails[m.id]} alt={m.label} className="pt-pip-media-img" />
          ) : (
            <div className="pt-pip-media-video"><span style={{ fontSize: 14 }}>▶</span></div>
          )}
          <div className="pt-pip-media-label">{m.label}</div>
        </button>
      ))}
    </div>
  </div>
)}
```

**Update Send button disabled state** to allow sending when only media (no text) selected:
```tsx
disabled={!selected || (!preview && !selectedMedia) || sending || sent}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all unit tests**

```bash
npm run test:run -- src/lib/__tests__ src/app/api/catalog src/app/api/send
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/catalog/ProductSendModal.tsx
git commit -m "feat: media grid and two-send flow in ProductSendModal"
```

---

## Verification

**Upload flow:**
1. Go to `/catalog`, select any product
2. In the Media section, click "+ Image" — pick a JPEG — label input appears pre-filled
3. Edit label if desired → click Upload → tile appears in grid
4. Click tile → opens signed URL in new tab
5. Hover tile → ✕ button appears → click → confirm "Yes" → tile removed

**Composer send:**
1. Open inbox, open a WhatsApp conversation
2. Click the flask/product button in composer toolbar
3. Search for the product with media
4. "Media · N item(s)" toggle card appears — toggle it → thumbnail grid expands
5. Click a tile → it gets a green ring → "Attach [label] →" button appears
6. Click "Attach [label] →" → picker closes → chip shows the media label above the composer
7. Hit Send → media is sent as a WhatsApp message

**Catalog send:**
1. Go to `/catalog`, open a product with media
2. Click "Send info →"
3. Search for a customer, select them
4. Media grid appears at bottom — click a tile to select
5. Button reads "Send message + media →"
6. Click → text sent first, then media — modal closes
