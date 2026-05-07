import { createClient, getServerUser } from '@/lib/supabase/server'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { GlobalNotifications } from './GlobalNotifications'

interface ShellProps {
  children: React.ReactNode
  section?: string
  isInbox?: boolean
  rightRail?: React.ReactNode
}

export async function Shell({ children, section, isInbox = false, rightRail }: ShellProps) {
  let displayName = 'User'
  let connectedChannels: string[] = []

  try {
    const user = await getServerUser()
    if (user) {
      const supabase = await createClient()
      const [{ data: userRow }, { data: channels }] = await Promise.all([
        supabase.from('users').select('display_name').eq('id', user.id).single(),
        supabase.from('tenant_channels').select('channel_type').eq('is_active', true),
      ])
      displayName = userRow?.display_name ?? user.email?.split('@')[0] ?? 'User'
      connectedChannels = (channels ?? []).map((c) => c.channel_type)
    }
  } catch {
    // Render shell with defaults if data fetching fails
  }

  const rootClass = rightRail
    ? 'pt-root'
    : `pt-root no-right${isInbox ? ' is-inbox' : ''}`

  return (
    <div className={rootClass}>
      <GlobalNotifications />
      <Sidebar displayName={displayName} />
      <main className="pt-main">
        <TopBar section={section} connectedChannels={connectedChannels} />
        {children}
      </main>
      {rightRail}
    </div>
  )
}
