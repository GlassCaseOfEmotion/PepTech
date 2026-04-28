import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { BroadcastsView } from '@/components/broadcasts/BroadcastsView'

export default async function BroadcastsPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  return <Shell section="Broadcasts"><BroadcastsView /></Shell>
}
