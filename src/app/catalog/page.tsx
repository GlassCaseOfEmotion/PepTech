import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { CatalogView } from '@/components/catalog/CatalogView'

export default async function CatalogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <Shell section="Catalog"><CatalogView /></Shell>
}
