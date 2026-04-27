import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { InboxView } from '@/components/inbox/InboxView'
import type { ConversationWithCustomer, MessageRow } from '@/types/inbox'
import type { QuickReply } from '@/components/inbox/Composer'

export default async function InboxConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, status, unread_count, last_message_at, last_message_snippet, channel_type, channel_identifier, customers(id, display_name, trust_score, ltv, customer_tags(tag))')
    .order('last_message_at', { ascending: false, nullsFirst: false })

  const { data: messages } = await supabase
    .from('messages')
    .select('id, direction, content, sent_at, status')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: true })
    .limit(50)

  const { data: userRow } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  const { data: quickReplies } = userRow
    ? await supabase
        .from('quick_replies')
        .select('id, label, content, sort_order')
        .eq('tenant_id', userRow.tenant_id)
        .order('sort_order')
    : { data: null }

  return (
    <Shell section="Inbox" isInbox>
      <InboxView
        initialConversations={(conversations ?? []) as ConversationWithCustomer[]}
        initialConversationId={conversationId}
        initialMessages={(messages ?? []) as MessageRow[]}
        quickReplies={(quickReplies ?? []) as QuickReply[]}
      />
    </Shell>
  )
}
