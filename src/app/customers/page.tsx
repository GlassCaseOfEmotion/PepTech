import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CustomersListView } from '@/components/customers/CustomersListView'

export default async function CustomersPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: customers } = await supabase
    .from('customers')
    .select('id, display_name, trust_score, ltv, customer_channels(channel_type, display_handle, is_primary), customer_tags(tag)')
    .order('created_at', { ascending: false })

  return (
    <Shell section="Customers">
      <CustomersListView customers={customers ?? []} />
    </Shell>
  )
}
