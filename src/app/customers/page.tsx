import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CustomersListView } from '@/components/customers/CustomersListView'

export default async function CustomersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <Shell section="Customers"><CustomersListView /></Shell>
}
