import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CatalogView } from '@/components/catalog/CatalogView'

export default async function CatalogPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  return <Shell section="Catalog"><CatalogView /></Shell>
}
