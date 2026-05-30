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
  let tenantName: string | null = null
  let tenantLogoUrl: string | null = null

  try {
    const user = await getServerUser()
    if (user) {
      const supabase = await createClient()
      const [{ data: userRow }, { data: channels }, { count }] = await Promise.all([
        // Embed the tenant row for the sidebar workspace mark (name + logo_path).
        supabase.from('users').select('display_name, tenants(name, logo_path)').eq('id', user.id).single(),
        supabase.from('tenant_channels').select('channel_type').eq('is_active', true),
        // BottomNav inbox-tab badge: count of unread, non-resolved conversations.
        // Server-rendered snapshot — same lifecycle as the previous pinned-derived count.
        supabase.from('conversations').select('id', { count: 'exact', head: true })
          .gt('unread_count', 0).neq('status', 'resolved'),
      ])
      displayName = userRow?.display_name ?? user.email?.split('@')[0] ?? 'User'
      connectedChannels = (channels ?? []).map((c) => c.channel_type)
      unreadCount = count ?? 0
      const tenant = (userRow as { tenants?: { name: string; logo_path: string | null } | null } | null)?.tenants ?? null
      tenantName = tenant?.name ?? null
      if (tenant?.logo_path) {
        // The 'logos' bucket is private — sign for the request window only.
        const { data: signed } = await supabase.storage.from('logos').createSignedUrl(tenant.logo_path, 3600)
        tenantLogoUrl = signed?.signedUrl ?? null
      }
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
      <Sidebar displayName={displayName} tenantName={tenantName} tenantLogoUrl={tenantLogoUrl} queuedCount={queuedCount} />
      <main className="pt-main">
        <TopBar section={section} connectedChannels={connectedChannels} />
        {children}
      </main>
      {rightRail}
      <BottomNav unreadCount={unreadCount} />
    </div>
  )
}
