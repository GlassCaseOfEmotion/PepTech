import { redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { CurrencyForm } from './CurrencyForm'

export default async function CurrencyPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  const { data: tenant } = await supabase
    .from('tenants').select('base_currency').eq('id', userRow!.tenant_id).single()

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>Currency</h2>
          <p>Base currency for order amounts and invoices.</p>
        </div>
      </div>
      <CurrencyForm baseCurrency={tenant?.base_currency ?? 'USD'} />
    </div>
  )
}
