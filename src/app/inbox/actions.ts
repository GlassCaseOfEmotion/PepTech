'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createOrFindConversation(
  customerId: string,
  channelType: string,
): Promise<{ conversationId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Get the customer's channel identifier for this channel type
  const { data: ch } = await supabase
    .from('customer_channels')
    .select('identifier')
    .eq('customer_id', customerId)
    .eq('channel_type', channelType)
    .maybeSingle()

  if (!ch) return { error: `Customer has no ${channelType} channel` }

  // Reuse an existing open conversation if one exists
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('customer_id', customerId)
    .eq('channel_type', channelType)
    .in('status', ['new', 'needs_reply', 'in_progress', 'snoozed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return { conversationId: existing.id }

  // Create a new conversation
  const { data: userRow } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!userRow) return { error: 'User not found' }

  const { data: conv, error } = await supabase
    .from('conversations')
    .insert({
      tenant_id: userRow.tenant_id,
      customer_id: customerId,
      channel_type: channelType,
      channel_identifier: ch.identifier,
      status: 'new',
    })
    .select('id')
    .single()

  if (error || !conv) return { error: error?.message ?? 'Failed to create conversation' }

  revalidatePath('/inbox')
  revalidatePath('/')
  return { conversationId: conv.id }
}
