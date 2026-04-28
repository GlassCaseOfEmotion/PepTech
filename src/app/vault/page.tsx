import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { VaultView } from '@/components/vault/VaultView'

export default async function VaultPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  return <Shell section="Vault"><VaultView /></Shell>
}
