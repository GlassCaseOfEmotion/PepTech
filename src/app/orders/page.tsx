import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { OrdersView } from '@/components/orders/OrdersView'

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <Shell section="Orders"><OrdersView /></Shell>
}
