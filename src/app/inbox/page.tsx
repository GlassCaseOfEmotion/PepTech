export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { InboxView } from '@/components/inbox/InboxView'
import type { DbConversation, DbQuickReply, DbTemplate } from '@/types/inbox'

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ conversation?: string; invoice_path?: string; invoice_name?: string; prefill?: string }> }) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const { conversation: initialConversationId, invoice_path: initialInvoicePath, invoice_name: initialInvoiceName, prefill: initialPrefill } = await searchParams
  const supabase = await createClient()

  const [{ data: conversations }, { data: quickReplies }, { data: templates }, { count: resolvedCount }, { data: tenantRow }, { count: channelCount }] = await Promise.all([
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
    supabase
      .from('templates')
      .select('id, tenant_id, title, content, sort_order')
      .order('sort_order'),
    supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'resolved'),
    supabase.from('tenants').select('base_currency').single(),
    supabase.from('tenant_channels').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ])
  const baseCurrency = (tenantRow?.base_currency as string | null) ?? 'USD'

  return (
    <InboxView
      initialConversations={(conversations ?? []) as DbConversation[]}
      quickReplies={(quickReplies ?? []) as DbQuickReply[]}
      templates={(templates ?? []) as DbTemplate[]}
      initialResolvedCount={resolvedCount ?? 0}
      initialActiveId={initialConversationId}
      initialInvoicePath={initialInvoicePath}
      initialInvoiceName={initialInvoiceName}
      initialPrefill={initialPrefill}
      baseCurrency={baseCurrency}
      hasChannels={(channelCount ?? 0) > 0}
    />
  )
}
