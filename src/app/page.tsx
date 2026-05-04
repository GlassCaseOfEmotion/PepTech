import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/shell/DashboardLayout'
import { dbConversationToThread, type DbConversation } from '@/types/inbox'

const CONV_SELECT = `
  id, status, unread_count, last_message_at, last_message_snippet,
  channel_type, channel_identifier,
  customers (
    id, display_name, trust_score, ltv,
    customer_tags (tag),
    customer_channels (channel_type, display_handle, is_primary)
  )
`

export default async function Home() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [{ data: userRow }, { data: channels }, { data: conversations }] = await Promise.all([
    supabase.from('users').select('display_name').eq('id', user.id).single(),
    supabase.from('tenant_channels').select('channel_type').eq('is_active', true),
    supabase
      .from('conversations')
      .select(CONV_SELECT)
      .in('status', ['new', 'needs_reply', 'in_progress', 'snoozed'])
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50),
  ])

  const displayName = userRow?.display_name ?? user.email?.split('@')[0] ?? 'User'
  const connectedChannels = (channels ?? []).map(c => c.channel_type)
  const threads = (conversations ?? []).map(c => dbConversationToThread(c as unknown as DbConversation))

  return (
    <DashboardLayout
      displayName={displayName}
      connectedChannels={connectedChannels}
      threads={threads}
    />
  )
}
