'use server'

import { createClient } from '@/lib/supabase/server'
import { registerTelegramWebhook } from '@/lib/channels/telegram'
import { revalidatePath } from 'next/cache'

export async function saveTelegramCredentials(formData: FormData) {
  const botToken = (formData.get('botToken') as string)?.trim()
  if (!botToken) return { error: 'Bot token is required' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'User not found' }

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/telegram/${userRow.tenant_id}`

  try {
    await registerTelegramWebhook(botToken, webhookUrl)
  } catch (e) {
    return { error: `Could not register webhook: ${e instanceof Error ? e.message : 'unknown error'}` }
  }

  await supabase.from('tenant_channels').upsert({
    tenant_id: userRow.tenant_id,
    channel_type: 'telegram',
    identifier: 'telegram-bot',
    credentials: { bot_token: botToken },
    is_active: true,
  }, { onConflict: 'tenant_id,channel_type' })

  revalidatePath('/settings/channels')
  return { success: true }
}

export async function saveWhatsAppCredentials(formData: FormData) {
  const apiKey = (formData.get('apiKey') as string)?.trim()
  const phoneNumberId = (formData.get('phoneNumberId') as string)?.trim()
  const webhookSecret = (formData.get('webhookSecret') as string)?.trim()
  if (!apiKey || !phoneNumberId) return { error: 'API key and phone number ID are required' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'User not found' }

  await supabase.from('tenant_channels').upsert({
    tenant_id: userRow.tenant_id,
    channel_type: 'whatsapp',
    identifier: phoneNumberId,
    credentials: { api_key: apiKey, phone_number_id: phoneNumberId },
    webhook_secret: webhookSecret || null,
    is_active: true,
  }, { onConflict: 'tenant_id,channel_type' })

  revalidatePath('/settings/channels')
  return { success: true }
}

export async function disconnectChannel(channelType: 'whatsapp' | 'telegram' | 'email'): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return { error: 'User not found' }

  const { error } = await supabase.from('tenant_channels')
    .update({ is_active: false })
    .eq('tenant_id', userRow.tenant_id)
    .eq('channel_type', channelType)

  if (error) return { error: error.message }

  revalidatePath('/settings/channels')
  return { success: true as const }
}
