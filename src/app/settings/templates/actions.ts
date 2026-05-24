'use server'
import { cache } from 'react'

import { createClient, getServerUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createTemplate(formData: FormData) {
  const title = (formData.get('title') as string)?.trim()
  const content = (formData.get('content') as string)?.trim()
  if (!title || !content) return { error: 'Title and content are required' }

  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'User not found' }

  const { error } = await supabase.from('templates').insert({
    tenant_id: userRow.tenant_id,
    title,
    content,
    sort_order: Date.now(),
  })
  if (error) return { error: error.message }
  revalidatePath('/settings/templates')
  return { success: true }
}

export async function updateTemplate(formData: FormData) {
  const id = (formData.get('id') as string)?.trim()
  const title = (formData.get('title') as string)?.trim()
  const content = (formData.get('content') as string)?.trim()
  const isPlatform = formData.get('isPlatform') === 'true'
  if (!id || !title || !content) return { error: 'Missing fields' }

  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'User not found' }

  if (isPlatform) {
    const { error } = await supabase.from('templates').insert({
      tenant_id: userRow.tenant_id,
      title,
      content,
      sort_order: Date.now(),
    })
    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('hide_platform_template', { template_id: id })
  } else {
    const { error } = await supabase.from('templates').update({ title, content }).eq('id', id)
    if (error) return { error: error.message }
  }
  revalidatePath('/settings/templates')
  return { success: true }
}

export async function deleteTemplate(formData: FormData) {
  const id = (formData.get('id') as string)?.trim()
  if (!id) return { error: 'Missing id' }

  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('templates').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/settings/templates')
  return { success: true }
}
