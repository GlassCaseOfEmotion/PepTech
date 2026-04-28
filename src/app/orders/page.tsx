import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { OrdersView } from '@/components/orders/OrdersView'

export default async function OrdersPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  return <Shell section="Orders"><OrdersView /></Shell>
}
