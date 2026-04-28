import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/shell/DashboardLayout'

export default async function Home() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [{ data: userRow }, { data: channels }] = await Promise.all([
    supabase.from('users').select('display_name').eq('id', user.id).single(),
    supabase.from('tenant_channels').select('channel_type').eq('is_active', true),
  ])

  const displayName = userRow?.display_name ?? user.email?.split('@')[0] ?? 'User'
  const connectedChannels = (channels ?? []).map(c => c.channel_type)

  return <DashboardLayout displayName={displayName} connectedChannels={connectedChannels} />
}
