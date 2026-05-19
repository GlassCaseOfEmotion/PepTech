import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import AutomationsView from '@/components/automations/AutomationsView'
import { getAutomations } from './actions'

// Automations page — WHEN→IF→THEN workflow builder
export default async function AutomationsPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  const automations = await getAutomations()
  return <Shell section="Automations"><AutomationsView automations={automations} /></Shell>
}
