import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/shell/DashboardLayout'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRow } = await supabase.from('users').select('display_name').eq('id', user.id).single()
  const displayName = userRow?.display_name ?? user.email?.split('@')[0] ?? 'User'

  const { data: channels } = await supabase.from('tenant_channels').select('channel_type').eq('is_active', true)
  const connectedChannels = (channels ?? []).map(c => c.channel_type)

  return <DashboardLayout displayName={displayName} connectedChannels={connectedChannels} />
}
