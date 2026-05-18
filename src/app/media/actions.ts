'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getTenantId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id as string }
}

export async function createMediaItem(
  label: string,
  type: 'image' | 'video' | 'pdf',
  ext: string,
  productId?: string,
): Promise<{ id: string; uploadUrl: string; storagePath: string } | { error: string }> {
  if (!label.trim()) return { error: 'Label is required' }
  if (!['image', 'video', 'pdf'].includes(type)) return { error: 'Invalid type' }
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5)
  if (!safeExt) return { error: 'Invalid file extension' }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { data: row, error: insertErr } = await supabase
      .from('media_items')
      .insert({ tenant_id: tenantId, label: label.trim(), type, storage_path: null })
      .select('id')
      .single()
    if (insertErr || !row) return { error: insertErr?.message ?? 'Insert failed' }

    const storagePath = `${tenantId}/${row.id}.${safeExt}`
    const { data: uploadData, error: urlErr } = await supabase.storage
      .from('product-media')
      .createSignedUploadUrl(storagePath)
    if (urlErr || !uploadData) {
      await supabase.from('media_items').delete().eq('id', row.id)
      return { error: urlErr?.message ?? 'Could not create upload URL' }
    }

    if (productId) {
      await supabase.from('media_product_tags').insert({
        media_item_id: row.id,
        product_id: productId,
        tenant_id: tenantId,
      })
    }

    return { id: row.id, uploadUrl: uploadData.signedUrl, storagePath }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function saveMediaItemPath(
  id: string,
  storagePath: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    if (!storagePath.startsWith(`${tenantId}/`)) return { error: 'Invalid path' }
    const { error } = await supabase
      .from('media_items')
      .update({ storage_path: storagePath })
      .eq('id', id)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/media')
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteMediaItem(
  id: string,
  storagePath: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    if (!storagePath.startsWith(`${tenantId}/`)) return { error: 'Invalid path' }
    const { error } = await supabase
      .from('media_items')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    const { error: storageErr } = await supabase.storage.from('product-media').remove([storagePath])
    if (storageErr) console.error('media storage removal failed:', storagePath, storageErr.message)
    revalidatePath('/media')
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateMediaItemLabel(
  id: string,
  label: string,
): Promise<{ success: true } | { error: string }> {
  if (!label.trim()) return { error: 'Label is required' }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase
      .from('media_items')
      .update({ label: label.trim() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/media')
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function tagMediaItemToProduct(
  mediaItemId: string,
  productId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('media_product_tags').insert({
      media_item_id: mediaItemId,
      product_id: productId,
      tenant_id: tenantId,
    })
    if (error && error.code !== '23505') return { error: error.message } // ignore duplicate
    revalidatePath('/media')
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function untagMediaItemFromProduct(
  mediaItemId: string,
  productId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase
      .from('media_product_tags')
      .delete()
      .eq('media_item_id', mediaItemId)
      .eq('product_id', productId)
      .eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/media')
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
