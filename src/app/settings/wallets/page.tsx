import { createClient } from '@/lib/supabase/server'
import { WalletsForm } from '@/components/settings/WalletsForm'
import type { TenantPaymentConfig } from '@/types/payments'

export default async function WalletsPage() {
  const supabase = await createClient()
  const { data: configs } = await supabase
    .from('tenant_payment_configs')
    .select('*')
    .order('created_at')
  return <WalletsForm configs={(configs ?? []) as TenantPaymentConfig[]} />
}
