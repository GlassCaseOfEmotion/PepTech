import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CustomersListView } from '@/components/customers/CustomersListView'

export default async function CustomersPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  return <Shell section="Customers"><CustomersListView /></Shell>
}
