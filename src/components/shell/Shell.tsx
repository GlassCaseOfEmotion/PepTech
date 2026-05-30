import { createClient, getServerUser } from '@/lib/supabase/server'
import { getQueuedRuns } from '@/app/automations/actions'
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
  let unreadCount = 0

  try {
    const user = await getServerUser()
    if (user) {
      const supabase = await createClient()
      const [{ data: userRow }, { data: channels }, { count }] = await Promise.all([
        supabase.from('users').select('display_name').eq('id', user.id).single(),
        supabase.from('tenant_channels').select('channel_type').eq('is_active', true),
        // BottomNav inbox-tab badge: count of unread, non-resolved conversations.
        // Server-rendered snapshot — same lifecycle as the previous pinned-derived count.
        supabase.from('conversations').select('id', { count: 'exact', head: true })
          .gt('unread_count', 0).neq('status', 'resolved'),
      ])
      displayName = userRow?.display_name ?? user.email?.split('@')[0] ?? 'User'
      connectedChannels = (channels ?? []).map((c) => c.channel_type)
      unreadCount = count ?? 0
    }
  } catch {
    // Render shell with defaults if data fetching fails
  }

  const queuedRuns = await getQueuedRuns().catch(() => [])
  const queuedCount = queuedRuns.length

  const rootClass = rightRail
    ? 'pt-root'
    : `pt-root no-right${isInbox ? ' is-inbox' : ''}`

  return (
    <div className={rootClass}>
      <GlobalNotifications />
      <AgentPalette />
      <CommandPalette />
      <ComposeModal />
      <Sidebar displayName={displayName} queuedCount={queuedCount} />
      <main className="pt-main">
        <TopBar section={section} connectedChannels={connectedChannels} />
        {children}
      </main>
      {rightRail}
      <BottomNav unreadCount={unreadCount} />
    </div>
  )
}
