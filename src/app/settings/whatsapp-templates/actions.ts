'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createWaTemplate(data: {
  name: string; body: string; variables: { key: string; label: string }[]
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'User not found' }
  const { error } = await supabase.from('whatsapp_templates').insert({ ...data, tenant_id: userRow.tenant_id })
  if (error) return { error: error.message }
  revalidatePath('/settings/whatsapp-templates')
  return {}
}

export async function updateWaTemplate(id: string, patch: {
  name?: string; body?: string; content_sid?: string; status?: string
  variables?: { key: string; label: string }[]
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('whatsapp_templates').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/settings/whatsapp-templates')
  return {}
}

export async function deleteWaTemplate(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/settings/whatsapp-templates')
  return {}
}
