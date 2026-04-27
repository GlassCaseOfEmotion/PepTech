import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { BroadcastsView } from '@/components/broadcasts/BroadcastsView'

export default async function BroadcastsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <Shell section="Broadcasts"><BroadcastsView /></Shell>
}
