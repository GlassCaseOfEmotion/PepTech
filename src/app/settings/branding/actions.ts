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
    const extMap: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
    const ext = extMap[file.type] ?? 'png'
    const logoPath = `${tenantId}/logo.${ext}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadErr } = await supabase.storage
      .from('logos')
      .upload(logoPath, arrayBuffer, { contentType: file.type, upsert: true })
    if (uploadErr) return { error: uploadErr.message }

    const { error: dbErr } = await supabase.from('tenants').update({ logo_path: logoPath }).eq('id', tenantId)
    if (dbErr) return { error: dbErr.message }
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
    const { error: dbErr } = await supabase.from('tenants').update({ logo_path: null }).eq('id', tenantId)
    if (dbErr) return { error: dbErr.message }
    revalidatePath('/settings/branding')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
