'use server'
import { cache } from 'react'

import { createClient, getServerUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { FREQUENCY_OPTIONS } from '@/types/protocols'
import type { Frequency } from '@/types/protocols'
import { createMediaItem, saveMediaItemPath, untagMediaItemFromProduct } from '@/app/media/actions'

const getTenantId = cache(async function getTenantId() {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) throw new Error('Unauthorized')
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) throw new Error('User not found')
  return { supabase, tenantId: userRow.tenant_id as string }
})

export async function createProduct(data: {
  sku: string
  name: string
  productFamily: string
  unitPrice: number
  costPrice?: number | null
  description?: string
}): Promise<{ success: true } | { error: string }> {
  const sku = data.sku.trim().toUpperCase()
  if (!sku) return { error: 'SKU is required' }
  if (sku.length > 32) return { error: 'SKU must be 32 characters or fewer' }
  if (!/^[A-Z0-9\-_]+$/.test(sku)) return { error: 'SKU may only contain letters, numbers, hyphens, and underscores' }
  if (!data.name.trim()) return { error: 'Name is required' }
  if (!data.productFamily.trim()) return { error: 'Product family is required' }
  if (data.unitPrice <= 0) return { error: 'Unit price must be greater than 0' }
  if (data.costPrice != null && data.costPrice < 0) return { error: 'Cost price cannot be negative' }

  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('products').insert({
      tenant_id: tenantId,
      sku,
      name: data.name.trim(),
      product_family: data.productFamily.trim(),
      unit_price: data.unitPrice,
      cost_price: data.costPrice ?? null,
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
    const { supabase, tenantId } = await getTenantId()
    if (!coaPath.startsWith(`${tenantId}/`)) return { error: 'Invalid COA path' }
    await supabase.from('batches').update({ coa_path: coaPath }).eq('id', batchId).eq('tenant_id', tenantId)
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function upsertProtocol(data: {
  productId: string
  vialStrength?: string
  reconstitutionMl: number
  reconstitutionSolvent?: string
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
  if (!FREQUENCY_OPTIONS.includes(data.frequency as Frequency)) {
    return { error: 'Invalid frequency value' }
  }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('product_protocols').upsert({
      tenant_id: tenantId,
      product_id: data.productId,
      vial_strength: data.vialStrength?.trim() || null,
      reconstitution_ml: data.reconstitutionMl,
      reconstitution_solvent: data.reconstitutionSolvent?.trim() || 'bacteriostatic water',
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

export async function updateProduct(
  productId: string,
  data: { name: string; sku: string; productFamily: string; unitPrice: number; costPrice: number | null; resources?: { label: string; url: string }[] }
): Promise<{ success: true } | { error: string }> {
  const sku = data.sku.trim().toUpperCase()
  if (!sku) return { error: 'SKU is required' }
  if (!data.name.trim()) return { error: 'Name is required' }
  if (!data.productFamily.trim()) return { error: 'Product family is required' }
  if (data.unitPrice <= 0) return { error: 'Unit price must be greater than 0' }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('products').update({
      sku,
      name: data.name.trim(),
      product_family: data.productFamily.trim(),
      unit_price: data.unitPrice,
      cost_price: data.costPrice ?? null,
      resources: data.resources ?? [],
    }).eq('id', productId).eq('tenant_id', tenantId)
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

export async function updateBatch(
  batchId: string,
  data: { stock: number; expiresAt: string | null }
): Promise<{ success: true } | { error: string }> {
  if (data.stock < 0) return { error: 'Stock cannot be negative' }
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('batches').update({
      stock: data.stock,
      expires_at: data.expiresAt || null,
    }).eq('id', batchId).eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteBatch(
  batchId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, tenantId } = await getTenantId()
    const { error } = await supabase.from('batches').delete()
      .eq('id', batchId).eq('tenant_id', tenantId)
    if (error) return { error: error.message }
    revalidatePath('/catalog')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function createProductMedia(
  productId: string,
  label: string,
  type: 'image' | 'video' | 'pdf',
  ext: string,
): Promise<{ id: string; uploadUrl: string; storagePath: string } | { error: string }> {
  return createMediaItem(label, type, ext, productId)
}

export async function saveProductMediaPath(
  id: string,
  storagePath: string,
): Promise<{ success: true } | { error: string }> {
  return saveMediaItemPath(id, storagePath)
}

export async function deleteProductMedia(
  mediaItemId: string,
  productId: string,
): Promise<{ success: true } | { error: string }> {
  return untagMediaItemFromProduct(mediaItemId, productId)
}
