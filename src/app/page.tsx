import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { DashboardView, DashboardRightRail } from '@/components/dashboard/DashboardView'
import { MOCK_THREADS } from '@/lib/mock-data'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <Shell section="Dashboard" rightRail={<DashboardRightRail focusThread={MOCK_THREADS[0]} />}>
      <DashboardView />
    </Shell>
  )
}
