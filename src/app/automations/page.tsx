import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { AutomationsView } from '@/components/automations/AutomationsView'

export default async function AutomationsPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  return <Shell section="Automations"><AutomationsView /></Shell>
}
