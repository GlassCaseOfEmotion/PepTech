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
