import { createClient } from '@/lib/supabase/server'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

interface ShellProps {
  children: React.ReactNode
  section?: string
  isInbox?: boolean
  rightRail?: React.ReactNode
}

export async function Shell({ children, section, isInbox = false, rightRail }: ShellProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let displayName = 'User'
  let connectedChannels: string[] = []

  if (user) {
    const { data: userRow } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .single()

    displayName = userRow?.display_name ?? user.email?.split('@')[0] ?? 'User'

    const { data: channels } = await supabase
      .from('tenant_channels')
      .select('channel_type')
      .eq('is_active', true)
    connectedChannels = (channels ?? []).map((c) => c.channel_type)
  }

  const rootClass = rightRail
    ? 'pt-root'
    : `pt-root no-right${isInbox ? ' is-inbox' : ''}`

  return (
    <div className={rootClass}>
      <Sidebar displayName={displayName} />
      <main className="pt-main">
        <TopBar section={section} connectedChannels={connectedChannels} />
        {children}
      </main>
      {rightRail}
    </div>
  )
}
