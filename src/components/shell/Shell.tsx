import { createClient, getServerUser } from '@/lib/supabase/server'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { GlobalNotifications } from './GlobalNotifications'
import { AgentPalette } from './AgentPalette'
import { CommandPalette } from './CommandPalette'
import { ComposeModal } from './ComposeModal'
import { BottomNav } from './BottomNav'

interface ShellProps {
  children: React.ReactNode
  section?: string
  isInbox?: boolean
  rightRail?: React.ReactNode
}

export async function Shell({ children, section, isInbox = false, rightRail }: ShellProps) {
  let displayName = 'User'
  let connectedChannels: string[] = []

  let pinnedConversations: import('@/types/inbox').DbConversation[] = []

  try {
    const user = await getServerUser()
    if (user) {
      const supabase = await createClient()
      const [{ data: userRow }, { data: channels }, { data: pinned }] = await Promise.all([
        supabase.from('users').select('display_name').eq('id', user.id).single(),
        supabase.from('tenant_channels').select('channel_type').eq('is_active', true),
        supabase
          .from('conversations')
          .select(`
            id, status, unread_count, last_message_at, last_message_snippet,
            channel_type, channel_identifier, is_pinned,
            customers (
              id, display_name, trust_score, ltv,
              customer_tags (tag),
              customer_channels (channel_type, display_handle, is_primary)
            )
          `)
          .eq('is_pinned', true)
          .order('last_message_at', { ascending: false, nullsFirst: false }),
      ])
      displayName = userRow?.display_name ?? user.email?.split('@')[0] ?? 'User'
      connectedChannels = (channels ?? []).map((c) => c.channel_type)
      pinnedConversations = (pinned ?? []) as import('@/types/inbox').DbConversation[]
    }
  } catch {
    // Render shell with defaults if data fetching fails
  }

  const unreadCount = pinnedConversations.filter(
    (c: { unread_count: number }) => c.unread_count > 0
  ).length

  const rootClass = rightRail
    ? 'pt-root'
    : `pt-root no-right${isInbox ? ' is-inbox' : ''}`

  return (
    <div className={rootClass}>
      <GlobalNotifications />
      <AgentPalette />
      <CommandPalette />
      <ComposeModal />
      <Sidebar displayName={displayName} initialPinned={pinnedConversations} />
      <main className="pt-main">
        <TopBar section={section} connectedChannels={connectedChannels} />
        {children}
      </main>
      {rightRail}
      <BottomNav unreadCount={unreadCount} />
    </div>
  )
}
