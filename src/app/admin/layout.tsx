import { redirect } from 'next/navigation'
import { getServerUser, createClient } from '@/lib/supabase/server'
import { AdminShell } from '@/components/admin/AdminShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: adminRow } = await supabase
    .from('platform_admins').select('id').eq('id', user.id).single()
  if (!adminRow) redirect('/')

  return <AdminShell>{children}</AdminShell>
}
