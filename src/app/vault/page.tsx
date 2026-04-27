import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { VaultView } from '@/components/vault/VaultView'

export default async function VaultPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <Shell section="Vault"><VaultView /></Shell>
}
