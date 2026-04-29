export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { InboxView } from '@/components/inbox/InboxView'
import type { DbConversation, DbQuickReply } from '@/types/inbox'

export default async function InboxPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: conversations }, { data: quickReplies }] = await Promise.all([
    supabase
      .from('conversations')
      .select(`
        id, status, unread_count, last_message_at, last_message_snippet,
        channel_type, channel_identifier,
        customers (
          id, display_name, trust_score, ltv,
          customer_tags (tag),
          customer_channels (channel_type, display_handle, is_primary)
        )
      `)
      .in('status', ['new', 'needs_reply', 'in_progress', 'snoozed'])
      .order('last_message_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('quick_replies')
      .select('id, label, content, sort_order')
      .order('sort_order'),
  ])

  return (
    <Shell section="Inbox" isInbox>
      <InboxView
        initialConversations={(conversations ?? []) as DbConversation[]}
        quickReplies={(quickReplies ?? []) as DbQuickReply[]}
      />
    </Shell>
  )
}
